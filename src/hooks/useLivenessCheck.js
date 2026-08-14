// hooks/useLivenessCheck.js
// Drives the MediaPipe Face Landmarker inference loop and the liveness phase
// state machine: centering -> calibrating (neutral baseline) -> challenge
// (turn left -> turn right, fixed order) -> passed/failed. The final Turn
// Right step's own sustain hold gates completion, so the frame is captured
// and face matching starts immediately once it's held - no separate
// re-centering phase after the challenge. Inference is throttled (~12fps)
// since detectForVideo() is synchronous and blocks the UI thread if run
// every requestAnimationFrame tick.
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFaceLandmarker } from '../utils/faceLandmarker';
import {
  decomposeYawPitchRoll,
  getBlinkScore,
  createChallengeSession,
  isChallengeValidForSession,
  THRESHOLDS
} from '../utils/livenessChallenge';

const TARGET_INFERENCE_INTERVAL_MS = 1000 / 12;
const SMOOTHING_WINDOW = 7;
const MIN_SAMPLES_FOR_SMOOTHING = 3;

const NO_FACE_FAIL_MS = 800;
const MULTI_FACE_FAIL_MS = 400;

const CENTERING_SUSTAIN_MS = 500;
const CENTERING_TIMEOUT_MS = 10000;
const BBOX_CENTER_X_RANGE = [0.3, 0.7];
const BBOX_CENTER_Y_RANGE = [0.2, 0.8];
const BBOX_WIDTH_RANGE = [0.15, 0.8];

const CALIBRATION_SUSTAIN_MS = 600;
const CALIBRATION_TIMEOUT_MS = 7000;
const CALIBRATION_STABILITY_DEG = 5;

const FAILURE_REASON_LABELS = {
  tracking_lost: 'No face detected.',
  multiple_faces: 'More than one face was detected.',
  centering_timeout: 'Could not get a centered, single face in view.',
  calibration_timeout: 'Could not hold a steady neutral pose.',
  session_mismatch: 'Verification session changed mid-check.',
  landmarker_error: 'Face tracking failed to start.'
};

