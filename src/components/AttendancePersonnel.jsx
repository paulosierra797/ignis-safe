import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import CloseButton from './CloseButton';
import {
  generateQRSession,
  getActiveQRSession,
  getExpiryTime,
  getAttendanceStatus,
  getMyAttendanceHistory
} from '../utils/attendanceService';
import './AttendancePersonnel.css';

const formatDistance = (distanceMeters) => {
  const distance = Number(distanceMeters);
  if (!Number.isFinite(distance)) return 'Not recorded';
  if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km`;
  return `${Math.round(distance)} m`;
};

const getVerificationLabel = (status) => {
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  if (status === 'partial') return 'Partial';
  return 'Not recorded';
};

const getCheckLabel = (value) => {
  if (value === true) return 'Passed';
  if (value === false) return 'Failed';
  return 'Not recorded';
};

const getAttendanceStatusLabel = (record) => {
  if (record.timeIn && record.timeOut) return 'Completed';
  if (record.timeIn) return 'Time In recorded';
  return 'Not recorded';
};

const AttendancePersonnel = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSession, setCurrentSession] = useState(null);
  const [expiryInfo, setExpiryInfo] = useState(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [todayStatus, setTodayStatus] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [searchParams] = useSearchParams();

  const stationId = searchParams.get('station') || 'DEFAULT';
  const rawBaseUrl = import.meta.env.VITE_PUBLIC_BASE_URL
    || (typeof window !== 'undefined' ? window.location.origin : 'https://ignis-safe.app');
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const stationLink = currentSession
    ? `${baseUrl}/attendance-login?station=${currentSession.session_id}`
    : '';

  useEffect(() => {
    if (!selectedRecord) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedRecord(null);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedRecord]);

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
                  <li>
                    <strong>Register your Face ID</strong> through <strong>Profile &gt; Register Face ID</strong>.
                    For security purposes, Face ID may only be updated once every <strong>7 days</strong>.
                  </li>
                  <li>
                    <strong>Scan the Station QR Code or use the Copy Link</strong> to access the secure
                    attendance page.
                  </li>
                  <li>
                    Grant <strong>camera and location permissions</strong> when requested by the system.
                  </li>
                  <li>
                    Complete the required <strong>facial and location verification</strong> before recording
                    attendance.
                  </li>
                  <li>
                    <strong>Time In</strong> must be completed first. <strong>Time Out</strong> will only
                    become available after a valid Time In has been successfully recorded.
                  </li>
                </ol>
              </div>

              <div className="qr-important">
                <strong>Important:</strong> Each QR code and copied link is valid for 5 minutes only.
                Finish face, location, and attendance verification before it expires. After
                expiry, wait for the new QR code or copy the new link shown below.
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
                      Expires in {expiryInfo.minutes}m {expiryInfo.seconds}s
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
                  <th>Attendance Status</th>
                  <th>Verification</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {isHistoryLoading ? (
                  <tr>
                    <td colSpan="7" className="empty-state">Loading attendance history...</td>
                  </tr>
                ) : historyError ? (
                  <tr>
                    <td colSpan="7" className="empty-state">{historyError}</td>
                  </tr>
                ) : attendanceHistory.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">No attendance records yet.</td>
                  </tr>
                ) : (
                  attendanceHistory.map((record) => (
                    <tr key={record.id}>
                      <td>{record.date}</td>
                      <td>{record.shiftId}</td>
                      <td>{record.timeIn || '--'}</td>
                      <td>{record.timeOut || '--'}</td>
                      <td>{getAttendanceStatusLabel(record)}</td>
                      <td>
                        <span className={`attendance-verification-badge ${record.verificationStatus}`}>
                          {getVerificationLabel(record.verificationStatus)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="attendance-details-btn"
                          onClick={() => setSelectedRecord(record)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedRecord && (
          <div
            className="attendance-details-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedRecord(null);
            }}
          >
            <section
              className="attendance-details-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="myAttendanceDetailsTitle"
            >
              <header className="attendance-details-header">
                <div>
                  <span className="attendance-details-eyebrow">Attendance verification</span>
                  <h2 id="myAttendanceDetailsTitle">{selectedRecord.name}</h2>
                  <p>{selectedRecord.rank} · {selectedRecord.date} · Shift {selectedRecord.shiftId}</p>
                </div>
                <CloseButton
                  className="attendance-details-close"
                  onClick={() => setSelectedRecord(null)}
                  label="Close verification details"
                />
              </header>

              <div className="attendance-details-status-row">
                <span className={`attendance-verification-badge large ${selectedRecord.verificationStatus}`}>
                  Overall: {getVerificationLabel(selectedRecord.verificationStatus)}
                </span>
                <span className="attendance-verification-event">
                  {getAttendanceStatusLabel(selectedRecord)}
                </span>
              </div>

              <div className="attendance-details-grid">
                <article className="attendance-detail-card">
                  <h3>Attendance</h3>
                  <dl>
                    <div>
                      <dt>Date</dt>
                      <dd>{selectedRecord.date}</dd>
                    </div>
                    <div>
                      <dt>Assigned shift</dt>
                      <dd>{selectedRecord.shiftId}</dd>
                    </div>
                    <div>
                      <dt>Time In</dt>
                      <dd>{selectedRecord.timeIn || 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Time Out</dt>
                      <dd>{selectedRecord.timeOut || 'Not recorded'}</dd>
                    </div>
                  </dl>
                </article>

                <article className="attendance-detail-card">
                  <h3>Verified Location</h3>
                  <dl>
                    <div>
                      <dt>Readable address</dt>
                      <dd>{selectedRecord.location?.address || selectedRecord.stationName || 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Latitude</dt>
                      <dd>{selectedRecord.location?.latitude ?? 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Longitude</dt>
                      <dd>{selectedRecord.location?.longitude ?? 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>GPS accuracy</dt>
                      <dd>{Number.isFinite(Number(selectedRecord.location?.accuracy)) ? `${Math.round(Number(selectedRecord.location.accuracy))} m` : 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Distance from station</dt>
                      <dd>{formatDistance(selectedRecord.distanceFromStationMeters)}</dd>
                    </div>
                    <div>
                      <dt>Location check</dt>
                      <dd className={selectedRecord.locationVerificationPassed === true ? 'verification-pass' : selectedRecord.locationVerificationPassed === false ? 'verification-fail' : ''}>
                        {getCheckLabel(selectedRecord.locationVerificationPassed)}
                      </dd>
                    </div>
                  </dl>
                </article>

                <article className="attendance-detail-card">
                  <h3>Face ID Verification</h3>
                  <dl>
                    <div>
                      <dt>Face check</dt>
                      <dd className={selectedRecord.faceVerificationPassed === true ? 'verification-pass' : selectedRecord.faceVerificationPassed === false ? 'verification-fail' : ''}>
                        {getCheckLabel(selectedRecord.faceVerificationPassed)}
                      </dd>
                    </div>
                    <div>
                      <dt>Verified at</dt>
                      <dd>
                        {selectedRecord.verificationRecordedAt
                          ? new Date(selectedRecord.verificationRecordedAt).toLocaleString()
                          : 'Not recorded'}
                      </dd>
                    </div>
                  </dl>

                  <div className="attendance-verification-photo">
                    {selectedRecord.verificationPhotoUrl ? (
                      <img
                        src={selectedRecord.verificationPhotoUrl}
                        alt={`Verification capture for ${selectedRecord.name}`}
                      />
                    ) : (
                      <div className="attendance-photo-empty">No verification photo recorded</div>
                    )}
                  </div>
                </article>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendancePersonnel;
