import { supabase } from './supabaseClient';
import { clearDeviceSecret, getStoredDeviceId, getStoredDeviceSecret } from './deviceTrust';

const ADMIN_API_URL = String(import.meta.env.VITE_ANALYTICS_API_URL || '').replace(/\/+$/, '');

const callAdminApi = async (endpoint, payload = null) => {
  if (!ADMIN_API_URL) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Please sign in as an administrator to continue.');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const response = await fetch(`${ADMIN_API_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = responseBody?.detail || responseBody?.error || `Request failed (${response.status})`;
    throw new Error(detail);
  }

  return responseBody;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const splitFullName = (fullName = '') => {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) {
    return { first_name: '', last_name: '' };
  }

  const [first_name, ...rest] = trimmed.split(/\s+/);
  return {
    first_name: first_name || '',
    last_name: rest.join(' ') || ''
  };
};

const resolveNameFields = (source = {}) => {
  const first = String(source.first_name || '').trim();
  const last = String(source.last_name || '').trim();

  if (first || last) {
    return {
      first_name: first,
      last_name: last
    };
  }

  return splitFullName(source.name || '');
};

const withDisplayName = (adminData) => {
  if (!adminData) return adminData;

  const fullName = `${adminData.first_name || ''} ${adminData.last_name || ''}`.trim();
  return {
    ...adminData,
    name: fullName || adminData.email || 'Admin User'
  };
};

const syncAdminStatusIfVerified = async (authUser, adminData) => {
  if (!authUser || !adminData) return adminData;

  const emailVerified = !!authUser.email_confirmed_at || !!authUser.confirmed_at;
  const isPending = adminData.status === 'Pending Activation' || adminData.status === 'Pending Verification';
  const activationFlag = authUser.user_metadata?.activation_required;
  const requiresInviteActivation = activationFlag === true
    || (activationFlag !== false && Boolean(authUser.invited_at));

  if (!emailVerified || !isPending || requiresInviteActivation) return adminData;

  const { data: updatedAdmin, error: updateError } = await supabase
    .rpc('activate_own_backoffice_account');

  if (updateError) {
    console.warn('Could not update admin status after verification:', updateError);
    return adminData;
  }

  return updatedAdmin || adminData;
};

export const invitePersonnel = async (email, userData = {}) => {
  try {
    if (!ADMIN_API_URL) {
      throw new Error('Personnel invitations require the configured analytics API.');
    }

    const { first_name, last_name } = resolveNameFields(userData);
    const response = await callAdminApi('/api/admin/users/create', {
      email: normalizeEmail(email),
      first_name,
      last_name,
      role: userData.role || 'personnel',
      rank: userData.rank || '',
      contact_number: userData.contact_number || null,
      permissions: userData.permissions || []
    });

    return { data: response?.data || null, error: null };
  } catch (error) {
    console.error('Error inviting personnel:', error);
    return { data: null, error: error.message };
  }
};

// Sign up new admin
export const signUp = async (email, password, userData = {}) => {
  try {
    const { first_name, last_name } = resolveNameFields(userData);

    if (ADMIN_API_URL) {
      const response = await callAdminApi('/api/admin/users/create', {
        email,
        password,
        first_name,
        last_name,
        role: userData.role || 'personnel',
        rank: userData.rank || '',
        contact_number: userData.contact_number || null,
        permissions: userData.permissions || []
      });

      return {
        data: response?.data || null,
        error: null
      };
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...userData,
          first_name,
          last_name
        }
      }
    });

    if (authError) throw authError;

    // Insert additional admin data into admin table
    if (authData.user) {
      const { data: adminData, error: adminError } = await supabase
        .from('admin')
        .insert([{
          admin_id: authData.user.id,
          email: email,
          first_name,
          last_name,
          role: userData.role || 'personnel',
          rank: userData.rank || '',
          contact_number: userData.contact_number || null,
          status: 'Pending Activation', // Will become Active after email verification
          permissions: userData.permissions || []
        }])
        .select()
        .single();

      if (adminError) throw adminError;
      
      return { data: { auth: authData, user: withDisplayName(adminData) }, error: null };
    }

    return { data: authData, error: null };
  } catch (error) {
    console.error('Error signing up:', error);
    return { data: null, error: error.message };
  }
};




