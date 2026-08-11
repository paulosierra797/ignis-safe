import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaEye, FaEyeSlash } from 'react-icons/fa';
import { supabase } from '../utils/supabaseClient';
import {
sendPasswordResetEmail,
verifyRecoveryCode,
sendLoginOtp,
updatePassword,
signOut,

verifyLoginOtp
} from '../utils/authService';
import { useUser } from '../context/UserContext';
import { getOrCreateDeviceCredentials } from '../utils/deviceTrust';
import { setAuthFlowGated } from '../utils/authFlowGate';
import { logPersonnelActivity } from '../utils/activityLogService';

import './LoginPage.css';
import ignissafe from '../assets/Logo1.png'
import bfpDasmaLogo from '../assets/bfp_dasma.png';

const LoginBrandPanel = ({ portal }) => {
  const isPersonnel = portal === 'personnel';

  return (
  <aside className="login-left" aria-label={`IGNIS SAFE ${isPersonnel ? 'personnel' : 'admin'} welcome`}>
    <div className="logo-section">
      <img src={ignissafe} alt="Ignis Safe Logo" className="login-logo" />
    </div>

    <div className="login-brand-content">
      <img
        src={bfpDasmaLogo}
        alt="Bureau of Fire Protection Dasmariñas City Fire Station logo"
        className="login-bfp-logo"
      />
      <div className="login-brand-rule" aria-hidden="true" />
      <h1>{isPersonnel ? 'Welcome, Personnel!' : 'Welcome, Admins!'}</h1>
      <p>
        {isPersonnel
          ? 'Access your IGNIS SAFE personnel workspace for attendance, reports, and assigned services.'
          : 'This platform is exclusively designed for the Bureau of Fire Protection (BFP) Dasmariñas.'}
      </p>
    </div>

    <div className="login-brand-decoration" aria-hidden="true" />
  </aside>
  );
};

const REMEMBER_ME_KEY = 'remember_me';
const REMEMBERED_EMAIL_KEY = 'remembered_email';
const OTP_LENGTH = 6;
const TRUST_DURATION_MS = {
  personnel: 14 * 24 * 60 * 60 * 1000,
  admin: 12 * 60 * 60 * 1000
};

const preloadPortalWorkspace = (role) => {
  if (role === 'admin') return import('./Dashboard');
  if (role === 'personnel') return import('./PersonnelOperations');
  return Promise.resolve();
};

const validateTrustedDeviceRecord = (record, { deviceId, userId }) => {
  const role = String(record?.role_at_trust || '').trim().toLowerCase();
  const expectedDuration = role === 'personnel'
    ? TRUST_DURATION_MS.personnel
    : TRUST_DURATION_MS.admin;
  const remainingDuration = new Date(record?.expires_at).getTime() - Date.now();
  const clockTolerance = 10 * 60 * 1000;

  return record?.trusted === true
    && record?.device_id === deviceId
    && record?.user_id === userId
    && Number.isFinite(remainingDuration)
    && Math.abs(remainingDuration - expectedDuration) <= clockTolerance;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, refreshCurrentUser } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [pendingRole, setPendingRole] = useState('');
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

const logLoginIfPersonnel = (user) => {
  if (normalizeRole(user?.role) !== 'personnel' || !user?.admin_id) return;

  void logPersonnelActivity({
    personnelId: user.admin_id,
    activityType: 'login',
    action: 'Login',
    details: 'Logged in successfully.'
  });
};


  
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
        setAuthFlowGated(false);
        void signOut();
      }
    };
  }, []);

