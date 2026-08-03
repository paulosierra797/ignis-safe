import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { authenticatePersonnel, getActivePersonnelSession, saveAuthToken } from '../utils/attendanceService';
import { validateQRSession } from '../utils/attendanceService';
import ignisSafeLogo from '../assets/Logo1.png';

import './AttendanceLogin.css';


const AttendanceLogin = () => {
  const navigate = useNavigate();
const [searchParams] = useSearchParams();
const sessionId = searchParams.get("station");
const buildConfirmUrl = useCallback((attendanceSessionId) =>
  `/attendance-confirm?auth=${encodeURIComponent(attendanceSessionId)}&station=${encodeURIComponent(sessionId || '')}`,
[sessionId]);
 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [qrValid, setQrValid] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
     if (!qrValid) {
    setError('Invalid or expired QR session');
    return;
  }

    setError('');

    if (!email.trim()) {
      setError('Please enter your account email');
      return;
    }

    if (!password) {
      setError('Please enter your account password');
      return;
    }

    setIsLoading(true);

    // Authenticate
    const officer = await authenticatePersonnel(email, password);
    if (officer) {
      const token = saveAuthToken(officer);
      setEmail('');
      setPassword('');
      navigate(buildConfirmUrl(token.sessionId), { replace: true });
    } else {
      setError('Invalid personnel account email or password. Please try again.');
    }

    setIsLoading(false);
  };
 useEffect(() => {
  let isCancelled = false;

  const checkQRAndSession = async () => {
    setIsCheckingSession(true);

    try {
      if (!sessionId) {
        setError("Invalid QR session");
        setQrValid(false);
        setIsCheckingSession(false);
        return;
      }

      const result = await validateQRSession(sessionId);

      if (isCancelled) return;

      if (!result.valid) {
        setError(result.reason);
        setQrValid(false);
        setIsCheckingSession(false);
        return;
      }

      setQrValid(true);
      setError('');

      const officer = await getActivePersonnelSession();
      if (isCancelled) return;

      if (officer) {
        const token = saveAuthToken(officer);
        navigate(buildConfirmUrl(token.sessionId), { replace: true });
        return;
      }

      setIsCheckingSession(false);
    } catch {
      if (!isCancelled) {
        setError('Could not validate the QR session. Please try again.');
        setQrValid(false);
        setIsCheckingSession(false);
      }
    }
  };

  checkQRAndSession();
  return () => {
    isCancelled = true;
  };
}, [buildConfirmUrl, navigate, sessionId]);
  

  return (
    <div className="attendance-login-page">
      <div className="attendance-login-shell">
        <aside className="attendance-login-intro" aria-labelledby="attendance-login-title">
          <div className="attendance-brand-surface">
            <img src={ignisSafeLogo} alt="IGNIS SAFE" className="attendance-brand-logo" />
          </div>

          <div className="login-header">
            <span className="login-badge">IGNIS SAFE</span>
            <h1 id="attendance-login-title">Personnel Login</h1>
            <p>Authenticate to mark attendance</p>
          </div>

          <div className="attendance-intro-accent" aria-hidden="true" />
        </aside>

        <section className="login-card" aria-label="Personnel attendance login form">

          {isCheckingSession ? (
            <div className="login-form">
              <div className="pin-hint">Checking your active personnel session...</div>
            </div>
          ) : !qrValid ? (
            <div className="login-form">
              {error && <div className="error-message">{error}</div>}
            </div>
          ) : (
            <form className="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email-input" className="form-label">
                Account Email
              </label>
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your account email"
                autoComplete="username"
                className="form-input"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="pin-input" className="form-label">
                Account Password
              </label>
              <div className="attendance-password-wrapper">
                <input
                  id="pin-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  autoComplete="current-password"
                  className="form-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="attendance-password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isLoading}
                >
                  {showPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
                </button>
              </div>
              <div className="pin-hint">Use the same password as your IGNIS SAFE account login.</div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="login-btn"
              disabled={isLoading || isCheckingSession || !qrValid || !email.trim() || !password}
            >
              {isLoading ? 'Logging in...' : 'Login & Continue'}
            </button>
          </form>
          )}

          {!isCheckingSession && qrValid && (
            <div className="login-footer">
              Only you can mark attendance with your credentials. Your account password is required for every session.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AttendanceLogin;