// Sign in user
export const signIn = async (email, password) => {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) throw authError;

    // Get admin details from admin table
    if (authData.user) {
      let adminData = null;
      
      // Try to fetch admin record
      try {
        const { data, error } = await supabase
          .from('admin')
          .select('*')
          .eq('admin_id', authData.user.id)
          .single();
        
        if (!error && data) {
          adminData = data;
        }
      } catch (e) {
        console.warn('Could not fetch admin record:', e);
      }

      // If admin record exists, use it
      if (adminData) {
        adminData = await syncAdminStatusIfVerified(authData.user, adminData);
        // Update last login in background (fire and forget)
        supabase
          .rpc('touch_backoffice_activity')
          .then(() => {})
          .catch(() => {});

        return { 
          data: { 
            auth: authData, 
            user: withDisplayName(adminData)
          }, 
          error: null 
        };
      }

      await supabase.auth.signOut({ scope: 'local' });
      throw new Error('This login is not connected to an authorized admin or personnel account.');
    }

    return { data: authData, error: null };
  } catch (error) {
    console.error('Error signing in:', error);
    return { data: null, error: error.message };
  }
};

export const sendLoginOtp = async (email) => {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false
    }
  });

  return { data, error };
};


// Verify OTP (Supabase handles session automatically)

export const verifyLoginOtp = async (email, token) => {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  return {
    data,
    error
  };
};

// Sign out user
export const signOut = async () => {
  try {
    // Normal logout ends only this browser's current Supabase session. The
    // stable local device marker and its server-side trust record remain in
    // place until expiry or an explicit revoke/forget action.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error signing out:', error);
    return { error: error.message };
  }
};

export const ALREADY_FORGOTTEN_DEVICE_MESSAGE =
  'This device is already forgotten. Email OTP will be required on your next login.';

export const checkCurrentDeviceTrust = async () => {
  try {
    const deviceId = getStoredDeviceId();
    const deviceSecret = getStoredDeviceSecret();
    if (!deviceId) {
      return { trusted: false, error: null };
    }

    const { data, error } = await supabase
      .from('trusted_devices')
      .select('device_id, trusted, expires_at, revoked_at')
      .eq('device_id', deviceId)
      .eq('trusted', true)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) throw error;

    if (!data || !deviceSecret) {
      return { trusted: false, error: null };
    }

    const { data: isTrusted, error: validationError } = await supabase.rpc(
      'check_trusted_device',
      { p_device_id: deviceId, p_device_secret: deviceSecret }
    );

    if (validationError) throw validationError;

    return { trusted: isTrusted === true, error: null };
  } catch (error) {
    console.error('Error checking trusted device:', error);
    return { trusted: false, error: error?.message || 'Could not check this device.' };
  }
};

// Explicitly forget the current browser. The current Supabase session remains
// active, but the next login on this browser must complete email OTP again.
export const forgetCurrentDevice = async () => {
  try {
    const deviceId = getStoredDeviceId();
    const trustStatus = await checkCurrentDeviceTrust();
    if (trustStatus.error) {
      throw new Error(trustStatus.error);
    }

    if (!trustStatus.trusted) {
      clearDeviceSecret();
      return { error: null, alreadyForgotten: true };
    }

    const { error } = await supabase.rpc('revoke_device', {
      p_device_id: deviceId
    });

    if (error) throw error;
    clearDeviceSecret();
    return { error: null };
  } catch (error) {
    console.error('Error forgetting trusted device:', error);
    return { error: error?.message || 'Could not forget this device.' };
  }
};

