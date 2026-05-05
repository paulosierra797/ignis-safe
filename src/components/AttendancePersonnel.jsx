import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './AttendancePersonnel.css';
import { QRCodeSVG } from 'qrcode.react';
import { generateQRSession, getExpiryTime } from '../utils/attendanceService';

const AttendancePersonnel = () => {
  const [timeStatus, setTimeStatus] = useState('');
  const [attendanceList, setAttendanceList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanMessage, setScanMessage] = useState('Waiting for confirmation');
  const [currentSession, setCurrentSession] = useState(null);
  const [expiryInfo, setExpiryInfo] = useState(null);
  const [copyMessage, setCopyMessage] = useState('');
  const rawBaseUrl = import.meta.env.VITE_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://ignis-safe.app');
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const stationLink = currentSession ? `${baseUrl}/attendance-login?station=${currentSession.sessionId}` : '';

  // Initialize QR session on component mount
  useEffect(() => {
    const session = generateQRSession();
    setCurrentSession(session);
  }, []);

  // Update expiry timer every second
  useEffect(() => {
    if (!currentSession) return;
    
    const interval = setInterval(() => {
      const info = getExpiryTime(currentSession.expiresAt);
      setExpiryInfo(info);
      
      // Auto-expire if time runs out
      if (info.remaining <= 0) {
        handleRefreshQR();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentSession]);

  const handleTimeIn = () => {
    setTimeStatus('in');
    setScanMessage('Time-in mode enabled');
  };

  const handleTimeOut = () => {
    setTimeStatus('out');
    setScanMessage('Time-out mode enabled');
  };

  const handleRefreshQR = () => {
    const session = generateQRSession();
    setCurrentSession(session);
    setExpiryInfo(getExpiryTime(session.expiresAt));
    setCopyMessage('New session generated');
  };

  const handleCopyLink = async () => {
    try {
      if (!stationLink) {
        setCopyMessage('Generating link...');
        return;
      }
      await navigator.clipboard.writeText(stationLink);
      setCopyMessage('Link copied');
    } catch (error) {
      setCopyMessage('Copy failed');
    }
  };

  const handleMockConfirm = () => {
    if (!timeStatus) {
      setScanMessage('Select Time In or Time Out before scanning');
      return;
    }
    const now = new Date();
    const mockPerson = {
      fullName: 'QR Personnel',
      rank: 'Fire Officer II',
      date: now.toLocaleDateString(),
      timeIn: timeStatus === 'in' ? now.toLocaleTimeString() : '',
      timeOut: timeStatus === 'out' ? now.toLocaleTimeString() : '',
      signature: 'QR Verified'
    };
    setAttendanceList([mockPerson, ...attendanceList]);
    setScanMessage('Confirmation received');
  };

  return (
    <div className="attendance-personnel-container">
      <Sidebar variant="personnel" />
      <div className="attendance-personnel-content">
        <PageHeader
          title="Attendance Management"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          
        />

        <div className="attendance-personnel-qr">
          <div className="qr-hero">
            <div className="qr-hero-text">
              <p className="qr-eyebrow">QR ATTENDANCE</p>
              <h2>Show QR. Confirm on Phone.</h2>
              <p className="qr-subtitle">
                The workstation displays a QR code. Personnel scan it with their phone
                to open a secure link and confirm Time In or Time Out.
              </p>
              <div className="qr-mode">
                <button
                  type="button"
                  className={`time-btn time-in ${timeStatus === 'in' ? 'active' : ''}`}
                  onClick={handleTimeIn}
                >
                  TIME IN
                </button>
                <button
                  type="button"
                  className={`time-btn time-out ${timeStatus === 'out' ? 'active' : ''}`}
                  onClick={handleTimeOut}
                >
                  TIME OUT
                </button>
              </div>
              <div className="qr-status">
                <span className="status-dot" aria-hidden="true" />
                <span>{scanMessage}</span>
              </div>
              
            </div>
            <div className="qr-hero-card">
              <div className="qr-card-header">
                <h3>Station QR</h3>
                <span className="qr-chip">LIVE</span>
              </div>
              <div className="qr-code">
                <div className="qr-expiry">
                  {expiryInfo && (
                    <span className={`expiry-text ${expiryInfo.remaining < 3600000 ? 'warning' : ''}`}>
                      Expires in {expiryInfo.hours}h {expiryInfo.minutes}m
                    </span>
                  )}
                </div>
                <div className="qr-grid" role="img" aria-label="QR code">
                  {stationLink ? (
                    <QRCodeSVG
                      value={stationLink}
                      size={220}
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

         
        </div>

      </div>
    </div>
  );
};

export default AttendancePersonnel;
