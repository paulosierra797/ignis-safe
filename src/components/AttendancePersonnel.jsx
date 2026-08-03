import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import {
  generateQRSession,
  getActiveQRSession,
  getExpiryTime,
  getAttendanceStatus,
  getMyAttendanceHistory
} from '../utils/attendanceService';
import './AttendancePersonnel.css';

const AttendancePersonnel = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSession, setCurrentSession] = useState(null);
  const [expiryInfo, setExpiryInfo] = useState(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [todayStatus, setTodayStatus] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [searchParams] = useSearchParams();

  const stationId = searchParams.get('station') || 'DEFAULT';
  const rawBaseUrl = import.meta.env.VITE_PUBLIC_BASE_URL
    || (typeof window !== 'undefined' ? window.location.origin : 'https://ignis-safe.app');
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const stationLink = currentSession
    ? `${baseUrl}/attendance-login?station=${currentSession.session_id}`
    : '';

  const handleRefreshQR = useCallback(async () => {
    try {
      const session = await generateQRSession(stationId);
      setCurrentSession(session);
      setExpiryInfo(getExpiryTime(new Date(session.expires_at).getTime()));
      setCopyMessage('');
    } catch (error) {
      setCopyMessage(error.message || 'Could not refresh the QR code.');
    }
  }, [stationId]);

  useEffect(() => {
    let isCancelled = false;

    const initQR = async () => {
      try {
        const activeSession = await getActiveQRSession(stationId);
        const session = activeSession || await generateQRSession(stationId);
        if (!isCancelled) {
          setCurrentSession(session);
          setExpiryInfo(getExpiryTime(new Date(session.expires_at).getTime()));
        }
      } catch (error) {
        if (!isCancelled) {
          setCopyMessage(error.message || 'Could not load the QR code.');
        }
      }
    };

    void initQR();
    return () => {
      isCancelled = true;
    };
  }, [stationId]);

  useEffect(() => {
    if (!currentSession) return undefined;

    const interval = window.setInterval(() => {
      const expires = new Date(currentSession.expires_at).getTime();
      if (Number.isNaN(expires)) return;

      const nextExpiry = getExpiryTime(expires);
      setExpiryInfo(nextExpiry);

      if (nextExpiry.remaining <= 0) {
        window.clearInterval(interval);
        void handleRefreshQR();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentSession, handleRefreshQR]);

  useEffect(() => {
    let isCancelled = false;

    const loadAttendanceOverview = async () => {
      setIsHistoryLoading(true);
      setHistoryError('');

      try {
        const [status, history] = await Promise.all([
          getAttendanceStatus({ shiftId: stationId }),
          getMyAttendanceHistory(20)
        ]);

        if (!isCancelled) {
          setTodayStatus(status);
          setAttendanceHistory(history);
        }
      } catch (error) {
        if (!isCancelled) {
          setHistoryError(error.message || 'Could not load attendance history.');
        }
      } finally {
        if (!isCancelled) {
          setIsHistoryLoading(false);
        }
      }
    };

    void loadAttendanceOverview();
    return () => {
      isCancelled = true;
    };
  }, [stationId]);

  const handleCopyLink = async () => {
    try {
      if (!stationLink) {
        setCopyMessage('Generating link...');
        return;
      }
      await navigator.clipboard.writeText(stationLink);
      setCopyMessage('Link copied');
    } catch {
      setCopyMessage('Copy failed');
    }
  };

  return (
    <div className="attendance-personnel-container">
      <Sidebar variant="personnel" />
      <div className="attendance-personnel-content">
        <PageHeader
          title="Attendance"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
        />

        <div className="attendance-personnel-qr">
          <div className="qr-hero">
            <div className="qr-hero-text">
              <p className="qr-eyebrow">QR ATTENDANCE</p>
              <h2>Scan the QR Code to Record Attendance</h2>
              <p className="qr-subtitle">
                Log in using your personnel account, then scan the QR code with your
                mobile phone to open the secure attendance page.
              </p>

              <div className="qr-instructions">
                <h3 className="qr-instructions-title">How it works:</h3>
                <ol className="qr-instructions-list">
                  <li>Register your face first through Profile &gt; Register Face ID.</li>
                  <li>Scan the QR code and log in using your personnel account credentials.</li>
                  <li>Allow camera and location access when prompted.</li>
                  <li>Complete the facial and location verification.</li>
                  <li>Select Time In or Time Out, then confirm your attendance.</li>
                </ol>
              </div>

              <div className="qr-important">
                <strong>Important:</strong> The QR code refreshes every five minutes for
                security. If scanning fails, use the Copy Link button below the QR code.
              </div>
            </div>

            <div className="qr-hero-card">
              <div className="qr-card-header">
                <h3>Station QR</h3>
                <span className="qr-chip">LIVE</span>
              </div>
              <div className="qr-code">
                <div className="qr-expiry">
                  {expiryInfo && expiryInfo.remaining > 0 ? (
                    <span className="qr-expiry-text">
                      Expires in {expiryInfo.hours}h {expiryInfo.minutes}m {expiryInfo.seconds}s
                    </span>
                  ) : (
                    <span>QR expired</span>
                  )}
                </div>
                <div className="qr-grid" role="img" aria-label="QR code">
                  {stationLink ? (
                    <QRCodeSVG
                      value={stationLink}
                      size={300}
                      marginSize={2}
                      bgColor="#ffffff"
                      fgColor="#111111"
                      level="M"
                      title="Station QR"
                    />
                  ) : (
                    <span className="qr-loading">Generating QR...</span>
                  )}
                </div>
              </div>
              <div className="qr-link">
                <span>{stationLink || 'Loading...'}</span>
                <button type="button" className="ghost-btn" onClick={handleCopyLink}>
                  Copy link
                </button>
              </div>
              {copyMessage && <div className="qr-feedback">{copyMessage}</div>}
            </div>
          </div>

          <div className="attendance-list-table-container" id="attendance-history">
            <div className="table-header">
              <div>
                <h3>My Attendance</h3>
                <p className="attendance-history-summary">
                  {todayStatus?.message || 'Checking today\'s attendance status...'}
                </p>
              </div>
            </div>

            <table className="attendance-list-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {isHistoryLoading ? (
                  <tr>
                    <td colSpan="5" className="empty-state">Loading attendance history...</td>
                  </tr>
                ) : historyError ? (
                  <tr>
                    <td colSpan="5" className="empty-state">{historyError}</td>
                  </tr>
                ) : attendanceHistory.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-state">No attendance records yet.</td>
                  </tr>
                ) : (
                  attendanceHistory.map((record) => (
                    <tr key={record.id}>
                      <td>{record.date}</td>
                      <td>{record.shiftId}</td>
                      <td>{record.timeIn || '--'}</td>
                      <td>{record.timeOut || '--'}</td>
                      <td>{record.timeIn && record.timeOut ? 'Completed' : 'Time In recorded'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendancePersonnel;
