// utils/livenessChallenge.js
// Pure liveness-challenge logic (no React). Consumes already-smoothed per-tick
// samples produced by useLivenessCheck's rolling window and decides whether a
// challenge action / neutral pose is currently satisfied.

// --- Head-pose extraction -------------------------------------------------

// MediaPipe's facialTransformationMatrixes[i].data is a column-major 4x4
// (16-value) rotation+translation matrix, the same convention used by
// Three.js's Matrix4. Decomposing it as a 'YXZ' Euler (the standard order for
// head-pose: yaw first, then pitch, then roll) is a generic linear-algebra
// formula, not tied to any single library.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const RAD_TO_DEG = 180 / Math.PI;

export const decomposeYawPitchRoll = (matrixData) => {
  const m13 = matrixData[8];
  const m23 = matrixData[9];
  const m33 = matrixData[10];
  const m21 = matrixData[1];
  const m22 = matrixData[5];

  const pitch = Math.asin(-clamp(m23, -1, 1));
  let yaw;
  let roll;

  if (Math.abs(m23) < 0.9999999) {
    yaw = Math.atan2(m13, m33);
    roll = Math.atan2(m21, m22);
  } else {
    yaw = Math.atan2(-matrixData[2], matrixData[0]);
    roll = 0;
  }

  return {
    yawDeg: yaw * RAD_TO_DEG,
    pitchDeg: pitch * RAD_TO_DEG,
    rollDeg: roll * RAD_TO_DEG
  };
};

// The <video> element itself is drawn raw - see AttendanceConfirm.jsx/
// useLivenessCheck.js, where MediaPipe's detectForVideo(video, ...) and the
// capture canvas's drawImage(video, 0, 0) both read the decoded video frame
// directly. CSS applied to the <video> element (AttendanceConfirm.css mirrors
// it for on-screen display, matching a normal front-camera app) is a
// rendering-only transform and does not affect that underlying frame data, so
// MediaPipe's yaw is still computed against the unflipped camera frame.
// decomposeYawPitchRoll's atan2(m13, m33) is +θ when the canonical face's
// forward (+Z, facing the camera) axis rotates toward image +X (screen
// right). Since the raw frame is unmirrored, image-right is the subject's OWN
// LEFT (as in a normal photo of someone facing the camera, not a mirror) - so
// raw yawDeg is positive when the person turns their own left, negative when
// they turn their own right. TURN_LEFT/TURN_RIGHT below are written expecting
// the opposite sign (negative = left, positive = right), so this must be -1
// to match on a real device. This is the single knob to flip if "turn
// left"/"turn right" ever feel swapped - re-derive the matrix math only as a
// last resort, and don't "fix" it by touching the CSS mirror instead (that
// only changes what the preview looks like, not the frame math).
const TURN_YAW_SIGN = -1;

// --- Blink extraction ------------------------------------------------------
// No longer a challenge step on its own, but still feeds isNeutralPose below
// so "Return to Center" can't be satisfied with eyes closed.

export const getBlinkScore = (blendshapeCategories = []) => {
  const byName = new Map(blendshapeCategories.map((c) => [c.categoryName, c.score]));
  const left = byName.get('eyeBlinkLeft') || 0;
  const right = byName.get('eyeBlinkRight') || 0;
  return (left + right) / 2;
};

// --- Thresholds --------------------------------------------------------

export const THRESHOLDS = {
  // A "strong" turn, not a slight glance - deliberately higher than a
  // passive head wobble so a static photo tilted slightly can't pass.
  turnYawDeg: 25,
  // Turn must be held past the threshold for this long (not just a
  // momentary spike) before the step is marked complete.
  turnSustainMs: 350,
  // Same idea for the "return to center" step between Turn Left and Turn
  // Right - must genuinely settle back near baseline, not just pass through.
  centerSustainMs: 300,
  neutralYawToleranceDeg: 8,
  neutralPitchToleranceDeg: 8,
  neutralBlinkMax: 0.35
};

export const isNeutralPose = (smoothed, baseline) => {
  if (!smoothed || !baseline) return false;
  const yawDelta = Math.abs(smoothed.yawDeg - baseline.yawDeg);
  const pitchDelta = Math.abs(smoothed.pitchDeg - baseline.pitchDeg);
  return (
    yawDelta <= THRESHOLDS.neutralYawToleranceDeg &&
    pitchDelta <= THRESHOLDS.neutralPitchToleranceDeg &&
    smoothed.blinkScore <= THRESHOLDS.neutralBlinkMax
  );
};

// --- Challenge actions -------------------------------------------------
//
// evaluate(state, smoothed, baseline, now) is called every tracked frame
// while the step is active; `now` is a performance.now() timestamp used for
// sustain windows (a threshold must be genuinely held, not just brushed).

const makeTurnAction = (id, instruction, isPastThreshold) => ({
  id,
  instruction,
  timeLimitMs: 6000,
  createState: () => ({ sustainSince: null }),
  evaluate: (state, smoothed, baseline, now) => {
    const relativeYaw = TURN_YAW_SIGN * (smoothed.yawDeg - baseline.yawDeg);
    if (!isPastThreshold(relativeYaw)) {
      state.sustainSince = null;
      return false;
    }
    if (state.sustainSince == null) state.sustainSince = now;
    return now - state.sustainSince >= THRESHOLDS.turnSustainMs;
  }
});

export const TURN_LEFT_ACTION = makeTurnAction(
  'turn_left',
  'Turn head LEFT',
  (relativeYaw) => relativeYaw < -THRESHOLDS.turnYawDeg
);

export const TURN_RIGHT_ACTION = makeTurnAction(
  'turn_right',
  'Turn head RIGHT',
  (relativeYaw) => relativeYaw > THRESHOLDS.turnYawDeg
);

// Sits between Turn Left and Turn Right so the right-turn step can never be
// satisfied by a yaw reading left over from (or sweeping through on the way
// back from) the left turn - the face must genuinely settle near baseline
// first.
export const RETURN_CENTER_ACTION = {
  id: 'return_center',
  instruction: 'Return to center',
  timeLimitMs: 5000,
  createState: () => ({ sustainSince: null }),
  evaluate: (state, smoothed, baseline, now) => {
    if (!isNeutralPose(smoothed, baseline)) {
      state.sustainSince = null;
      return false;
    }
    if (state.sustainSince == null) state.sustainSince = now;
    return now - state.sustainSince >= THRESHOLDS.centerSustainMs;
  }
};

// Fixed order, every attempt: Turn Left -> Center -> Turn Right -> Center.
// The final Center step's own sustain hold is what gates completion - once
// it's satisfied, useLivenessCheck captures the frame and moves straight to
// face matching (no separate re-centering phase after this).
export const CHALLENGE_SEQUENCE = [TURN_LEFT_ACTION, RETURN_CENTER_ACTION, TURN_RIGHT_ACTION, RETURN_CENTER_ACTION];

export const generateChallengeSequence = () => [...CHALLENGE_SEQUENCE];

export const createChallengeSession = (qrSessionId) => ({
  challengeId: crypto.randomUUID(),
  qrSessionId,
  sequence: generateChallengeSequence(),
  createdAt: Date.now()
});

export const isChallengeValidForSession = (challenge, qrSessionId) =>
  Boolean(challenge && qrSessionId && challenge.qrSessionId === qrSessionId);
