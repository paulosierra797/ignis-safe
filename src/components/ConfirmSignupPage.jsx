import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resendSignupCode, signOut, verifySignupCode } from '../utils/authService';
import { useUser } from '../context/UserContext';
import ignissafe from '../assets/Logo1.png';
import './ConfirmSignupPage.css';

const OTP_REQUEST_TIMEOUT_MS = 15000;

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);

export default function ConfirmSignupPage() {
  const navigate = useNavigate();
  const { setCurrentUser } = useUser();
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  
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
