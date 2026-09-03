import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaCheck,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaKey,
  FaLock,
  FaShieldAlt
} from 'react-icons/fa';
import { supabase } from '../utils/supabaseClient';
import {
sendPasswordResetEmail,
verifyRecoveryCode,
verifyBackofficeRecoveryAccount,
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
import bfpDasmaLogo from '../assets/bfp_dasma.png';

const LoginBrandPanel = ({ portal }) => {
  const isPersonnel = portal === 'personnel';

  return (
  <aside className="login-left" aria-label={`IGNIS SAFE ${isPersonnel ? 'personnel' : 'admin'} welcome`}>
    <div className="login-bfp-group">
      <span className="login-bfp-logo-frame">
        <img
          src={bfpDasmaLogo}
          alt="Bureau of Fire Protection Dasmariñas City Fire Station logo"
          className="login-bfp-logo"
        />
      </span>

      <div className="login-brand-rule" aria-hidden="true" />
    </div>

    <div className="login-brand-content">
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

const RecoveryHeader = ({ icon, kicker, title, description, tone = 'default' }) => (
  <header className="recovery-header">
    <span className={`recovery-header-icon recovery-header-icon--${tone}`} aria-hidden="true">
      {React.createElement(icon)}
    </span>
    <div className="recovery-header-copy">
      <p className="recovery-kicker">{kicker}</p>
      <h1>{title}</h1>
    </div>
    {description && <p className="recovery-description">{description}</p>}
  </header>
);

const REMEMBER_ME_KEY = 'remember_me';
const REMEMBERED_EMAIL_KEY = 'remembered_email';
const OTP_LENGTH = 6;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

// Supabase throttles auth emails per address (default ~60s). A throttled
// *resend* is not a real failure: a valid code was just delivered and stays
// usable for the full OTP lifetime, so the login must still advance to the
// verification screen instead of dead-ending on the password form.
const OTP_RATE_LIMIT_CODES = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit'
]);

const isOtpRateLimitError = (error) =>
  Boolean(error) && (error.status === 429 || OTP_RATE_LIMIT_CODES.has(error.code));

// Supabase puts the wait time in the message: "... after 42 seconds."
const parseRetryAfterSeconds = (error) => {
  const match = /after (\d+) seconds/i.exec(error?.message || '');
  const seconds = match ? Number(match[1]) : OTP_RESEND_COOLDOWN_SECONDS;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : OTP_RESEND_COOLDOWN_SECONDS;
};

const describeOtpSendError = (error) => {
  if (!error) return 'Could not send the login OTP. Please try again.';
  if (isOtpRateLimitError(error)) {
    return `Too many code requests. Please wait ${parseRetryAfterSeconds(error)} seconds and try again.`;
  }
  return error.message || 'Could not send the login OTP. Please try again.';
};

// Only ever follow a post-login redirect back into the Attendance QR flow -
// never an arbitrary/external URL - to keep this an internal return path
// rather than an open redirect.
const POST_LOGIN_REDIRECT_ALLOWLIST = ['/attendance-login', '/attendance-confirm'];

const getSafeAttendanceRedirect = (rawRedirect) => {
  if (!rawRedirect || !rawRedirect.startsWith('/') || rawRedirect.startsWith('//')) {
    return null;
  }

  const isAllowed = POST_LOGIN_REDIRECT_ALLOWLIST.some(
    (path) => rawRedirect === path || rawRedirect.startsWith(`${path}?`)
  );

  return isAllowed ? rawRedirect : null;
};
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
  const [searchParams] = useSearchParams();
  const attendanceRedirect = getSafeAttendanceRedirect(searchParams.get('redirect'));
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
  const [forgotPasswordStep, setForgotPasswordStep] = useState(null); // null, 'request', 'validatingRecovery', 'emailSent', 'verifyCode', 'setPassword', 'resetDone'
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isResetFlowActiveRef = useRef(false);
  const [authStep, setAuthStep] = useState("login");
  const [otpNotice, setOtpNotice] = useState("");
  const [otpResendIn, setOtpResendIn] = useState(0);
  const [otpResending, setOtpResending] = useState(false);
  

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

    if (!recoveryInHash && !recoveryInQuery) return undefined;

    let active = true;
    let validationStarted = false;
    let authSubscription = null;
    setAuthFlowGated(true);
    setForgotPasswordStep('validatingRecovery');
    setError('');

    const stopRecoveryListener = () => {
      authSubscription?.unsubscribe();
      authSubscription = null;
    };

    const validateRecoveryUser = async (user) => {
      if (!active || validationStarted || !user?.id) return;
      validationStarted = true;

      const authorization = await verifyBackofficeRecoveryAccount(user);
      if (!active) return;

      stopRecoveryListener();
      window.history.replaceState({}, document.title, '/login');

      if (!authorization.authorized) {
        setAuthFlowGated(false);
        setForgotPasswordStep('request');
        setError(authorization.error);
        return;
      }

      setResetEmail(user.email || '');
      setForgotPasswordStep('setPassword');
      setError('');
    };

    const findRecoverySession = async () => {
      const retryDelays = [0, 200, 600, 1200];

      for (const delay of retryDelays) {
        if (delay) {
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
        if (!active || validationStarted) return;

        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          await validateRecoveryUser(userData.user);
          return;
        }
      }

      if (active && !validationStarted) {
        stopRecoveryListener();
        setAuthFlowGated(false);
        window.history.replaceState({}, document.title, '/login');
        setForgotPasswordStep('request');
        setError('This recovery link is invalid or has expired. Request a new reset code.');
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session?.user) {
        window.setTimeout(() => {
          void validateRecoveryUser(session?.user);
        }, 0);
      }
    });
    authSubscription = authListener?.subscription || null;

    void findRecoverySession();

    return () => {
      active = false;
      stopRecoveryListener();
    };
  }, []);

  useEffect(() => {
    isResetFlowActiveRef.current = Boolean(forgotPasswordStep);
  }, [forgotPasswordStep]);

  useEffect(() => {
    if (otpResendIn <= 0) return undefined;
    const timer = window.setInterval(() => {
      setOtpResendIn((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpResendIn]);

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
    setCurrentUser(null);

    const { error: otpError } = await sendLoginOtp(normalizedEmail);

    // A hard send failure keeps the user on the password form with the real
    // reason. A rate-limited *resend* still means a usable code was just
    // emailed, so continue to the verification screen (never bypass it) and
    // let the user verify that code or resend once the cooldown clears.
    if (otpError && !isOtpRateLimitError(otpError)) {
      throw new Error(describeOtpSendError(otpError));
    }

    setResetEmail(normalizedEmail);
    setResetCode('');
    setOtpNotice(
      otpError
        ? 'A login code was emailed to you moments ago. Enter it below, or request a new one once the timer ends.'
        : `We emailed a ${OTP_LENGTH}-digit login code to ${normalizedEmail}. It can take a minute to arrive - check spam too.`
    );
    setOtpResendIn(otpError ? parseRetryAfterSeconds(otpError) : OTP_RESEND_COOLDOWN_SECONDS);
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
    setAuthFlowGated(true);
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
      const authorization = await verifyBackofficeRecoveryAccount();
      if (!authorization.authorized) {
        setForgotPasswordStep('request');
        setError(authorization.error);
        return;
      }

      const { error: passwordError } = await updatePassword(newPassword);

      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }

      await signOut();
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
      const { data: recoveryData, error: verifyError } = await verifyRecoveryCode(
        resetEmail.trim(),
        resetCode.trim()
      );
      if (verifyError) {
        setError(`Invalid or expired reset code. ${verifyError}`);
        return;
      }

      const recoveryUser = recoveryData?.user || recoveryData?.session?.user || null;
      const authorization = await verifyBackofficeRecoveryAccount(recoveryUser);
      if (!authorization.authorized) {
        setError(authorization.error);
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
    setOtpNotice("");
    setOtpResendIn(0);
    setOtpResending(false);
    window.history.replaceState({}, document.title, '/login');
  };

const handleResendOtp = async () => {
  if (otpResendIn > 0 || otpResending) return;

  setOtpResending(true);
  setError('');
  setOtpNotice('');

  try {
    const { error: resendError } = await sendLoginOtp(resetEmail.trim());

    if (resendError && !isOtpRateLimitError(resendError)) {
      setError(describeOtpSendError(resendError));
      return;
    }

    setOtpResendIn(resendError ? parseRetryAfterSeconds(resendError) : OTP_RESEND_COOLDOWN_SECONDS);
    setOtpNotice(
      resendError
        ? 'A code was already sent recently. Please use it, or resend once the timer ends.'
        : 'A new login code is on its way to your email.'
    );
  } catch (resendError) {
    setError(resendError?.message || 'Could not resend the login OTP. Please try again.');
  } finally {
    setOtpResending(false);
  }
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
  // Came here from the Attendance QR flow (e.g. an unauthenticated scan) -
  // return the user to it instead of the default portal landing page.
  navigate(attendanceRedirect || routes[role], { replace: true });
} else {
  console.error("Unknown role:", role);
}
}, [currentUser, authStep, navigate, attendanceRedirect]);

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

          {otpNotice && !error && (
            <p className="verify-message" role="status">{otpNotice}</p>
          )}

          {error && <p className="error-message verify-message" role="alert">{error}</p>}

          <button
            type="submit"
            className="login-button-verify"
            disabled={loading || resetCode.length !== OTP_LENGTH}
          >
            {loading ? 'Verifying...' : 'Verify & Login'}
          </button>

          <div className="verify-secondary-actions">
            <button
              type="button"
              onClick={handleBackToLogin}
              className="back-button-verify verify-back-action"
              disabled={loading}
            >
              Back to Login
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              className="back-button-verify verify-resend-action"
              disabled={loading || otpResending || otpResendIn > 0}
            >
              {otpResending
                ? 'Sending new code...'
                : otpResendIn > 0
                  ? `Resend code in ${otpResendIn}s`
                  : 'Resend code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </>
) : forgotPasswordStep === 'validatingRecovery' ? (
        <>
          <LoginBrandPanel portal={displayPortal} />
          <div className="login-right">
            <div className="login-form-container recovery-card recovery-card--status" aria-live="polite">
              <RecoveryHeader
                icon={FaShieldAlt}
                kicker="Secure recovery"
                title="Verifying recovery link"
                description="Confirming that this recovery session belongs to an authorized website account."
                tone="loading"
              />
              <div className="recovery-loading-track" aria-hidden="true">
                <span />
              </div>
            </div>
          </div>
        </>
      ) : forgotPasswordStep === 'request' ? (
        <>
          <LoginBrandPanel portal={displayPortal} />
          <div className="login-right">
            <div className="login-form-container recovery-card">
              <RecoveryHeader
                icon={FaEnvelope}
                kicker="Account recovery"
                title="Forgot your password?"
                description="Enter the email connected to your authorized Admin or Personnel account."
              />
              <form onSubmit={handleRequestReset} className="login-form recovery-form">
                <div className="form-group">
                  <label htmlFor="reset-email">Email address</label>
                  <input
                    type="email"
                    id="reset-email"
                    placeholder="name@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="recovery-security-note">
                  <FaShieldAlt aria-hidden="true" />
                  <span>Only authorized website accounts can receive a reset code here.</span>
                </div>
                {error && <p className="error-message recovery-alert" role="alert">{error}</p>}
                <button type="submit" className="login-button recovery-primary" disabled={loading}>
                  {loading ? 'Checking account...' : 'Send reset code'}
                </button>
                <button type="button" onClick={handleBackToLogin} className="back-button recovery-secondary" disabled={loading}>
                  <FaArrowLeft aria-hidden="true" />
                  Back to login
                </button>
              </form>
            </div>
          </div>
        </>
      ) : forgotPasswordStep === 'setPassword' ? (
        <>
          <LoginBrandPanel portal={displayPortal} />
          <div className="login-right">
            <div className="login-form-container recovery-card">
              <RecoveryHeader
                icon={FaKey}
                kicker="Final step"
                title="Create a new password"
                description="Choose a strong password that you have not used for this account before."
              />
              <form onSubmit={handleSetPassword} className="login-form recovery-form">
              <div className="form-group">
                <label htmlFor="new-password">New password</label>
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
                <label htmlFor="confirm-password">Confirm password</label>
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
              <p className="recovery-password-hint">
                Use 8 or more characters with uppercase, lowercase, a number, and a symbol.
              </p>
              {error && <p className="error-message recovery-alert" role="alert">{error}</p>}
              <button type="submit" className="login-button recovery-primary" disabled={loading}>
                {loading ? 'Updating password...' : 'Update password'}
              </button>
              <button type="button" onClick={handleBackToLogin} className="back-button recovery-secondary" disabled={loading}>
                <FaArrowLeft aria-hidden="true" />
                Back to login
              </button>
            </form>
            </div>
          </div>
        </>
      ) : forgotPasswordStep === 'verifyCode' ? (
        <>
          <LoginBrandPanel portal={displayPortal} />
          <div className="login-right">
            <div className="login-form-container recovery-card">
              <RecoveryHeader
                icon={FaKey}
                kicker="Email verification"
                title="Enter your reset code"
                description="Use the one-time code from the password recovery email."
              />
              <form onSubmit={handleVerifyResetCode} className="login-form recovery-form">
                <div className="form-group">
                  <label htmlFor="reset-email-verify">Email address</label>
                  <input
                    type="email"
                    id="reset-email-verify"
                    value={resetEmail}
                    className="recovery-readonly-input"
                    readOnly
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reset-code-verify">Reset code</label>
                  <input
                    type="text"
                    id="reset-code-verify"
                    placeholder="Enter the code"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    required
                  />
                </div>

                {error && <p className="error-message recovery-alert" role="alert">{error}</p>}
                <button type="submit" className="verify-button recovery-primary" disabled={loading}>
                  {loading ? 'Verifying code...' : 'Verify code'}
                </button>
                <button type="button" onClick={handleBackToLogin} className="back-button recovery-secondary" disabled={loading}>
                  <FaArrowLeft aria-hidden="true" />
                  Back to login
                </button>
              </form>
            </div>
          </div>
        </>
      ) : forgotPasswordStep === 'emailSent' ? (
        <>
          <LoginBrandPanel portal={displayPortal} />
          <div className="login-right">
            <div className="login-form-container recovery-card recovery-card--status" aria-live="polite">
              <RecoveryHeader
                icon={FaCheck}
                kicker="Email sent"
                title="Check your inbox"
                description="Your reset code is ready. It expires after a limited time for your security."
                tone="success"
              />
              <div className="recovery-destination">
                <span>Reset code sent to</span>
                <strong>{resetEmail}</strong>
              </div>
              <div className="recovery-status-actions">
                <button onClick={() => setForgotPasswordStep('verifyCode')} className="login-button recovery-primary">
                  Enter reset code
                </button>
                <button onClick={handleBackToLogin} className="back-button recovery-secondary">
                  Back to login
                </button>
              </div>
            </div>
          </div>
        </>
      ) : forgotPasswordStep === 'resetDone' ? (
        <>
          <LoginBrandPanel portal={displayPortal} />
          <div className="login-right">
            <div className="login-form-container recovery-card recovery-card--status" aria-live="polite">
              <RecoveryHeader
                icon={FaCheck}
                kicker="Recovery complete"
                title="Password updated"
                description="Your new password is active. You can now return to the secure sign-in page."
                tone="success"
              />
              <button onClick={handleBackToLogin} className="login-button recovery-primary">
                Return to login
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
    <LoginBrandPanel portal={displayPortal} />
          <div className="login-right">
            <div className="login-form-container">
              <div className="login-card-intro">
                <span className="login-card-intro-icon" aria-hidden="true">
                  <FaLock />
                </span>
                <div>
                  <p className="login-card-kicker">Secure access</p>
                  <h2>{displayPortal === 'personnel' ? 'Personnel Sign In' : 'Administrator Sign In'}</h2>
                  <p className="login-card-summary">
                    Sign in with your authorized IGNIS SAFE account.
                  </p>
                </div>
              </div>
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
