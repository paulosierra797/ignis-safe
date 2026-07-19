import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
  const [faceDebug, setFaceDebug] = useState([]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const verificationTimerRef = useRef(null);
  const requestIdRef = useRef(0);
 
  const authSessionId = searchParams.get('auth');
  const stationId = searchParams.get('station');
  const stationGeo = useMemo(() => getStationGeo(stationId), [stationId]);
  const stationLabel = stationGeo.stationId && stationGeo.stationId !== 'DEFAULT'
    ? `${stationGeo.name} (${stationGeo.stationId})`
    : stationGeo.name;
const [modelsReady, setModelsReady] = useState(false);

useEffect(() => {
  const init = async () => {
    await loadFaceModels();
    setModelsReady(true);
  };

  init();
}, []);

  // Verify authentication on mount
  useEffect(() => {
    try {
      window.localStorage.setItem('faceLogs', window.localStorage.getItem('faceLogs') || new Date().toISOString() + ' - confirm page loaded');
    } catch (error) {
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

  const recordFaceDebug = (message) => {
    const entry = `${new Date().toISOString()} - ${message}`;
    setFaceDebug((current) => [...current.slice(-9), entry]);

    try {
      const existing = window.localStorage.getItem('faceLogs');
      const next = existing ? `${existing}\n${entry}` : entry;
      window.localStorage.setItem('faceLogs', next);
    } catch (error) {
      // ignore storage errors
    }
  };
useEffect(() => {
  const checkSession = async () => {
    if (!stationId) return;

    const result = await validateQRSession(stationId);

    if (!result.valid) {
      setAuthError(result.reason);
      setTimeout(() => navigate('/attendance-login'), 1500);
    }
  };

  checkSession();
}, [stationId]);
  
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

    // 5. Compare faces
    const distance = faceapi.euclideanDistance(
      detection.descriptor,
      storedDescriptor
    );

    const threshold = 0.5;
    const isMatch = distance < threshold;

    setFaceScore(1 - distance);

    if (isMatch) {
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

  const handleConfirm = async () => {
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

    const proximity = validateProximity(geoLocation, stationGeo, stationGeo.radius || 100);
    if (!proximity.isValid) {
      setConfirmStatus({
        type: 'error',
        message: `Location verification failed. You are ${proximity.distance.toFixed(0)}m away from ${stationLabel}.`
      });
      return;
    }

    setIsProcessing(true);
    setConfirmStatus(null);

    try {
     const { record, action } = await recordAttendance({
  officer: authenticatedOfficer,
  mode,
  location: geoLocation,
  stationId
});
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
              disabled={!authenticatedOfficer || !geoLocation || !authenticatedOfficer.faceVerified || isProcessing}
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
      </div>
    </div>
  );
};

export default AttendanceConfirm;
