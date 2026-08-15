import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useSearchParams, useNavigate } from 'react-router-dom';
import { loadFaceModels } from '../utils/loadFaceModels';
import { getFaceByAdminId } from '../utils/attendanceService';
import * as faceapi from '@vladmandic/face-api';
import { validateQRSession } from '../utils/attendanceService';
import LivenessCheck from './LivenessCheck';
import ReloadGuardDialog from './ReloadGuardDialog';
import { setReloadGuardActive } from '../utils/reloadGuard';
import './AttendanceConfirm.css';
import {
  requestGeoLocation,
  validateProximity,
  getAuthToken,
  isAuthValid,
  getStationGeo,
  recordAttendance,
  saveAuthToken,
  getAttendanceStatus
} from '../utils/attendanceService';
import { logPersonnelActivity } from '../utils/activityLogService';

const AttendanceConfirm = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('Select Time In or Time Out to continue.');
  const [authenticatedOfficer, setAuthenticatedOfficer] = useState(null);
  const [geoLocation, setGeoLocation] = useState(null);
  const [geoStatus, setGeoStatus] = useState('Request location access');
  const [faceStatus, setFaceStatus] = useState('Face verification has not started yet.');
  const [faceScore, setFaceScore] = useState(null);
  const [faceError, setFaceError] = useState('');
  // Single source of truth for the face verification UI: idle | liveness | matching | success | failed.
  // Replaces the old isVerifyingFace/faceVerified-on-token combo that could go out of sync
  // (e.g. a stale "verified" flag surviving into a failed retry).
  const [verificationState, setVerificationState] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(null);
  const [authError, setAuthError] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState(null);
  const [attendanceStatusError, setAttendanceStatusError] = useState('');
  const [isAttendanceStatusLoading, setIsAttendanceStatusLoading] = useState(false);
  const [faceDebug, setFaceDebug] = useState([]);
  const [verificationPhotoBlob, setVerificationPhotoBlob] = useState(null);
  const [verifiedStationId, setVerifiedStationId] = useState(null);
  const [showAttendanceConfirmation, setShowAttendanceConfirmation] = useState(false);
  const [timeInSuccess, setTimeInSuccess] = useState(null);
  const [showLiveness, setShowLiveness] = useState(false);
  const [livenessAttemptKey, setLivenessAttemptKey] = useState(0);
  const [livenessPhase, setLivenessPhase] = useState('idle');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const storedDescriptorRef = useRef(null);
  // Monotonic token for the in-flight verification attempt. Async callbacks
  // (camera acquisition, liveness completion, face matching) compare against
  // this before applying results, so a stale attempt can never overwrite the
  // current one.
  const attemptIdRef = useRef(0);
 
  const authSessionId = searchParams.get('auth');
  const qrSessionId = searchParams.get('station');
  const stationGeo = useMemo(() => getStationGeo(verifiedStationId), [verifiedStationId]);
  const geoProximity = useMemo(
    () => (geoLocation ? validateProximity(geoLocation, stationGeo, stationGeo.radius || 100) : null),
    [geoLocation, stationGeo]
  );
  const isLocationVerified = Boolean(geoProximity?.isValid);
  const stationLabel = stationGeo.stationId && stationGeo.stationId !== 'DEFAULT'
    ? `${stationGeo.name} (${stationGeo.stationId})`
    : stationGeo.name;
  const hasPendingVerification = Boolean(mode || geoLocation || verificationPhotoBlob) &&
    confirmStatus?.type !== 'success' && !timeInSuccess;
  const navigationBlocker = useBlocker(hasPendingVerification && !isProcessing);
  const timeInDisabled = isAttendanceStatusLoading || !attendanceStatus?.canTimeIn;
  const timeOutDisabled = isAttendanceStatusLoading || !attendanceStatus?.canTimeOut;
  const attendanceCompleted = attendanceStatus?.state === 'completed';

  const refreshAttendanceStatus = useCallback(async ({ officer = authenticatedOfficer, stationId = verifiedStationId } = {}) => {
    if (!officer?.admin_id || !stationId) return null;

    setIsAttendanceStatusLoading(true);
    setAttendanceStatusError('');

    try {
      const nextStatus = await getAttendanceStatus({
        shiftId: stationId,
        qrSessionId
      });
      setAttendanceStatus(nextStatus);
      setStatus(nextStatus.message || 'Select Time In or Time Out to continue.');

      setMode((currentMode) => {
        if (!nextStatus.canTimeIn && currentMode === 'in') return '';
        if (!nextStatus.canTimeOut && currentMode === 'out') return '';
        return currentMode;
      });

      return nextStatus;
    } catch (error) {
      const message = error.message || 'Unable to load attendance status.';
      setAttendanceStatusError(message);
      setStatus(message);
      return null;
    } finally {
      setIsAttendanceStatusLoading(false);
    }
  }, [authenticatedOfficer, qrSessionId, verifiedStationId]);

  useEffect(() => {
    // Keeps the native beforeunload prompt (unstylable, but unavoidable for
    // actual browser refresh/Ctrl+R/tab close) active only while verification
    // is unfinished; the in-app navigationBlocker dialog below covers
    // in-app reload/navigation actions with a custom IGNIS SAFE modal instead.
    setReloadGuardActive(hasPendingVerification);
    return () => setReloadGuardActive(false);
  }, [hasPendingVerification]);