export const revokeTrustedDevicesForUser = async (userId) => {
  try {
    const { error } = await supabase.rpc('admin_revoke_trusted_devices', {
      p_user_id: userId
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error revoking trusted devices:', error);
    return { error: error?.message || 'Could not revoke trusted devices.' };
  }
};

// Get current session
export const getSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { data: session, error: null };
  } catch (error) {
    console.error('Error getting session:', error);
    return { data: null, error: error.message };
  }
};

export const touchBackofficeActivity = async () => {
  try {
    const { data, error } = await supabase.rpc('touch_backoffice_activity');
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.warn('Could not update account activity:', error);
    return { data: null, error: error.message };
  }
};

// Get current user
export const getCurrentUser = async (knownAuthUser = null, prefetchedProfile = null) => {
  try {
    let user = knownAuthUser;

    if (!user) {
      const { data: { user: fetchedUser }, error: authError } = await supabase.auth.getUser();

      if (authError) {

        if (authError.message === "Auth session missing!") {
          return {
            data:null,
            error:null
          };
        }

        throw authError;
      }

      user = fetchedUser;

    }

    if (user) {
      let adminData = prefetchedProfile;

      // Try to fetch admin record
      if (!adminData) {
        try {
          const { data, error } = await supabase
            .from('admin')
            .select('*')
            .eq('admin_id', user.id)
            .single();

          if (!error && data) {
            adminData = data;
          }
        } catch (e) {
          console.warn('Could not fetch admin record:', e);
        }
      }

      // If admin record exists, return it
      if (adminData) {
        adminData = await syncAdminStatusIfVerified(user, adminData);
        return { data: withDisplayName(adminData), error: null };
      }

      return {
        data: null,
        error: 'This login is not connected to an authorized admin or personnel account.'
      };
    }

    return { data: null, error: 'No user found' };
  } catch (error) {
    console.error('Error getting current user:', error);
    return { data: null, error: error.message };
  }
};

// Reset password - Step 1: Send reset email
export const sendPasswordResetEmail = async (email) => {
  try {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return { data: null, error: 'Please enter your email address.' };
    }

    const { data: response, error: invokeError } = await supabase.functions.invoke(
      'request-backoffice-password-reset',
      {
        body: {
          email: normalizedEmail,
          redirectTo: `${window.location.origin}/login`
        }
      }
    );

    if (invokeError) {
      console.error('Password reset function failed:', invokeError);
      return {
        data: null,
        error: 'Password recovery is temporarily unavailable. Please try again later.'
      };
    }

    if (response?.error) {
      return {
        data: null,
        error: response.error.message || 'Password reset failed.',
        code: response.error.code || 'PASSWORD_RESET_FAILED'
      };
    }

    return { data: response?.data || null, error: null };
  } catch (error) {
    console.error('Error sending reset email:', error);
    return {
      data: null,
      error: 'Password recovery is temporarily unavailable. Please try again later.'
    };
  }
};

const RECOVERABLE_WEBSITE_ROLES = new Set(['admin', 'personnel']);
const RECOVERABLE_WEBSITE_STATUSES = new Set(['active', 'inactive', 'on leave']);

