import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useSearchParams, useNavigate } from 'react-router-dom';
import { loadFaceModels } from '../utils/loadFaceModels';
import { getFaceByAdminId } from '../utils/attendanceService';
import * as faceapi from 'face-api.js';
import { validateQRSession } from '../utils/attendanceService';
import './AttendanceConfirm.css';
import {
  requestGeoLocation,
  validateProximity,
  getAuthToken,
  isAuthValid,
  getStationGeo,
  recordAttendance,
  saveAuthToken
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
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(null);
  const [authError, setAuthError] = useState('');
  const faceDebug = [];
  const [verificationPhotoBlob, setVerificationPhotoBlob] = useState(null);
  const [verifiedStationId, setVerifiedStationId] = useState(null);
  const [showAttendanceConfirmation, setShowAttendanceConfirmation] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
 
  const authSessionId = searchParams.get('auth');
  const qrSessionId = searchParams.get('station');
  const stationGeo = useMemo(() => getStationGeo(verifiedStationId), [verifiedStationId]);
  const stationLabel = stationGeo.stationId && stationGeo.stationId !== 'DEFAULT'
    ? `${stationGeo.name} (${stationGeo.stationId})`
    : stationGeo.name;
  const hasPendingVerification = Boolean(mode || geoLocation || verificationPhotoBlob) &&
    confirmStatus?.type !== 'success';
  const navigationBlocker = useBlocker(hasPendingVerification && !isProcessing);

  useEffect(() => {
    if (!hasPendingVerification) return undefined;

    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
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
      const redirectUrl = `${window.location.pathname}${window.location.search}`;
      setTimeout(() => navigate(`/attendance-login?redirect=${encodeURIComponent(redirectUrl)}`), 1200);
      return;
    }

    if (authSessionId && token.sessionId !== authSessionId) {
      setAuthError('Invalid session token. Please login again.');
      const redirectUrl = `${window.location.pathname}${window.location.search}`;
      setTimeout(() => navigate(`/attendance-login?redirect=${encodeURIComponent(redirectUrl)}`), 1200);
      return;
    }

    setAuthenticatedOfficer(token);
  }, [authSessionId, navigate]);