useEffect(() => {
  const init = async () => {
    await loadFaceModels();
  };

  init();
}, []);

  // Verify authentication on mount
  useEffect(() => {
    try {
      window.localStorage.setItem('faceLogs', window.localStorage.getItem('faceLogs') || new Date().toISOString() + ' - confirm page loaded');
    } catch {
      // ignore storage errors
    }

    const token = getAuthToken();

    if (!token || !isAuthValid()) {
      setAuthError('Session expired. Redirecting to login...');
      setTimeout(() => navigate(`/attendance-login?station=${encodeURIComponent(qrSessionId || '')}`), 1200);
      return;
    }

    if (authSessionId && token.sessionId !== authSessionId) {
      setAuthError('Invalid session token. Please login again.');
      setTimeout(() => navigate(`/attendance-login?station=${encodeURIComponent(qrSessionId || '')}`), 1200);
      return;
    }

    setAuthenticatedOfficer(token);
  }, [authSessionId, navigate, qrSessionId]);

useEffect(() => {
  const checkSession = async () => {
    if (!qrSessionId) {
      setAuthError('Invalid QR session');
      return;
    }

    const result = await validateQRSession(qrSessionId);

    if (!result.valid) {
      setAuthError(result.reason);
      setTimeout(() => navigate('/attendance-login'), 1500);
      return;
    }

    setVerifiedStationId(result.session?.station_id || 'DEFAULT');
  };

  checkSession();
}, [navigate, qrSessionId]);

