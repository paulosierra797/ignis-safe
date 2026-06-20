import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resendSignupCode } from '../utils/authService';
import { supabase } from '../utils/supabaseClient';
import { 
preAuth,
sendPasswordResetEmail,
verifyRecoveryCode,
sendLoginOtp,
updatePassword,
signOut,

verifyLoginOtp
} from '../utils/authService';
import { useUser } from '../context/UserContext';

import './LoginPage.css';
import ignissafe from '../assets/Logo1.png'

const REMEMBER_ME_KEY = 'remember_me';
const REMEMBERED_EMAIL_KEY = 'remembered_email';

export default function LoginPage() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState(null); // null, 'request', 'emailSent', 'verifyCode', 'setPassword', 'resetDone'
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isResetFlowActiveRef = useRef(false);
  const [authStep, setAuthStep] = useState("login");
  

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleNewPasswordVisibility = () => {
    setShowNewPassword(!showNewPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };
const normalizeRole = (role) =>
  
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");


  
  useEffect(() => {
    const savedRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';

    if (savedRememberMe && savedEmail) {
      setRememberMe(true);
      setEmail(savedEmail);
    }
  }, []);




  useEffect(() => {
    const recoveryInHash = window.location.hash.includes('type=recovery');
    const recoveryInQuery = new URLSearchParams(window.location.search).get('type') === 'recovery';

    if (recoveryInHash || recoveryInQuery) {
      setForgotPasswordStep('setPassword');
      setError('');
    }
  }, []);

  useEffect(() => {
    isResetFlowActiveRef.current = Boolean(forgotPasswordStep);
  }, [forgotPasswordStep]);

  useEffect(() => {
    return () => {
      if (isResetFlowActiveRef.current) {
        void signOut();
      }
    };
  }, []);

const handleLogin = async (e) => {
  e.preventDefault();

  setLoading(true);
  setError("");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });


  if (error) {
    setError("Invalid email or password");
    setLoading(false);
    return;
  }


  // password is correct now
  await sendLoginOtp(email);

  setResetEmail(email);
  setAuthStep("otp");

  setLoading(false);
};
  const handleForgotPasswordClick = (e) => {
    e.preventDefault();
    setForgotPasswordStep('request');
    setError("");
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    if (!resetEmail) {
      setError("Please enter your email address.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { error: resetError } = await sendPasswordResetEmail(resetEmail);

      if (resetError) {
        setError(resetError);
        setLoading(false);
        return;
      }

      setForgotPasswordStep('emailSent');
    } catch (err) {
      setError("Failed to send reset email. Please try again.");
      console.error("Password reset error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    isResetFlowActiveRef.current = Boolean(forgotPasswordStep);
  }, [forgotPasswordStep]);

  useEffect(() => {
    return () => {
      if (isResetFlowActiveRef.current) {
        void signOut();
      }
    };
  }, []);

 

  const handleSetPassword = async (e) => {
    e.preventDefault();
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (!strongPasswordRegex.test(newPassword)) {
      setError("Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { error: passwordError } = await updatePassword(newPassword);

      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }

      await signOut();
      localStorage.removeItem('user');
      window.history.replaceState({}, document.title, '/login');
      setForgotPasswordStep('resetDone');
    } catch (err) {
      setError("Failed to update password. Please try again.");
      console.error("Set password error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyResetCode = async (e) => {
    e.preventDefault();

    if (!resetEmail || !resetCode) {
      setError('Please enter your email and reset code.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: verifyError } = await verifyRecoveryCode(resetEmail.trim(), resetCode.trim());
      if (verifyError) {
        setError(`Invalid or expired reset code. ${verifyError}`);
        setLoading(false);
        return;
      }

      setForgotPasswordStep('setPassword');
      setError('');
    } catch (err) {
      setError('Failed to verify reset code. Please try again.');
      console.error('Verify reset code error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = async () => {
    await signOut();
    setCurrentUser(null);
    setForgotPasswordStep(null);
    setResetEmail("");
    setResetCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    window.history.replaceState({}, document.title, '/login');
  };
const handleVerify = async (e) => {
  e.preventDefault();

  setLoading(true);
  setError("");

  const { data, error } = await verifyLoginOtp(
    resetEmail.trim(),
    resetCode.trim()
  );

  if (error) {
    setError(error.message);
    setLoading(false);
    return;
  }

  console.log("LOGIN USER:", data.user);
  console.log("ROLE:", data.user?.role);


  const user = {
  ...data.user,
  role: normalizeRole(data.user.role),
};

console.log("FINAL ROLE:", user.role);

setCurrentUser(user);

  setAuthStep("authenticated");
  setLoading(false);
};
useEffect(() => {
  if (authStep !== "authenticated") return;

  const role = normalizeRole(currentUser?.role);
  if (!role) return;

  const routes = {
    admin: "/dashboard",
    personnel: "/personnel/operations",
  };

  console.log("ROLE:", role);

  if (routes[role]) {
  navigate(routes[role], { replace: true });
} else {
  console.error("Unknown role:", role);
}
}, [currentUser, authStep, navigate]);

  return (
    <div className="login-page">
      {authStep === "otp"? (
  <>
    <div className="login-left">
      <div className="logo-section">
        <img src={ignissafe} alt="Ignis Safe Logo" className="login-logo" />
      </div>
    </div>

    <div className="login-right">
      <div className="login-form-container">
        <h1>Verify Login</h1>
        <p className="login-description">
          Enter the OTP sent to {resetEmail}
        </p>

        <input
          type="text"
          placeholder="Enter OTP"
          value={resetCode}
          onChange={(e) => setResetCode(e.target.value)}
        />

        {error && <p className="error-message">{error}</p>}

        <button onClick={handleVerify} className="login-button">
          Verify & Login
        </button>

        <button onClick={handleBackToLogin} className="back-button">
          Back
        </button>
      </div>
    </div>
  </>
) : 
      forgotPasswordStep === 'request' ? (
        <>
          <div className="login-left">
            <div className="logo-section">
              <img src={ignissafe} alt="Ignis Safe Logo" className="login-logo" />
            </div>
          </div>
          <div className="login-right">
            <div className="login-form-container">
              <h1>Forgot your password?</h1>
            <p className="login-description">
              Enter your email address and we'll send you a verification code to reset your password.
            </p>
            <form onSubmit={handleRequestReset} className="login-form">
              <div className="form-group">
                <label htmlFor="reset-email">Email Address</label>
                <input
                  type="email"
                  id="reset-email"
                  placeholder=" "
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>
              {error && <p className="error-message">{error}</p>}
              <button type="submit" className="login-button">Send Reset Code</button>
              <button type="button" onClick={handleBackToLogin} className="back-button">Back to Login</button>
            </form>
          </div>
        </div>
      </>
      ) : forgotPasswordStep === 'setPassword' ? (
        <>
          <div className="login-left">
            <div className="logo-section">
              <img src={ignissafe} alt="Ignis Safe Logo" className="login-logo" />
            </div>
          </div>
          <div className="login-right">
            <div className="login-form-container">
              <h1>Set a password</h1>
            <p className="login-description">
              Create a new password for your account
            </p>
            <form onSubmit={handleSetPassword} className="login-form">
              <div className="form-group">
                <label htmlFor="new-password">New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    id="new-password"
                    placeholder=" "
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={toggleNewPasswordVisibility}
                  >
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="confirm-password">Confirm Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirm-password"
                    placeholder=" "
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={toggleConfirmPasswordVisibility}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
              {error && <p className="error-message">{error}</p>}
              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'Updating...' : 'Set Password'}
              </button>
              <button type="button" onClick={handleBackToLogin} className="back-button">Back to Login</button>
            </form>
          </div>
        </div>
      </>
      ) : forgotPasswordStep === 'verifyCode' ? (
        <>
          <div className="login-left">
            <div className="logo-section">
              <img src={ignissafe} alt="Ignis Safe Logo" className="login-logo" />
            </div>
          </div>
          <div className="login-right">
            <div className="login-form-container">
              <h1>Verify reset code</h1>
              <p className="login-description">
                Enter the code sent to your email before setting a new password.
              </p>
              <form onSubmit={handleVerifyResetCode} className="login-form">
                <div className="form-group">
                  <label htmlFor="reset-email-verify">Email Address</label>
                  <input
                    type="email"
                    id="reset-email-verify"
                    placeholder=" "
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reset-code-verify">Reset Code</label>
                  <input
                    type="text"
                    id="reset-code-verify"
                    placeholder=" "
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    autoComplete="one-time-code"
                    required
                  />
                </div>

                {error && <p className="error-message">{error}</p>}
                <button type="submit" className="login-button" disabled={loading}>
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button type="button" onClick={handleBackToLogin} className="back-button">Back to Login</button>
              </form>
            </div>
          </div>
        </>
      ) : forgotPasswordStep === 'emailSent' ? (
        <>
          <div className="login-left">
            <div className="logo-section">
              <img src={ignissafe} alt="Ignis Safe Logo" className="login-logo" />
            </div>
          </div>
          <div className="login-right">
            <div className="login-form-container confirmation-container">
              <div className="confirmation-icon">✓</div>
              <h1>EMAIL SENT</h1>
              <p className="login-description">
                We sent a reset code to {resetEmail}. Enter the code to set a new password.
              </p>
              <button onClick={() => setForgotPasswordStep('verifyCode')} className="login-button">Enter Reset Code</button>
              <button onClick={handleBackToLogin} className="login-button">Back to Login</button>
            </div>
          </div>
        </>
      ) : forgotPasswordStep === 'resetDone' ? (
        <>
          <div className="login-left">
            <div className="logo-section">
              <img src={ignissafe} alt="Ignis Safe Logo" className="login-logo" />
            </div>
          </div>
          <div className="login-right">
            <div className="login-form-container confirmation-container">
              <div className="confirmation-icon">✓</div>
              <h1>PASSWORD UPDATED</h1>
              <p className="login-description">
                Your password has been updated successfully.
              </p>
              <button onClick={handleBackToLogin} className="login-button">Back to Login</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="login-left">
            <div className="logo-section">
              <img src={ignissafe} alt="Ignis Safe Logo" className="login-logo" />
            </div>
          </div>
          <div className="login-right">
            <div className="login-form-container">
              <h1>Welcome, Admins!</h1>
              <p className="login-description">
                This platform is exclusively designed for the Bureau of Fire Protection (BFP) Dasmariñas.
              </p>
              <form onSubmit={handleLogin} className="login-form">
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    placeholder=" "
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      placeholder=" "
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-password"
                      onClick={togglePasswordVisibility}
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>

                <div className="login-options">
                  <label className="remember-me">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    Remember me
                  </label>
                  <a href="#" onClick={handleForgotPasswordClick} className="forgot-password">Forgot Password</a>
                </div>

                {error && <p className="error-message">{error}</p>}

                <button type="submit" className="login-button" disabled={loading}>
                  {loading ? 'Loading...' : 'Login'}
                </button>
              </form>
              <p className="login-footer">Authorized users only</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}