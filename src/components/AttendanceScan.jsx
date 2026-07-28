import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAuthToken, clearAuthToken } from '../utils/attendanceService';
import './AttendanceScan.css';

const AttendanceScan = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = getAuthToken();
  const [copied, setCopied] = useState('');
  const stationId = searchParams.get('station');
  const stationSuffix = stationId ? `&station=${encodeURIComponent(stationId)}` : '';

  useEffect(() => {
    if (!auth) {
      navigate('/attendance-login', { replace: true });
      return;
    }

    navigate(`/attendance-confirm?auth=${auth.sessionId}${stationSuffix}`, { replace: true });
  }, [auth, navigate, stationSuffix]);

  if (!auth) return null;

  const handleLogout = () => {
    clearAuthToken();
    navigate('/attendance-login');
  };

  const handleCopy = async () => {
    try {
      const link = `${window.location.origin}/attendance-confirm?auth=${auth.sessionId}${stationSuffix}`;
      await navigator.clipboard.writeText(link);
      setCopied('Copied!');
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('Failed');
    }
  };

  return (
    <div className="attendance-scan-page">
      <div className="scan-card">
        <div className="scan-header">
          <span className="scan-badge">IGNIS SAFE</span>
          <h1>Scan QR to Confirm</h1>
          <div className="auth-info">
            <div className="auth-name">{auth.name}</div>
            <div className="auth-rank">{auth.rank}</div>
          </div>
        </div>

        <div className="scan-instruction">
          <p>Redirecting to attendance confirmation...</p>
        </div>

        <div className="scan-link-section">
          <p className="scan-link-label">Enter confirmation manually:</p>
          <div className="scan-link-box">
            <span>{`${window.location.origin}/attendance-confirm?auth=${auth.sessionId}${stationSuffix}`}</span>
            <button className="copy-btn" onClick={handleCopy}>
              {copied || 'Copy'}
            </button>
          </div>
        </div>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>

        <div className="scan-footer">
          You are logged in as {auth.name}. Only you can mark attendance with this session.
        </div>
      </div>
    </div>
  );
};

export default AttendanceScan;