useEffect(() => {
  const checkSession = async () => {
    if (!qrSessionId) return;

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
  
  const handleRequestLocation = async () => {
    setIsProcessing(true);
    setGeoStatus('Requesting location...');
    try {
      const geo = await requestGeoLocation();
      setGeoLocation(geo);
      
      const proximity = validateProximity(geo, stationGeo, stationGeo.radius || 100);
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

const handleVerifyFace = async () => {
  if (!authenticatedOfficer) {
    setFaceError('Authentication error. Please login again.');
    return;
  }

  if (!authenticatedOfficer.admin_id) {
    setFaceError('Missing user ID.');
    return;
  }

  setFaceError('');
  setFaceScore(null);
  setVerificationPhotoBlob(null);
  setIsVerifyingFace(true);
  setFaceStatus('Loading face data...');

  try {
    // 1. Get stored face from Supabase
    const { data, error } = await getFaceByAdminId(authenticatedOfficer.admin_id);

    if (error || !data) {
      setFaceError('No registered face found.');
      setIsVerifyingFace(false);
      return;
    }

    const storedDescriptor = new Float32Array(
  typeof data.face_descriptor === 'string'
    ? JSON.parse(data.face_descriptor)
    : data.face_descriptor
);

    // 2. Open camera
    setFaceStatus('Requesting camera...');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    setFaceStatus('Look at the camera... detecting face');

    // 3. Wait a bit for stable frame
    await new Promise(r => setTimeout(r, 800));

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);

    // 4. Detect face
   const detection = await faceapi
  .detectSingleFace(
    canvas,
    new faceapi.TinyFaceDetectorOptions()
  )
  .withFaceLandmarks()
  .withFaceDescriptor();

    if (!detection) {
      setFaceError('No face detected.');
      stopFaceCamera();
      setIsVerifyingFace(false);
      return;
    }

    const capturedPhoto = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88);
    });

    if (!capturedPhoto) {
      setFaceError('Unable to capture the verification photo. Please try again.');
      stopFaceCamera();
      setIsVerifyingFace(false);
      return;
    }

    // 5. Compare faces
    const distance = faceapi.euclideanDistance(
      detection.descriptor,
      storedDescriptor
    );

    const threshold = 0.5;
    const isMatch = distance < threshold;

    setFaceScore(1 - distance);

    if (isMatch) {
      setVerificationPhotoBlob(capturedPhoto);
      setFaceStatus('Face verified ✓');

      const updated = {
        ...authenticatedOfficer,
        faceVerified: true,
        faceMatchScore: 1 - distance,
        faceVerifiedAt: new Date().toISOString()
      };

      saveAuthToken(updated);
      setAuthenticatedOfficer(updated);
    } else {
      setVerificationPhotoBlob(null);
      setFaceError('Face does not match.');
      setFaceStatus('Verification failed ✗');
    }

    stopFaceCamera();
    setIsVerifyingFace(false);

  } catch (err) {
    console.error(err);
    setFaceError('Face verification failed.');
    setFaceStatus('Error occurred during verification.');
    stopFaceCamera();
    setIsVerifyingFace(false);
  }
};

  const handleConfirm = () => {
    if (!mode) {
      setStatus('Please choose a time mode before confirming.');
      return;
    }
    if (!authenticatedOfficer) {
      setStatus('Authentication error. Please login again.');
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
    locationPassed: proximity.isValid,
    distanceMeters: proximity.distance,
    stationRadiusMeters: proximity.radius,
    stationId: stationGeo.stationId,
    stationName: stationLabel,
    locationAddress: stationGeo.address || stationLabel
  }
});
      setShowAttendanceConfirmation(false);
      setConfirmStatus({
        type: 'success',
        message: `✓ Attendance confirmed for ${authenticatedOfficer.name} (${authenticatedOfficer.rank}) at ${stationLabel}.`
      });

      setStatus(
        action === 'updated'
          ? `Time Out recorded at ${record.timeOut}.`
          : `Confirmed ${mode === 'in' ? `Time In at ${record.timeIn}` : `Time Out at ${record.timeOut}`}.`
      );

      if (authenticatedOfficer.admin_id) {
        void logPersonnelActivity({
          personnelId: authenticatedOfficer.admin_id,
          activityType: mode === 'in' ? 'attendance_time_in' : 'attendance_time_out',
          action: mode === 'in' ? 'Attendance Time In' : 'Attendance Time Out',
          details: `${mode === 'in' ? 'Timed in' : 'Timed out'} at ${stationLabel}.`
        });
      }
    } catch (error) {
      setConfirmStatus({
        type: 'error',
        message: `Attendance save failed: ${error.message}`
      });
      setStatus('Unable to save attendance. Please try again.');
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

            <div className="confirm-section">
              <label className="section-label">Face Verification</label>
              <button
                type="button"
                className={`location-btn ${authenticatedOfficer.faceVerified ? 'verified' : ''}`}
                onClick={handleVerifyFace}
                disabled={isVerifyingFace}
              >
                {isVerifyingFace ? 'Checking...' : authenticatedOfficer.faceVerified ? '✓ Face Verified' : 'Verify Face'}
              </button>
              <div className={`location-status ${faceError ? 'error' : authenticatedOfficer.faceVerified && !faceStatus.includes('✗') ? 'success' : ''}`}>
                {faceError || faceStatus}
              </div>
              {faceScore != null && !faceError && (
                <div className="face-score">Current match score: {Math.round(faceScore * 100)}%</div>
              )}
              <video ref={videoRef} className="confirm-camera-preview" autoPlay muted playsInline />
              <canvas ref={canvasRef} className="confirm-camera-canvas" aria-hidden="true" />
              <div className="face-debug-panel">
                <div className="face-debug-title">Face Debug</div>
                {faceDebug.length > 0 ? (
                  faceDebug.map((line) => (
                    <div key={line} className="face-debug-line">{line}</div>
                  ))
                ) : (
                  <div className="face-debug-empty">No face debug events yet.</div>
                )}
              </div>
            </div>

            {/* GPS Validation */}
            <div className="confirm-section">
              <label className="section-label">Location Verification</label>
              <button
                type="button"
                className={`location-btn ${geoLocation ? 'verified' : ''}`}
                onClick={handleRequestLocation}
                disabled={isProcessing}
              >
                {isProcessing ? 'Checking...' : geoLocation ? '✓ Location Verified' : 'Request Location'}
              </button>
              <div className={`location-status ${geoLocation && !geoStatus.includes('✗') ? 'success' : geoStatus.includes('✗') ? 'error' : ''}`}>
                {geoStatus}
              </div>
            </div>

            {/* Time Mode Selection */}
            <div className="confirm-mode">
              <button
                type="button"
                className={`confirm-btn ${mode === 'in' ? 'active' : ''}`}
                onClick={() => setMode('in')}
              >
                TIME IN
              </button>
              <button
                type="button"
                className={`confirm-btn alt ${mode === 'out' ? 'active' : ''}`}
                onClick={() => setMode('out')}
              >
                TIME OUT
              </button>
            </div>

            <button 
              type="button" 
              className="confirm-submit" 
              onClick={handleConfirm}
              disabled={!authenticatedOfficer || !geoLocation || !authenticatedOfficer.faceVerified || !verificationPhotoBlob || isProcessing}
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

            {navigationBlocker.state === 'blocked' && (
              <div className="attendance-confirm-overlay" role="presentation">
                <div
                  className="attendance-confirm-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="attendanceLeaveTitle"
                >
                  <div className="attendance-confirm-dialog-icon warning" aria-hidden="true">!</div>
                  <h2 id="attendanceLeaveTitle">Leave attendance verification?</h2>
                  <p>Your verification details have not been recorded. Are you sure you want to leave?</p>
                  <div className="attendance-confirm-dialog-actions">
                    <button
                      type="button"
                      className="attendance-confirm-cancel"
                      onClick={() => navigationBlocker.reset()}
                    >
                      Stay Here
                    </button>
                    <button
                      type="button"
                      className="attendance-confirm-danger"
                      onClick={() => navigationBlocker.proceed()}
                    >
                      Yes, Leave
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AttendanceConfirm;
