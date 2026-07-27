import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaCheck, FaCircle, FaEye, FaEyeSlash, FaUserShield } from 'react-icons/fa';
import {
  activateInvitedAccount,
  getInviteActivationContext,
  resendSignupCode,
  signOut,
  verifySignupCode
} from '../utils/authService';
import { useUser } from '../context/UserContext';
import ignissafe from '../assets/Logo1.png';
import './ConfirmSignupPage.css';

const OTP_REQUEST_TIMEOUT_MS = 15000;
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const normalizeInviteRole = (role) => String(role || '').trim().toLowerCase() === 'admin'
  ? 'admin'
  : 'personnel';

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);

export default function ConfirmSignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCurrentUser } = useUser();
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(location.search);
  const isInviteActivation = searchParams.get('mode') === 'invite'
    || hashParams.get('type') === 'invite';
  const [inviteRole, setInviteRole] = useState(() => normalizeInviteRole(searchParams.get('portal')));
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const passwordChecks = [
    { key: 'length', label: 'At least 8 characters', met: password.length >= 8 },
    { key: 'uppercase', label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { key: 'lowercase', label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { key: 'number', label: 'One number', met: /\d/.test(password) },
    { key: 'special', label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
    {
      key: 'match',
      label: 'Passwords match',
      met: Boolean(confirmPassword) && password === confirmPassword
    }
  ];
  const isInvitePasswordValid = passwordChecks.every((check) => check.met);
  const isAdminInvite = inviteRole === 'admin';

  useEffect(() => {
    if (!isInviteActivation) {
      return;
    }

    let isCancelled = false;
    const loadInviteContext = async () => {
      const { data } = await getInviteActivationContext();
      if (!isCancelled && data?.role) {
        setInviteRole(normalizeInviteRole(data.role));
      }
    };

    void loadInviteContext();
    return () => {
      isCancelled = true;
    };
  }, [isInviteActivation]);
  
  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = otpCode.trim();

    if (!normalizedEmail || !normalizedCode) {
      setMessage({ type: 'error', text: 'Please enter both email address and OTP code.' });
      return;
    }

    setIsVerifying(true);
    setMessage({ type: '', text: '' });

    try {
      const { error } = await withTimeout(
        verifySignupCode(normalizedEmail, normalizedCode),
        OTP_REQUEST_TIMEOUT_MS,
        'Verification timed out. Please try again or request a new OTP code.'
      );
      if (error) {
        setMessage({ type: 'error', text: `Unable to verify code. ${error}` });
        return;
      }

      // Verification can create an authenticated session. Clear it so user lands on login.
      await signOut();
      setCurrentUser(null);
      localStorage.removeItem('user');

      setMessage({ type: 'success', text: 'Signup confirmed successfully. You can now sign in.' });
      setTimeout(() => {
        navigate('/login?verified=1', { replace: true });
      }, 1500);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to verify OTP code. Please try again.' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setMessage({ type: 'error', text: 'Enter your email first so we can resend the OTP code.' });
      return;
    }

    setIsResending(true);
    setMessage({ type: '', text: '' });

    try {
      const { error } = await withTimeout(
        resendSignupCode(normalizedEmail),
        OTP_REQUEST_TIMEOUT_MS,
        'Resend request timed out. Please try again.'
      );
      if (error) {
        setMessage({ type: 'error', text: `Unable to resend code. ${error}` });
        return;
      }

      setMessage({ type: 'success', text: 'A new OTP code was sent to your email.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to resend OTP code. Please try again.' });
    } finally {
      setIsResending(false);
    }
  };

  const handleActivateInvite = async (event) => {
    event.preventDefault();

    if (!strongPasswordRegex.test(password)) {
      setMessage({
        type: 'error',
        text: 'Use at least 8 characters with uppercase, lowercase, number, and special character.'
      });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setIsVerifying(true);
    setMessage({ type: '', text: '' });

    try {
      const { error } = await activateInvitedAccount(password);
      if (error) {
        setMessage({ type: 'error', text: error });
        return;
      }

      setCurrentUser(null);
      localStorage.removeItem('user');
      setMessage({ type: 'success', text: 'Account activated. You can now sign in.' });
      setTimeout(() => {
        navigate(`/login?verified=1&portal=${inviteRole}`, { replace: true });
      }, 1500);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Unable to activate this account.' });
    } finally {
      setIsVerifying(false);
    }
  };

  if (isInviteActivation) {
    return (
      <div className={`confirm-signup-page confirm-signup-page--${inviteRole}`}>
        <div className="confirm-signup-card" role="main" aria-labelledby="confirm-signup-title">
          <img className="confirm-signup-logo" src={ignissafe} alt="Ignis Safe" />
          <div className="confirm-signup-account-type">
            {isAdminInvite && <FaUserShield aria-hidden="true" />}
            <span>{isAdminInvite ? 'Administrator activation' : 'Personnel activation'}</span>
          </div>
          <h1 id="confirm-signup-title">
            {isAdminInvite ? 'Activate Admin Account' : 'Activate Personnel Account'}
          </h1>
          <p className="confirm-signup-description">
            {isAdminInvite
              ? 'Create your password to securely activate your administrator account.'
              : 'Create your password to finish activating your personnel account.'}
          </p>

          <form className="confirm-signup-form" onSubmit={handleActivateInvite}>
            <label htmlFor="invite-password">Password</label>
            <div className="confirm-signup-password-input">
              <input
                id="invite-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="confirm-signup-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
                disabled={isVerifying}
              >
                {showPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
              </button>
            </div>

            <label htmlFor="invite-confirm-password">Confirm Password</label>
            <div className="confirm-signup-password-input">
              <input
                id="invite-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="confirm-signup-password-toggle"
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                aria-pressed={showConfirmPassword}
                title={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                disabled={isVerifying}
              >
                {showConfirmPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
              </button>
            </div>

            <div className="confirm-signup-password-requirements" aria-live="polite">
              <p>Password must include:</p>
              <ul>
                {passwordChecks.map((check) => (
                  <li className={check.met ? 'is-met' : ''} key={check.key}>
                    {check.met
                      ? <FaCheck aria-hidden="true" />
                      : <FaCircle aria-hidden="true" />}
                    <span>{check.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {message.text && (
              <div className={`confirm-signup-message confirm-signup-message-${message.type}`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              className="confirm-signup-primary"
              disabled={isVerifying || !isInvitePasswordValid}
            >
              {isVerifying ? 'Activating...' : 'Activate Account'}
            </button>
          </form>

          <p className="confirm-signup-footer">
            Already activated? <Link to={`/login?portal=${inviteRole}`}>Go to Login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="confirm-signup-page">
      <div className="confirm-signup-card" role="main" aria-labelledby="confirm-signup-title">
        <img className="confirm-signup-logo" src={ignissafe} alt="Ignis Safe" />
        <h1 id="confirm-signup-title">Confirm Signup</h1>
        <p className="confirm-signup-description">
          Enter the OTP code sent to your email to complete account verification.
        </p>

        <form className="confirm-signup-form" onSubmit={handleVerifyOtp}>
          <label htmlFor="confirm-signup-email">Email Address</label>
          <input
            id="confirm-signup-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />

          <label htmlFor="confirm-signup-otp">OTP Code</label>
          <input
            id="confirm-signup-otp"
            type="text"
            placeholder="Enter your code"
            value={otpCode}
            onChange={(event) => setOtpCode(event.target.value.replace(/\s/g, ''))}
            autoComplete="one-time-code"
          />

          {message.text && (
            <div className={`confirm-signup-message confirm-signup-message-${message.type}`}>
              {message.text}
            </div>
          )}

          <button type="submit" className="confirm-signup-primary" disabled={isVerifying}>
            {isVerifying ? 'Verifying...' : 'Verify OTP'}
          </button>

          <button type="button" className="confirm-signup-secondary" onClick={handleResendCode} disabled={isResending}>
            {isResending ? 'Resending...' : 'Resend Code'}
          </button>
        </form>

        <p className="confirm-signup-footer">
          Already confirmed? <Link to="/login">Go to Login</Link>
        </p>
      </div>
    </div>
  );
}
