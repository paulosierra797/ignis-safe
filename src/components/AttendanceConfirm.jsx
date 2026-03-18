import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './AttendanceConfirm.css';
import { 
  requestGeoLocation, 
  validateProximity, 
  getAuthToken,
  isAuthValid,
  getStationGeo,
  recordAttendance
} from '../utils/attendanceService';

const AttendanceConfirm = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('Select Time In or Time Out to continue.');
  const [authenticatedOfficer, setAuthenticatedOfficer] = useState(null);
  const [geoLocation, setGeoLocation] = useState(null);
  const [geoStatus, setGeoStatus] = useState('Request location access');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(null);
  const [authError, setAuthError] = useState('');
  const authSessionId = searchParams.get('auth');
  const stationId = searchParams.get('station');
  const stationGeo = useMemo(() => getStationGeo(stationId), [stationId]);
  const stationLabel = stationGeo.stationId && stationGeo.stationId !== 'DEFAULT'
    ? `${stationGeo.name} (${stationGeo.stationId})`
    : stationGeo.name;

  // Verify authentication on mount
  useEffect(() => {
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
        location: geoLocation
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
              disabled={!authenticatedOfficer || !geoLocation || isProcessing}
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
              Your location and attendance details are verified and logged instantly. Only you can mark attendance with this session.
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AttendanceConfirm;
