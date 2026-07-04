import { supabase } from './supabaseClient';

const ADMIN_API_URL = String(import.meta.env.VITE_ANALYTICS_API_URL || '').replace(/\/+$/, '');
const ADMIN_API_KEY = String(import.meta.env.VITE_ANALYTICS_API_KEY || '');

const callAdminApi = async (endpoint, payload = null) => {
  if (!ADMIN_API_URL) return null;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (ADMIN_API_KEY) {
    headers['x-analytics-api-key'] = ADMIN_API_KEY;
  }

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

const adminExistsForEmail = async (email) => {
  const { data, error } = await supabase
    .from('admin')
    .select('admin_id')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !!data;
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

  if (!emailVerified || !isPending) return adminData;

  const { data: updatedAdmin, error: updateError } = await supabase
    .from('admin')
    .update({ status: 'Active' })
    .eq('admin_id', adminData.admin_id)
    .select()
    .single();

  if (updateError) {
    console.warn('Could not update admin status after verification:', updateError);
    return adminData;
  }

  return updatedAdmin || adminData;
};
export const preAuth = async (email, password) => {
  try {

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });


    if (error) {
      throw error;
    }


    // immediately remove session
   


    return {
      data,
      error: null
    };


  } catch(error){

    return {
      data:null,
      error:error.message
    };

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
          .from('admin')
          .update({ last_login: new Date().toISOString() })
          .eq('admin_id', authData.user.id)
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

      // If admin record doesn't exist, create a fallback user object and try to insert record
      console.warn('Admin record not found for user:', authData.user.id, ' - Creating fallback...');
      const metadataName = resolveNameFields(authData.user.user_metadata || {});
      
      const fallbackUser = {
        admin_id: authData.user.id,
        email: authData.user.email,
        first_name: metadataName.first_name,
        last_name: metadataName.last_name,
        role: 'admin',
        rank: authData.user.user_metadata?.rank || 'ADMIN',
        status: 'Active',
        permissions: ['view_dashboard', 'view_charts', 'view_attendance', 'view_accounts', 'manage_users', 'view_analytics', 'view_progress', 'view_audit_logs', 'view_reports', 'manage_reports'],
        last_login: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      // Try to insert the admin record to restore it
      try {
        const { data: insertedData, error: insertError } = await supabase
          .from('admin')
          .insert([fallbackUser])
          .select()
          .single();

        if (insertedData && !insertError) {
          return { 
            data: { 
              auth: authData, 
              user: withDisplayName(insertedData)
            }, 
            error: null 
          };
        }
      } catch (insertError) {
        console.error('Could not insert admin record:', insertError);
      }

      // Return fallback user if insertion failed
      return { 
        data: { 
          auth: authData, 
          user: withDisplayName(fallbackUser)
        }, 
        error: null 
      };
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error signing out:', error);
    return { error: error.message };
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

// Get current user
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

if (authError) {

  if (authError.message === "Auth session missing!") {
    return {
      data:null,
      error:null
    };
  }

  throw authError;

}

    if (user) {
      let adminData = null;

      // Try to fetch admin record
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

      // If admin record exists, return it
      if (adminData) {
        adminData = await syncAdminStatusIfVerified(user, adminData);
        return { data: withDisplayName(adminData), error: null };
      }

      // If admin record doesn't exist, create a fallback user object
      console.warn('Admin record not found for user:', user.id, ' - Creating fallback...');
      const metadataName = resolveNameFields(user.user_metadata || {});
      
      const fallbackUser = {
        admin_id: user.id,
        email: user.email,
        first_name: metadataName.first_name,
        last_name: metadataName.last_name,
        role: 'admin',
        rank: user.user_metadata?.rank || 'ADMIN',
        status: 'Active',
        permissions: ['view_dashboard', 'view_charts', 'view_attendance', 'view_accounts', 'manage_users', 'view_analytics', 'view_progress', 'view_audit_logs', 'view_reports', 'manage_reports'],
        last_login: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      // Try to insert the admin record to restore it
      try {
        const { data: insertedData, error: insertError } = await supabase
          .from('admin')
          .insert([fallbackUser])
          .select()
          .single();

        if (!insertError && insertedData) {
          return { data: withDisplayName(insertedData), error: null };
        }
      } catch (insertError) {
        console.error('Could not insert admin record:', insertError);
      }

      // Return fallback user if insertion failed
      return { data: withDisplayName(fallbackUser), error: null };
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

    const exists = await adminExistsForEmail(normalizedEmail);
    if (!exists) {
      return { data: null, error: 'No account found for that email address.' };
    }

    const { data, error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/login`
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error sending reset email:', error);
    return { data: null, error: error?.message || 'Password reset failed.' };
  }
};

// Reset password - Optional OTP step for code-based recovery emails
export const verifyRecoveryCode = async (email, token) => {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
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
    return { data, error: null };
  } catch (error) {
    console.error('Error updating password:', error);
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