useEffect(() => {
  if (!authenticatedOfficer?.admin_id || !verifiedStationId || authError) return;
  void refreshAttendanceStatus({
    officer: authenticatedOfficer,
    stationId: verifiedStationId
  });
}, [authError, authenticatedOfficer, refreshAttendanceStatus, verifiedStationId]);
  
  const handleRequestLocation = async () => {
    setIsProcessing(true);
    setGeoStatus('Requesting location...');
    try {
      const geo = await requestGeoLocation();
      setGeoLocation(geo);

      const proximity = validateProximity(geo, stationGeo, stationGeo.radius || 100);
      // TEST ONLY — debug readout for temporary location testing, safe to leave enabled
      console.log('[Attendance GPS TEST]', {
        detectedLatitude: geo.latitude,
        detectedLongitude: geo.longitude,
        gpsAccuracyMeters: geo.accuracy,
        distanceFromTestLocationMeters: Number(proximity.distance.toFixed(2)),
        allowedRadiusMeters: proximity.radius,
        withinRadius: proximity.isValid
      });
      if (proximity.isValid) {
        setGeoStatus(`✓ On-site verified (${proximity.distance.toFixed(0)}m away)`);
      } else {
        setGeoStatus(`✗ Not on-site (${proximity.distance.toFixed(0)}m away)`);
      }
    } catch (error) {
      setGeoStatus(`✗ Location error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const stopFaceCamera = () => {
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }

  if (videoRef.current) {
    videoRef.current.srcObject = null;
  }
};

const appendFaceDebug = useCallback((message) => {
  setFaceDebug((prev) => [...prev.slice(-19), `${new Date().toISOString().slice(11, 19)} ${message}`]);
}, []);

// The camera is otherwise only stopped on final success (see handleLivenessPassed)
// so it stays live across failed retries; unmounting the page is the "explicit
// cancellation" that must still turn it off.
useEffect(() => {
  return () => stopFaceCamera();
}, []);

const handleVerifyFace = async () => {
  if (!authenticatedOfficer) {
    setFaceError('Authentication error. Please login again.');
    return;
  }

  if (!authenticatedOfficer.admin_id) {
    setFaceError('Missing user ID.');
    return;
  }

  const attemptId = attemptIdRef.current + 1;
  attemptIdRef.current = attemptId;

  // Reset every stale flag from a previous attempt before starting this one,
  // so a leftover "verified"/error/liveness state can never bleed into the retry.
  setFaceError('');
  setFaceScore(null);
  setVerificationPhotoBlob(null);
  setFaceDebug([]);
  setShowLiveness(false);
  setLivenessPhase('idle');
  setVerificationState('liveness');
  setFaceStatus('Loading face data...');

  if (authenticatedOfficer.faceVerified) {
    const resetOfficer = {
      ...authenticatedOfficer,
      faceVerified: false,
      faceMatchScore: null,
      faceVerifiedAt: null,
      livenessPassed: false,
      livenessChallengeId: null,
      livenessVerifiedAt: null,
      livenessChallengeSequence: null
    };
    saveAuthToken(resetOfficer);
    setAuthenticatedOfficer(resetOfficer);
  }

  try {
    // 1. Get stored face from Supabase
    const { data, error } = await getFaceByAdminId(authenticatedOfficer.admin_id);
    if (attemptIdRef.current !== attemptId) return;

    if (error || !data) {
      setFaceError('No registered face found.');
      setFaceStatus('Verification failed ✗');
      setVerificationState('failed');
      return;
    }

    storedDescriptorRef.current = new Float32Array(
      typeof data.face_descriptor === 'string'
        ? JSON.parse(data.face_descriptor)
        : data.face_descriptor
    );

    // 2. Open the camera, reusing an already-active stream from a prior
    // attempt on this session instead of re-prompting/flickering. The stream
    // is only ever torn down on final success or explicit cancellation
    // (see stopFaceCamera call sites), so a retry after a failure has a live
    // preview already - never a black box.
    setFaceStatus('Requesting camera...');

    let stream = streamRef.current;
    const streamIsLive = stream?.getTracks().some((track) => track.readyState === 'live');

    if (!streamIsLive) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      if (attemptIdRef.current !== attemptId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    if (attemptIdRef.current !== attemptId) return;

    // 3. Hand off to the liveness challenge. Identity matching only runs
    // after LivenessCheck reports a pass (see handleLivenessPassed).
    setFaceStatus('Follow the on-screen instructions to verify you are live.');
    setLivenessAttemptKey(attemptId);
    setLivenessPhase('idle');
    setShowLiveness(true);
  } catch (err) {
    if (attemptIdRef.current !== attemptId) return;
    console.error(err);
    setFaceError('Face verification failed.');
    setFaceStatus('Error occurred during verification.');
    setVerificationState('failed');
  }
};

const handleLivenessPassed = useCallback(async ({ canvas, challengeId, sequenceIds }, attemptId) => {
  if (attemptIdRef.current !== attemptId) return; // stale attempt, ignore

  setShowLiveness(false);
  setLivenessPhase('idle');
  setVerificationState('matching');
  setFaceStatus('Matching face...');

  try {
    // 4. Detect face on the exact live frame captured the instant the
    // liveness challenge's final "look straight" step succeeded.
    const detection = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (attemptIdRef.current !== attemptId) return;

    if (!detection) {
      setFaceError('No face detected.');
      setFaceStatus('Verification failed ✗');
      setVerificationState('failed');
      return;
    }

    const capturedPhoto = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88);
    });

    if (attemptIdRef.current !== attemptId) return;

    if (!capturedPhoto) {
      setFaceError('Unable to capture the verification photo. Please try again.');
      setFaceStatus('Verification failed ✗');
      setVerificationState('failed');
      return;
    }

    // 5. Compare faces - identical threshold/logic to before, only the
    // source frame changed.
    const distance = faceapi.euclideanDistance(
      detection.descriptor,
      storedDescriptorRef.current
    );

    const threshold = 0.5;
    const isMatch = distance < threshold;

    setFaceScore(1 - distance);
    appendFaceDebug(`match distance=${distance.toFixed(3)} threshold=${threshold} sequence=${sequenceIds.join(',')}`);

    if (isMatch) {
      setVerificationPhotoBlob(capturedPhoto);
      setFaceStatus('Face verified ✓');
      setVerificationState('success');

      const updated = {
        ...authenticatedOfficer,
        faceVerified: true,
        faceMatchScore: 1 - distance,
        faceVerifiedAt: new Date().toISOString(),
        livenessPassed: true,
        livenessChallengeId: challengeId,
        livenessVerifiedAt: new Date().toISOString(),
        livenessChallengeSequence: sequenceIds
      };

      saveAuthToken(updated);
      setAuthenticatedOfficer(updated);
      // Identity matching is fully finished and it's a final success - now it's safe to stop the camera.
      stopFaceCamera();
    } else {
      setVerificationPhotoBlob(null);
      setFaceError('Face does not match the registered Face ID. Please try again using the registered personnel’s face.');
      setFaceStatus('Verification failed ✗');
      setVerificationState('failed');
    }
  } catch (err) {
    if (attemptIdRef.current !== attemptId) return;
    console.error(err);
    setFaceError('Face verification failed.');
    setFaceStatus('Error occurred during verification.');
    setVerificationState('failed');
  }
}, [authenticatedOfficer, appendFaceDebug]);

const handleLivenessFailed = useCallback((reason, attemptId) => {
  if (attemptIdRef.current !== attemptId) return; // stale attempt, ignore

  appendFaceDebug(`liveness failed: ${reason}`);
  setShowLiveness(false);
  setLivenessPhase('idle');
  setFaceError('Live face verification failed. Please look directly at the camera and follow the instructions.');
  setFaceStatus('Verification failed ✗');
  setVerificationState('failed');
  // Liveness failed before identity matching ever ran - camera stays live so
  // "Try Again" can restart the challenge instantly, no black preview.
}, [appendFaceDebug]);

  const handleConfirm = () => {
    if (!mode) {
      setStatus('Please choose a time mode before confirming.');
      return;
    }
    if (!authenticatedOfficer) {
      setStatus('Authentication error. Please login again.');
      return;
    }
    if (mode === 'in' && timeInDisabled) {
      setStatus('Your attendance for this action has already been recorded.');
      return;
    }
    if (mode === 'out' && timeOutDisabled) {
      setStatus(attendanceStatus?.message || 'Time Out is not available yet.');
      return;
    }
    if (!geoLocation) {
      setStatus('Please share your location for verification.');
      return;
    }
    if (!authenticatedOfficer.faceVerified || !verificationPhotoBlob) {
      setStatus('Please complete Face ID verification and capture a current photo.');
      return;
    }

    const proximity = validateProximity(geoLocation, stationGeo, stationGeo.radius || 100);
    if (!proximity.isValid) {
      setConfirmStatus({
        type: 'error',
        message: `Location verification failed. You are ${proximity.distance.toFixed(0)}m away from ${stationLabel}.`
      });
      return;
    }

    setShowAttendanceConfirmation(true);
  };

  const saveConfirmedAttendance = async () => {
    const proximity = validateProximity(geoLocation, stationGeo, stationGeo.radius || 100);

    setIsProcessing(true);
    setConfirmStatus(null);

    try {
      const latestStatus = await refreshAttendanceStatus();
      if (mode === 'in' && !latestStatus?.canTimeIn) {
        throw new Error('Your attendance for this action has already been recorded.');
      }
      if (mode === 'out' && !latestStatus?.canTimeOut) {
        throw new Error(latestStatus?.message || 'Time Out is not available yet.');
      }

     const { record, action } = await recordAttendance({
  officer: authenticatedOfficer,
  mode,
  location: geoLocation,
  qrSessionId,
  verification: {
    photoBlob: verificationPhotoBlob,
    faceMatchScore: faceScore ?? authenticatedOfficer.faceMatchScore,
    facePassed: authenticatedOfficer.faceVerified,
    faceVerifiedAt: authenticatedOfficer.faceVerifiedAt,
    livenessPassed: authenticatedOfficer.livenessPassed,
    livenessChallengeId: authenticatedOfficer.livenessChallengeId,
    livenessVerifiedAt: authenticatedOfficer.livenessVerifiedAt,
    livenessChallengeSequence: authenticatedOfficer.livenessChallengeSequence,
    locationPassed: proximity.isValid,
    distanceMeters: proximity.distance,
    stationRadiusMeters: proximity.radius,
    stationId: stationGeo.stationId,
    stationName: stationLabel,
    locationAddress: stationGeo.address || stationLabel
  }
});
      setShowAttendanceConfirmation(false);

      if (mode === 'in' && action !== 'updated') {
        setTimeInSuccess({ time: record.timeIn });
      } else {
        setConfirmStatus({
          type: 'success',
          message: `✓ Attendance confirmed for ${authenticatedOfficer.name} (${authenticatedOfficer.rank}) at ${stationLabel}.`
        });

        setStatus(
          action === 'updated'
            ? `Time Out recorded at ${record.timeOut}.`
            : `Confirmed Time Out at ${record.timeOut}.`
        );
      }

      await refreshAttendanceStatus();

      if (authenticatedOfficer.admin_id) {
        void logPersonnelActivity({
          personnelId: authenticatedOfficer.admin_id,
          activityType: mode === 'in' ? 'attendance_time_in' : 'attendance_time_out',
          action: mode === 'in' ? 'Attendance Time In' : 'Attendance Time Out',
          details: `${mode === 'in' ? 'Timed in' : 'Timed out'} at ${stationLabel}.`
        });
      }
    } catch (error) {
      const message = error.message || 'Unable to save attendance. Please try again.';
      setConfirmStatus({
        type: 'error',
        message
      });
      setStatus(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const now = new Date();

  return (
    <div className="attendance-confirm-page">
      <div className="confirm-card">
        <div className="confirm-header">
          <span className="confirm-badge">IGNIS SAFE</span>
          <h1>Confirm Attendance</h1>
          <p>{stationLabel} - Secure Session</p>
        </div>

        {authError && (
          <div className="auth-error">
            {authError}
          </div>
        )}

        {!authError && authenticatedOfficer && (
          <>
            {/* Auto-filled Officer Info */}
            <div className="confirm-info">
              <div className="info-row">
                <span>Officer Name</span>
                <strong>{authenticatedOfficer.name}</strong>
              </div>
              <div className="info-row">
                <span>Rank</span>
                <strong>{authenticatedOfficer.rank}</strong>
              </div>
              <div className="info-row">
                <span>Date</span>
                <strong>{now.toLocaleDateString()}</strong>
              </div>
              <div className="info-row">
                <span>Time</span>
                <strong>{now.toLocaleTimeString()}</strong>
              </div>
              <div className="security-badge">
                ✓ Authenticated & Verified
              </div>
            </div>

            <div className={`attendance-status-card ${attendanceCompleted ? 'completed' : ''}`}>
              <div>
                <span className="attendance-status-label">Attendance Status</span>
                <strong>
                  {isAttendanceStatusLoading
                    ? 'Checking Supabase...'
                    : attendanceStatus?.message || 'No attendance record found.'}
                </strong>
              </div>
              {attendanceStatus?.record && (
                <div className="attendance-status-times">
                  <span>Time In: {attendanceStatus.record.timeIn || '--'}</span>
                  <span>Time Out: {attendanceStatus.record.timeOut || '--'}</span>
                </div>
              )}
              {attendanceStatusError && (
                <div className="attendance-status-error">{attendanceStatusError}</div>
              )}
            </div>

            {attendanceCompleted ? (
              <div className="attendance-completed-card">
                <div className="attendance-completed-times">
                  <div className="attendance-completed-time-block">
                    <span className="attendance-completed-label">Time In</span>
                    <strong className="attendance-completed-value">{attendanceStatus.record?.timeIn || '--'}</strong>
                  </div>
                  <div className="attendance-completed-time-block">
                    <span className="attendance-completed-label">Time Out</span>
                    <strong className="attendance-completed-value">{attendanceStatus.record?.timeOut || '--'}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="attendance-history-btn"
                  onClick={() => navigate('/attendance-personnel?history=1')}
                >
                  View Attendance History
                </button>
              </div>
            ) : (
              <>
            <div className="confirm-section">
              <label className="section-label">Face Verification</label>
              <button
                type="button"
                className={`location-btn ${verificationState === 'success' ? 'verified' : ''} ${verificationState === 'failed' ? 'error' : ''}`}
                onClick={handleVerifyFace}
                disabled={verificationState === 'liveness' || verificationState === 'matching'}
              >
                {verificationState === 'liveness' || verificationState === 'matching'
                  ? 'Checking...'
                  : verificationState === 'success'
                    ? '✓ Face Verified'
                    : verificationState === 'failed'
                      ? 'Try Again'
                      : 'Verify Face'}
              </button>
              <div className={`location-status ${faceError ? 'error' : verificationState === 'success' ? 'success' : ''}`}>
                {faceError || faceStatus}
              </div>
              <div className={`confirm-camera-frame confirm-camera-frame--${showLiveness ? livenessPhase : 'idle'}`}>
                <video ref={videoRef} className="confirm-camera-preview" autoPlay muted playsInline />
                {showLiveness && <div className="confirm-camera-guide" aria-hidden="true" />}
              </div>
              <canvas ref={canvasRef} className="confirm-camera-canvas" aria-hidden="true" />
              {showLiveness && (
                <LivenessCheck
                  key={livenessAttemptKey}
                  videoRef={videoRef}
                  qrSessionId={qrSessionId}
                  onPassed={(result) => handleLivenessPassed(result, livenessAttemptKey)}
                  onFailed={(reason) => handleLivenessFailed(reason, livenessAttemptKey)}
                  onDebug={appendFaceDebug}
                  onPhaseChange={setLivenessPhase}
                />
              )}
              {import.meta.env.DEV && (
                <div className="face-debug-panel">
                  <div className="face-debug-title">Face Debug</div>
                  {faceDebug.length > 0 ? (
                    faceDebug.map((line, index) => (
                      <div key={`${index}-${line}`} className="face-debug-line">{line}</div>
                    ))
                  ) : (
                    <div className="face-debug-empty">No face debug events yet.</div>
                  )}
                </div>
              )}
            </div>

            {/* GPS Validation */}
            <div className="confirm-section">
              <label className="section-label">Location Verification</label>
              <button
                type="button"
                className={`location-btn ${isLocationVerified ? 'verified' : ''}`}
                onClick={handleRequestLocation}
                disabled={isProcessing || verificationState !== 'success'}
              >
                {isProcessing
                  ? 'Checking...'
                  : isLocationVerified
                    ? '✓ Location Verified'
                    : geoLocation
                      ? 'Not On-Site'
                      : 'Request Location'}
              </button>
              <div className={`location-status ${isLocationVerified ? 'success' : geoStatus.includes('✗') || (geoLocation && !isLocationVerified) ? 'error' : ''}`}>
                {verificationState !== 'success' ? 'Complete Face Verification first.' : geoStatus}
              </div>
            </div>

            {/* Time Mode Selection */}
            <div className="confirm-mode">
              <button
                type="button"
                className={`confirm-btn ${mode === 'in' ? 'active' : ''}`}
                onClick={() => setMode('in')}
                disabled={timeInDisabled}
              >
                TIME IN
              </button>
              <button
                type="button"
                className={`confirm-btn alt ${mode === 'out' ? 'active' : ''}`}
                onClick={() => setMode('out')}
                disabled={timeOutDisabled}
              >
                TIME OUT
              </button>
            </div>

            <button 
              type="button" 
              className="confirm-submit" 
              onClick={handleConfirm}
              disabled={!authenticatedOfficer || !mode || !geoLocation || !authenticatedOfficer.faceVerified || !verificationPhotoBlob || isProcessing || (mode === 'in' && timeInDisabled) || (mode === 'out' && timeOutDisabled)}
            >
              {isProcessing ? 'Saving...' : 'Confirm Attendance'}
            </button>

            {confirmStatus && (
              <div className={`confirm-result ${confirmStatus.type}`}>
                {confirmStatus.message}
              </div>
            )}

            <div className="confirm-status">{status}</div>

            <div className="confirm-footer">
              Your face, location, and attendance details are verified and logged instantly. Only you can mark attendance with this session.
            </div>
              </>
            )}

            {showAttendanceConfirmation && (
              <div className="attendance-confirm-overlay" role="presentation">
                <div
                  className="attendance-confirm-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="attendanceConfirmTitle"
                >
                  <div className="attendance-confirm-dialog-icon" aria-hidden="true">?</div>
                  <h2 id="attendanceConfirmTitle">Are you sure?</h2>
                  <p>
                    Record <strong>{mode === 'in' ? 'Time In' : 'Time Out'}</strong> for{' '}
                    <strong>{authenticatedOfficer.name}</strong> using the completed Face ID and location verification?
                  </p>
                  <div className="attendance-confirm-dialog-actions">
                    <button
                      type="button"
                      className="attendance-confirm-cancel"
                      onClick={() => setShowAttendanceConfirmation(false)}
                      disabled={isProcessing}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="attendance-confirm-approve"
                      onClick={saveConfirmedAttendance}
                      disabled={isProcessing}
                    >
                      {isProcessing ? 'Saving...' : `Yes, Record ${mode === 'in' ? 'Time In' : 'Time Out'}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {timeInSuccess && (
              <div className="attendance-confirm-overlay" role="presentation">
                <div
                  className="attendance-confirm-dialog attendance-success-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="timeInSuccessTitle"
                >
                  <div className="attendance-confirm-dialog-icon success" aria-hidden="true">✓</div>
                  <h2 id="timeInSuccessTitle">Time In Recorded Successfully!</h2>
                  <p>
                    Your Time In was recorded at <strong>{timeInSuccess.time}</strong>. You may record your Time Out after your shift.
                  </p>
                  <div className="attendance-confirm-dialog-actions">
                    <button
                      type="button"
                      className="attendance-confirm-approve"
                      onClick={() => navigate('/personnel/operations')}
                    >
                      Back to Personnel Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {navigationBlocker.state === 'blocked' && (
              <ReloadGuardDialog
                onStay={() => navigationBlocker.reset()}
                onContinue={() => navigationBlocker.proceed()}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AttendanceConfirm;
