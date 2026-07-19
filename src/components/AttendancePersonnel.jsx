import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './AttendancePersonnel.css';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'react-router-dom';
import { generateQRSession, getExpiryTime } from '../utils/attendanceService';
import { supabase } from '../utils/supabaseClient';




const AttendancePersonnel = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSession, setCurrentSession] = useState(null);
  const [expiryInfo, setExpiryInfo] = useState(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [searchParams] = useSearchParams();
 
  
const stationId = searchParams.get('station') || 'DEFAULT';
  const rawBaseUrl = import.meta.env.VITE_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://ignis-safe.app');
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
 const stationLink = currentSession
  ? `${baseUrl}/attendance-login?station=${currentSession.session_id}`
  : '';
 
const safeExpiry = currentSession?.expires_at
  ? new Date(currentSession.expires_at).getTime()
  : null;

const info = safeExpiry
  ? getExpiryTime(safeExpiry)
  : null;
  // Initialize QR session on component mount
useEffect(() => {
const initQR = async () => {

  const now = new Date(); // ✅ ADD THIS

  const { data } = await supabase
    .from('qr_sessions')
    .select('*')
    .eq('station_id', stationId)
    .eq('used', false)
    .gt('expires_at', now.toISOString()) // now is now defined
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    setCurrentSession(data);
    return;
  }

  const newSession = await generateQRSession(stationId);
  setCurrentSession(newSession);
};


  initQR();

}, [stationId]);

  // Update expiry timer every second
 useEffect(() => {
  if (!currentSession) return;

  const interval = setInterval(() => {
    const expires = new Date(currentSession.expires_at).getTime();

    if (isNaN(expires)) return;

    const info = getExpiryTime(expires);
    setExpiryInfo(info);

    if (info.remaining <= 0) {
      handleRefreshQR();
    }
  }, 1000);

  return () => clearInterval(interval);
}, [currentSession]);

  const handleRefreshQR = async () => {
  const session = await generateQRSession(stationId);
  setCurrentSession(session);

  const expires = new Date(session.expires_at).getTime();
  setExpiryInfo(getExpiryTime(expires));
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
                <strong>Important:</strong> The QR code refreshes every four minutes for
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
    Expires in {expiryInfo.hours}h {expiryInfo.minutes}m
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

         
        </div>

      </div>
    </div>
  );
};

export default AttendancePersonnel;
