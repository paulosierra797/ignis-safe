import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { validateQRSession, claimQRSession, getActivePersonnelSession, saveAuthToken } from '../utils/attendanceService';
import { supabase } from '../utils/supabaseClient';
import ignisSafeLogo from '../assets/Logo1.png';

import './AttendanceLogin.css';

// Bounce-through controller for the Attendance QR flow: it never asks for
// credentials itself. It resolves the visitor's existing session (personnel
// login lives on the normal /login page) and either continues straight into
// attendance validation or sends them to /login with a return URL back here.
const AttendanceLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('station');

  const buildConfirmUrl = useCallback((attendanceSessionId) =>
    `/attendance-confirm?auth=${encodeURIComponent(attendanceSessionId)}&station=${encodeURIComponent(sessionId || '')}`,
  [sessionId]);

  const buildLoginBounceUrl = useCallback(() =>
    `/attendance-login?station=${encodeURIComponent(sessionId || '')}`,
  [sessionId]);

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const checkQRAndSession = async () => {
      setIsCheckingSession(true);
      setError('');

      try {
        if (!sessionId) {
          if (!isCancelled) {
            setError('Invalid QR session');
            setIsCheckingSession(false);
          }
          return;
        }

        const result = await validateQRSession(sessionId);
        if (isCancelled) return;

        if (!result.valid) {
          setError(result.reason);
          setIsCheckingSession(false);
          return;
        }

        // Already authenticated as a valid personnel account - skip straight
        // to attendance validation, no re-entry of credentials.
        const officer = await getActivePersonnelSession();
        if (isCancelled) return;

        if (officer) {
          // Lock this scanned QR to the personnel now. The QR keeps rotating
          // every 60s for security, but this claim gives them ~5 minutes to
          // finish face + location + House Rules + submission without the
          // rotation invalidating the session they scanned.
          const claim = await claimQRSession(sessionId);
          if (isCancelled) return;

          if (!claim.valid) {
            setError(claim.reason);
            setIsCheckingSession(false);
            return;
          }

          const token = saveAuthToken(officer);
          navigate(buildConfirmUrl(token.sessionId), { replace: true });
          return;
        }

        // No usable personnel session. Distinguish "not logged in at all"
        // (send to the normal login page and come straight back here) from
        // "logged in but this account can't mark attendance" (surface an
        // error instead of bouncing back to /login in a loop).
        const { data: sessionData } = await supabase.auth.getSession();
        if (isCancelled) return;

        if (!sessionData?.session) {
          navigate(`/login?redirect=${encodeURIComponent(buildLoginBounceUrl())}`, { replace: true });
          return;
        }

        setError('This account is not authorized to mark attendance. Please sign in with a valid personnel account.');
        setIsCheckingSession(false);
      } catch {
        if (!isCancelled) {
          setError('Could not validate the QR session. Please try again.');
          setIsCheckingSession(false);
        }
      }
    };

    checkQRAndSession();
    return () => {
      isCancelled = true;
    };
  }, [buildConfirmUrl, buildLoginBounceUrl, navigate, sessionId]);

  return (
    <div className="attendance-login-page">
      <div className="attendance-session-check" role="status" aria-live="polite">
        {isCheckingSession ? (
          <>
            <div className="attendance-session-check-spinner" aria-hidden="true" />
            <p>Loading...</p>
          </>
        ) : (
          <>
            <img src={ignisSafeLogo} alt="IGNIS SAFE" className="attendance-brand-logo" />
            <p>{error || 'Unable to continue.'}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AttendanceLogin;