// Recovery sessions must still belong to an eligible website account. This
// prevents mobile-only Auth users from reaching the website password form by
// supplying their own recovery code or recovery link.
export const verifyBackofficeRecoveryAccount = async (authUser = null) => {
  try {
    let user = authUser;

    if (!user?.id) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      user = userData?.user || null;
    }

    if (!user?.id) {
      return {
        authorized: false,
        data: null,
        error: 'This recovery link or code is invalid or has expired.'
      };
    }

    const { data: account, error: accountError } = await supabase
      .from('admin')
      .select('admin_id, email, role, status')
      .eq('admin_id', user.id)
      .maybeSingle();

    const normalizedRole = String(account?.role || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ');
    const normalizedStatus = String(account?.status || '').trim().toLowerCase();
    const emailsMatch = normalizeEmail(account?.email) === normalizeEmail(user.email);
    const authorized =
      !accountError &&
      Boolean(account?.admin_id) &&
      RECOVERABLE_WEBSITE_ROLES.has(normalizedRole) &&
      RECOVERABLE_WEBSITE_STATUSES.has(normalizedStatus) &&
      emailsMatch;

    if (!authorized) {
      if (accountError) {
        console.error('Could not validate recovery account:', accountError);
      }
      await supabase.auth.signOut({ scope: 'local' });
      return {
        authorized: false,
        data: null,
        error: 'This account is not authorized for Admin or Personnel website access.'
      };
    }

    return { authorized: true, data: account, error: null };
  } catch (error) {
    console.error('Error validating recovery account:', error);
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return {
      authorized: false,
      data: null,
      error: 'We could not verify this website account. Please request a new reset code.'
    };
  }
};

// Reset password - Optional OTP step for code-based recovery emails
export const verifyRecoveryCode = async (email, token) => {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: String(token || '').trim(),
      type: 'recovery'
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error verifying recovery code:', error);
    return { data: null, error: error.message };
  }
};

// Signup confirmation - verify OTP code from email
export const verifySignupCode = async (email, token) => {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup'
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error verifying signup code:', error);
    return { data: null, error: error.message };
  }
};

// Signup confirmation - resend OTP code
export const resendSignupCode = async (email) => {
  try {
    console.log('Resending OTP for:', email);

    const response = await supabase.auth.resend({
      type: 'signup',
      email
    });

    console.log('Supabase resend response:', response);

    if (response.error) throw response.error;

    return { data: response.data, error: null };

  } catch (error) {
    console.error('Resend failed:', error);
    return { data: null, error: error.message };
  }
};

// Reset password - Step 2: Update password
export const updatePassword = async (newPassword) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    // Password changed/reset: revoke every trusted device for this user so
    // OTP is required again everywhere, not just on this device.
    const { error: revokeError } = await supabase.rpc('revoke_all_devices');
    if (revokeError) {
      console.warn('Could not revoke trusted devices after password update:', revokeError);
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating password:', error);
    return { data: null, error: error.message };
  }
};

export const activateInvitedAccount = async (newPassword) => {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const invitedUser = sessionData?.session?.user;
    if (!invitedUser?.id) {
      throw new Error('This activation link is invalid or has expired. Ask an administrator to send a new invitation.');
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
      data: {
        ...(invitedUser.user_metadata || {}),
        activation_required: false
      }
    });
    if (error) throw error;

    const { error: statusError } = await supabase
      .rpc('activate_own_backoffice_account');

    if (statusError) {
      console.warn('Could not activate admin profile after password setup:', statusError);
    }

    await supabase.auth.signOut();
    return { data, error: null };
  } catch (error) {
    console.error('Error activating invited account:', error);
    return { data: null, error: error.message };
  }
};

export const getInviteActivationContext = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const invitedUser = data?.session?.user;
    if (!invitedUser) {
      return { data: null, error: null };
    }

    return {
      data: {
        email: invitedUser.email || '',
        role: String(invitedUser.user_metadata?.role || '').trim().toLowerCase()
      },
      error: null
    };
  } catch (error) {
    console.error('Error loading invitation context:', error);
    return { data: null, error: error.message };
  }
};

export const verifyCurrentPassword = async (currentPassword) => {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) throw userError;

    const email = userData?.user?.email;
    if (!email) {
      return { valid: false, error: 'No authenticated user found.' };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword
    });

    if (signInError) {
      return { valid: false, error: null };
    }

    return { valid: true, error: null };
  } catch (error) {
    console.error('Error verifying current password:', error);
    return { valid: false, error: error.message };
  }
};

// Listen to auth state changes
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};