const handleLogin = async (e) => {
  e.preventDefault();

  setLoading(true);
  setError('');
  setAuthFlowGated(true);
  const normalizedEmail = email.trim().toLowerCase();

  if (rememberMe) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
    localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError) {
      throw new Error('Invalid email or password');
    }

    const { data: loginProfile, error: profileError } = await supabase
      .from('admin')
      .select('*')
      .eq('admin_id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      await supabase.auth.signOut({ scope: 'local' });
      localStorage.removeItem('user');
      setCurrentUser(null);
      throw new Error('Could not verify the account type. Please try again.');
    }

    const authenticatedRole = normalizeRole(loginProfile?.role);
    const authenticatedStatus = String(loginProfile?.status || '').trim().toLowerCase();

    if (authenticatedRole === 'admin' && authenticatedStatus !== 'active') {
      try {
        await supabase.rpc('revoke_all_devices');
      } catch (revokeError) {
        console.warn('Could not revoke trusted devices for inactive admin account:', revokeError);
      }
      await supabase.auth.signOut({ scope: 'local' });
      localStorage.removeItem('user');
      setCurrentUser(null);
      setPendingRole('');
      throw new Error('Access denied. This admin account is not active.');
    }

    // Credentials alone are not authorization. A row must exist in `admin`
    // with a recognized role and a non-deactivated status, or this account
    // (e.g. a mobile-app-only user with no `admin` row) must never reach the
    // OTP step or an authenticated session, regardless of valid password.
    const isAuthorizedBackofficeAccount = Boolean(loginProfile)
      && (authenticatedRole === 'admin' || authenticatedRole === 'personnel')
      && authenticatedStatus !== 'inactive'
      && authenticatedStatus !== 'suspended';

    if (!isAuthorizedBackofficeAccount) {
      try {
        await supabase.rpc('revoke_all_devices');
      } catch (revokeError) {
        console.warn('Could not revoke trusted devices for unauthorized account:', revokeError);
      }
      await supabase.auth.signOut({ scope: 'local' });
      localStorage.removeItem('user');
      setCurrentUser(null);
      setPendingRole('');
      throw new Error('Access denied. This account is not authorized to access this portal.');
    }

    setPendingRole(authenticatedRole);
    void preloadPortalWorkspace(authenticatedRole);

    // Password is correct. A stable device ID + secret checks whether this
    // browser previously completed OTP and is still inside its trust window.
    const { deviceId, deviceSecret } = getOrCreateDeviceCredentials();
    const { data: isTrusted, error: trustCheckError } = await supabase.rpc(
      'check_trusted_device',
      { p_device_id: deviceId, p_device_secret: deviceSecret }
    );

    if (trustCheckError) {
      console.warn('Trusted device check failed; OTP will be required:', trustCheckError);
    }

    if (!trustCheckError && isTrusted === true) {
      const refreshedUser = await refreshCurrentUser(authData.user, loginProfile);
      setAuthFlowGated(false);

      if (!refreshedUser) {
        throw new Error('Failed to load user profile.');
      }

      logLoginIfPersonnel(refreshedUser);
      setAuthStep('authenticated');
      return;
    }

    // An untrusted/expired browser must not keep the temporary password-only
    // session. End only this session, then send the application email OTP.
    const { error: localSignOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (localSignOutError) throw localSignOutError;
    localStorage.removeItem('user');
    setCurrentUser(null);

    const { error: otpError } = await sendLoginOtp(normalizedEmail);
    if (otpError) {
      throw new Error('Could not send the login OTP. Please try again.');
    }

    setResetEmail(normalizedEmail);
    setResetCode('');
    setAuthStep('otp');
  } catch (loginError) {
    setAuthFlowGated(false);
    setError(loginError?.message || 'Login failed. Please try again.');
  } finally {
    setLoading(false);
  }
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
        setAuthFlowGated(false);
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
    setAuthFlowGated(false);
    await signOut();
    setCurrentUser(null);
     setAuthStep("login"); 
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

  if (resetCode.trim().length !== OTP_LENGTH) {
    setError(`Enter the ${OTP_LENGTH}-digit OTP sent to your email.`);
    return;
  }

  setLoading(true);
  setError('');
  setAuthFlowGated(true);

  try {
    const { data, error } = await verifyLoginOtp(
      resetEmail.trim(),
      resetCode.trim()
    );

    if (error) {
      setError(error.message);
      return;
    }

    // Defense in depth: re-confirm the role/status is still authorized right
    // after OTP verification, independent of the pre-OTP check in
    // handleLogin, in case the account was deactivated in between.
    const verifiedUserId = data?.user?.id || data?.session?.user?.id;
    const { data: verifiedProfile, error: verifiedProfileError } = await supabase
      .from('admin')
      .select('*')
      .eq('admin_id', verifiedUserId)
      .maybeSingle();

    const verifiedRole = normalizeRole(verifiedProfile?.role);
    const verifiedStatus = String(verifiedProfile?.status || '').trim().toLowerCase();
    const isStillAuthorized = !verifiedProfileError
      && Boolean(verifiedProfile)
      && (
        (verifiedRole === 'admin' && verifiedStatus === 'active')
        || (verifiedRole === 'personnel' && verifiedStatus !== 'inactive' && verifiedStatus !== 'suspended')
      )
      && verifiedStatus !== 'inactive'
      && verifiedStatus !== 'suspended';

    if (!isStillAuthorized) {
      try {
        await supabase.rpc('revoke_all_devices');
      } catch (revokeError) {
        console.warn('Could not revoke trusted devices for unauthorized account:', revokeError);
      }
      await supabase.auth.signOut({ scope: 'local' });
      localStorage.removeItem('user');
      setPendingRole('');
      setError('Access denied. This account is not authorized to access this portal.');
      return;
    }

    // verifyOtp already installs the returned Supabase session. If Remember
    // me was selected on the login form, persist and validate browser trust.
    if (rememberMe) {
      try {
        const { deviceId, deviceSecret } = getOrCreateDeviceCredentials();
        const { data: trustRecord, error: trustError } = await supabase.rpc('trust_device', {
          p_device_id: deviceId,
          p_device_secret: deviceSecret,
          p_user_agent: navigator.userAgent,
        });

        if (trustError) throw trustError;

        const authenticatedUserId = data?.user?.id || data?.session?.user?.id;
        if (!validateTrustedDeviceRecord(trustRecord, {
          deviceId,
          userId: authenticatedUserId
        })) {
          throw new Error('The trusted-device record did not pass verification.');
        }
      } catch (trustError) {
        console.error('Could not save Remember me:', trustError);
        // The submitted OTP already authenticated this session. Do not send a
        // second code or force another verification attempt if browser trust
        // could not be stored; this login can still continue safely.
      }
    }

    // Load the full admin/personnel profile (name, rank, contact number,
    // avatar, permissions) instead of a bare {authUser, role} object, so
    // the profile card/header have real data immediately after login.
    void preloadPortalWorkspace(verifiedRole);
    const verifiedAuthUser = data?.user || data?.session?.user || null;
    const refreshedUser = await refreshCurrentUser(verifiedAuthUser, verifiedProfile);

    if (!refreshedUser) {
      setError("Failed to load user profile.");
      return;
    }

    logLoginIfPersonnel(refreshedUser);

    setAuthStep("authenticated");
  } catch (verifyError) {
    setError(verifyError?.message || 'Could not verify the OTP. Please try again.');
  } finally {
    setAuthFlowGated(false);
    setLoading(false);
  }
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

  const displayPortal = pendingRole || 'admin';

  return (
    <div className={`login-page login-page--${displayPortal}`}>
      <button type="button" className="login-landing-back" onClick={() => navigate('/')}>
        <FaArrowLeft aria-hidden="true" />
        <span>Back to landing page</span>
      </button>
      {authStep === "otp"? (
  <>
    <LoginBrandPanel portal={displayPortal} />

    <div className="login-right">
      <div className="login-form-container-verify">
        <div className="verify-security-icon" aria-hidden="true">&#10003;</div>
        <p className="verify-kicker">Secure sign in</p>
        <h1>Verify Login</h1>
        <p className="login-description-verify">
          Enter the 6-digit code sent to <strong>{resetEmail}</strong>.
        </p>

        <form className="verify-login-form" onSubmit={handleVerify}>
          <label className="verify-input-label" htmlFor="login-otp">One-time password</label>
          <input
            id="login-otp"
            type="text"
            className="verify-input"
            placeholder="000000"
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            aria-describedby="remember-me-summary"
            autoFocus
            required
          />

          <div
            id="remember-me-summary"
            className={`verify-remember-summary ${rememberMe ? 'is-enabled' : ''}`}
          >
            <span className="verify-remember-dot" aria-hidden="true" />
            <div>
              <strong>Remember me {rememberMe ? 'is enabled' : 'is off'}</strong>
              <p>
                {rememberMe
                  ? `After verification, this browser stays trusted for ${pendingRole === 'personnel' ? '14 days' : '12 hours'}.`
                  : 'This browser will require OTP again after you log out.'}
              </p>
            </div>
          </div>

          {error && <p className="error-message verify-message" role="alert">{error}</p>}

          <button
            type="submit"
            className="login-button-verify"
            disabled={loading || resetCode.length !== OTP_LENGTH}
          >
            {loading ? 'Verifying...' : 'Verify & Login'}
          </button>

          <button type="button" onClick={handleBackToLogin} className="back-button-verify" disabled={loading}>
            Back to Login
          </button>
        </form>
      </div>
    </div>
  </>
) : 
      forgotPasswordStep === 'request' ? (
        <>
    <LoginBrandPanel portal={displayPortal} />
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
    <LoginBrandPanel portal={displayPortal} />
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
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                    aria-pressed={showNewPassword}
                    title={showNewPassword ? 'Hide new password' : 'Show new password'}
                  >
                    {showNewPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
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
                    aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                    aria-pressed={showConfirmPassword}
                    title={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  >
                    {showConfirmPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
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
    <LoginBrandPanel portal={displayPortal} />
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
                <button type="submit" className="verify-button" disabled={loading}>
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button type="button" onClick={handleBackToLogin} className="back-button">Back to Login</button>
              </form>
            </div>
          </div>
        </>
      ) : forgotPasswordStep === 'emailSent' ? (
        <>
    <LoginBrandPanel portal={displayPortal} />
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
    <LoginBrandPanel portal={displayPortal} />
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
    <LoginBrandPanel portal={displayPortal} />
          <div className="login-right">
            <div className="login-form-container">
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
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      disabled={loading}
                    >
                      {showPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
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
              <p className="login-footer">
                {displayPortal === 'personnel' ? 'Authorized personnel only' : 'Authorized administrators only'}
              </p>
            </div>
           
          </div>
        </>
      )}
    </div>
  );
}