const computeBBox = (landmarks) => {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (let i = 0; i < landmarks.length; i += 1) {
    const { x, y } = landmarks[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX
  };
};

const isBBoxCentered = (bbox) =>
  bbox.centerX > BBOX_CENTER_X_RANGE[0] &&
  bbox.centerX < BBOX_CENTER_X_RANGE[1] &&
  bbox.centerY > BBOX_CENTER_Y_RANGE[0] &&
  bbox.centerY < BBOX_CENTER_Y_RANGE[1] &&
  bbox.width > BBOX_WIDTH_RANGE[0] &&
  bbox.width < BBOX_WIDTH_RANGE[1];

export const useLivenessCheck = ({ videoRef, active, qrSessionId, onComplete, onDebug }) => {
  const [phase, setPhase] = useState('idle');
  const [instruction, setInstruction] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [failureReason, setFailureReason] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const rafRef = useRef(null);
  const landmarkerRef = useRef(null);
  const lastInferenceTimeRef = useRef(0);
  const completedRef = useRef(false);
  const phaseRef = useRef('idle');

  const noFaceSinceRef = useRef(null);
  const multiFaceSinceRef = useRef(null);

  const centeringStartRef = useRef(null);
  const centeringSustainStartRef = useRef(null);

  const bufferRef = useRef([]);
  const baselineRef = useRef(null);
  const calibratingStartRef = useRef(null);
  const calibrationSustainStartRef = useRef(null);
  const calibrationCandidateRef = useRef(null);

  const sequenceRef = useRef([]);
  const stepIndexRef = useRef(0);
  const actionStateRef = useRef(null);
  const stepStartTimeRef = useRef(null);
  const challengeSessionRef = useRef(null);

  const qrSessionIdRef = useRef(qrSessionId);
  const onCompleteRef = useRef(onComplete);
  const onDebugRef = useRef(onDebug);
  useEffect(() => { qrSessionIdRef.current = qrSessionId; }, [qrSessionId]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onDebugRef.current = onDebug; }, [onDebug]);

  const pushDebug = useCallback((message) => {
    onDebugRef.current?.(message);
  }, []);

  const complete = useCallback((result) => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    phaseRef.current = result.passed ? 'passed' : 'failed';
    setPhase(phaseRef.current);
    if (!result.passed) {
      setFailureReason(result.reason);
      pushDebug(`liveness failed: ${result.reason}`);
    } else {
      pushDebug(`liveness passed: ${result.sequenceIds.join(', ')}`);
    }
    onCompleteRef.current?.(result);
  }, [pushDebug]);

  const fail = useCallback((reason) => complete({ passed: false, reason }), [complete]);

  const pushSample = (sample) => {
    const buffer = bufferRef.current;
    buffer.push(sample);
    if (buffer.length > SMOOTHING_WINDOW) buffer.shift();
  };

  const getSmoothedSample = () => {
    const buffer = bufferRef.current;
    if (buffer.length < MIN_SAMPLES_FOR_SMOOTHING) return null;
    const sum = buffer.reduce(
      (acc, s) => ({
        yawDeg: acc.yawDeg + s.yawDeg,
        pitchDeg: acc.pitchDeg + s.pitchDeg,
        blinkScore: acc.blinkScore + s.blinkScore
      }),
      { yawDeg: 0, pitchDeg: 0, blinkScore: 0 }
    );
    return {
      yawDeg: sum.yawDeg / buffer.length,
      pitchDeg: sum.pitchDeg / buffer.length,
      blinkScore: sum.blinkScore / buffer.length
    };
  };

  const startStep = (now) => {
    const action = sequenceRef.current[stepIndexRef.current];
    actionStateRef.current = action.createState();
    stepStartTimeRef.current = now;
    phaseRef.current = 'challenge';
    setPhase('challenge');
    setInstruction(action.instruction);
    setStepIndex(stepIndexRef.current);
    setStepCount(sequenceRef.current.length);
    setProgressPercent((stepIndexRef.current / sequenceRef.current.length) * 100);
    pushDebug(`challenge step ${stepIndexRef.current + 1}/${sequenceRef.current.length}: ${action.id}`);
  };

  const advanceToChallenge = (now) => {
    const session = createChallengeSession(qrSessionIdRef.current);
    challengeSessionRef.current = session;
    sequenceRef.current = session.sequence;
    stepIndexRef.current = 0;
    startStep(now);
  };

  const finishChallenge = (now, video) => {
    if (!isChallengeValidForSession(challengeSessionRef.current, qrSessionIdRef.current)) {
      fail('session_mismatch');
      return;
    }
    setProgressPercent(100);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    pushDebug('challenge complete, proceeding to face match');
    complete({
      passed: true,
      canvas,
      challengeId: challengeSessionRef.current.challengeId,
      sequenceIds: sequenceRef.current.map((a) => a.id)
    });
  };

  const advanceToCalibrating = (now) => {
    phaseRef.current = 'calibrating';
    setPhase('calibrating');
    setInstruction('Look straight, relax your face');
    bufferRef.current = [];
    calibratingStartRef.current = now;
    calibrationSustainStartRef.current = null;
    calibrationCandidateRef.current = null;
    pushDebug('centered, calibrating neutral baseline');
  };

  const handleCentering = (bbox, now) => {
    if (centeringStartRef.current == null) centeringStartRef.current = now;
    setInstruction('Center your face in the circle');

    if (!isBBoxCentered(bbox)) {
      centeringSustainStartRef.current = null;
      if (now - centeringStartRef.current > CENTERING_TIMEOUT_MS) {
        fail('centering_timeout');
      }
      return;
    }

    if (centeringSustainStartRef.current == null) centeringSustainStartRef.current = now;
    if (now - centeringSustainStartRef.current >= CENTERING_SUSTAIN_MS) {
      advanceToCalibrating(now);
    }
  };

  const handleCalibrating = (smoothed, now) => {
    if (
      !calibrationCandidateRef.current ||
      Math.abs(smoothed.yawDeg - calibrationCandidateRef.current.yawDeg) >= CALIBRATION_STABILITY_DEG ||
      Math.abs(smoothed.pitchDeg - calibrationCandidateRef.current.pitchDeg) >= CALIBRATION_STABILITY_DEG
    ) {
      calibrationCandidateRef.current = smoothed;
      calibrationSustainStartRef.current = now;
    } else if (now - calibrationSustainStartRef.current >= CALIBRATION_SUSTAIN_MS) {
      baselineRef.current = { yawDeg: smoothed.yawDeg, pitchDeg: smoothed.pitchDeg };
      advanceToChallenge(now);
      return;
    }

    if (now - calibratingStartRef.current > CALIBRATION_TIMEOUT_MS) {
      fail('calibration_timeout');
    }
  };

  const handleChallenge = (smoothed, now, video) => {
    const action = sequenceRef.current[stepIndexRef.current];
    if (!action) return;

    const done = action.evaluate(actionStateRef.current, smoothed, baselineRef.current, now);

    if (done) {
      stepIndexRef.current += 1;
      if (stepIndexRef.current >= sequenceRef.current.length) {
        finishChallenge(now, video);
      } else {
        startStep(now);
      }
      return;
    }

    // Display-only smooth fill: fraction of the way through this step's
    // sustain hold (0 until the pose is actually past threshold and being
    // held). Doesn't affect action.evaluate()'s pass/fail decision above.
    const sustainSince = actionStateRef.current?.sustainSince;
    const holdFraction = sustainSince == null
      ? 0
      : Math.min(1, (now - sustainSince) / (action.sustainMs || 1));
    setProgressPercent(((stepIndexRef.current + holdFraction) / sequenceRef.current.length) * 100);
  };

  const processResult = (result, now, video) => {
    const faceCount = result.faceLandmarks?.length || 0;

    if (faceCount === 0) {
      if (noFaceSinceRef.current == null) noFaceSinceRef.current = now;
      multiFaceSinceRef.current = null;
      if (now - noFaceSinceRef.current > NO_FACE_FAIL_MS) fail('tracking_lost');
      return;
    }
    noFaceSinceRef.current = null;

    if (faceCount >= 2) {
      if (multiFaceSinceRef.current == null) multiFaceSinceRef.current = now;
      if (now - multiFaceSinceRef.current > MULTI_FACE_FAIL_MS) fail('multiple_faces');
      return;
    }
    multiFaceSinceRef.current = null;

    const landmarks = result.faceLandmarks[0];
    const matrixData = result.facialTransformationMatrixes?.[0]?.data;
    if (!matrixData) return;

    if (phaseRef.current === 'centering') {
      handleCentering(computeBBox(landmarks), now);
      return;
    }

    const { yawDeg, pitchDeg } = decomposeYawPitchRoll(matrixData);
    const blinkScore = getBlinkScore(result.faceBlendshapes?.[0]?.categories);
    pushSample({ yawDeg, pitchDeg, blinkScore });

    const smoothed = getSmoothedSample();
    if (!smoothed) return;

    if (phaseRef.current === 'calibrating') handleCalibrating(smoothed, now);
    else if (phaseRef.current === 'challenge') handleChallenge(smoothed, now, video);
  };

  const tick = useCallback(() => {
    if (completedRef.current) return;
    rafRef.current = requestAnimationFrame(tick);

    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const now = performance.now();
    if (now - lastInferenceTimeRef.current < TARGET_INFERENCE_INTERVAL_MS) return;
    lastInferenceTimeRef.current = now;

    const landmarker = landmarkerRef.current;
    if (!landmarker) return;

    let result;
    try {
      result = landmarker.detectForVideo(video, now);
    } catch {
      return;
    }
    processResult(result, now, video);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef]);

  useEffect(() => {
    if (!active) return undefined;

    completedRef.current = false;
    phaseRef.current = 'loading';
    setPhase('loading');
    setInstruction('Preparing face check...');
    setFailureReason('');
    setProgressPercent(0);
    centeringStartRef.current = null;
    centeringSustainStartRef.current = null;
    bufferRef.current = [];

    let cancelled = false;

    loadFaceLandmarker()
      .then((landmarker) => {
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        phaseRef.current = 'centering';
        setPhase('centering');
        rafRef.current = requestAnimationFrame(tick);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load face landmarker:', error);
        fail('landmarker_error');
      });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return {
    phase,
    instruction,
    stepIndex,
    stepCount,
    progressPercent,
    failureLabel: FAILURE_REASON_LABELS[failureReason] || '',
    thresholds: THRESHOLDS
  };
};
