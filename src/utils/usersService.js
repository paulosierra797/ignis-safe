import { supabase } from './supabaseClient';

const ADMIN_ACTIVITY_TABLE = 'admin_activity_logs';
const SHIFT_SCHEDULE_TABLE = 'shift_schedule';
const PERSONNEL_WORKSPACE_TABLE = 'personnel_workspace_profiles';
const SHIFT_SCHEDULE_KEY = 'main';
const ADMIN_API_URL = String(import.meta.env.VITE_ANALYTICS_API_URL || '').replace(/\/+$/, '');
const ADMIN_API_KEY = String(import.meta.env.VITE_ANALYTICS_API_KEY || '');
const DATA_CHANGED_EVENT = 'ignis-safe:data-changed';

const emitDataChanged = (scope, detail = {}) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, {
    detail: {
      scope,
      ...detail
    }
  }));
};

const toPersonnelWorkspaceUser = (account, profile) => {
  if (!account || !profile) return null;

  const firstName = profile.first_name || '';
  const lastName = profile.last_name || '';
  return {
    ...account,
    ...profile,
    admin_id: account.admin_id,
    role: 'personnel',
    permissions: [],
    name: `${firstName} ${lastName}`.trim() || profile.email || 'Personnel',
    account_role: account.role,
    is_personnel_workspace_profile: true
  };
};

export const getPersonnelWorkspaceProfile = async (account, { createIfMissing = true } = {}) => {
  try {
    if (!account?.admin_id) {
      return { data: null, error: 'Missing account ID.' };
    }

    if (String(account.role || '').toLowerCase() !== 'admin') {
      return { data: { ...account, is_personnel_workspace_profile: false }, error: null };
    }

    const { data: existingProfile, error: selectError } = await supabase
      .from(PERSONNEL_WORKSPACE_TABLE)
      .select('*')
      .eq('admin_id', account.admin_id)
      .maybeSingle();

    if (selectError) throw selectError;
    if (existingProfile) {
      return { data: toPersonnelWorkspaceUser(account, existingProfile), error: null };
    }
    if (!createIfMissing) {
      return { data: null, error: null };
    }

    const { data: createdProfile, error: insertError } = await supabase
      .from(PERSONNEL_WORKSPACE_TABLE)
      .insert({
        admin_id: account.admin_id,
        first_name: account.first_name || '',
        last_name: account.last_name || '',
        email: account.email || '',
        rank: account.rank || '',
        contact_number: account.contact_number || null,
        avatar_url: account.avatar_url || null
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    return { data: toPersonnelWorkspaceUser(account, createdProfile), error: null };
  } catch (error) {
    console.error('Error loading personnel workspace profile:', error);
    return { data: null, error: error.message };
  }
};

export const updatePersonnelWorkspaceProfile = async (adminId, updates) => {
  try {
    const allowedFields = [
      'first_name',
      'last_name',
      'email',
      'rank',
      'contact_number',
      'avatar_url',
      'status',
      'leave_start_date',
      'leave_end_date'
    ];
    const payload = Object.fromEntries(
      Object.entries(updates || {}).filter(([key]) => allowedFields.includes(key))
    );
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from(PERSONNEL_WORKSPACE_TABLE)
      .update(payload)
      .eq('admin_id', adminId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Personnel workspace profile was not found.');

    emitDataChanged('users', { action: 'workspace_profile_update', admin_id: adminId });
    return { data, error: null };
  } catch (error) {
    console.error('Error updating personnel workspace profile:', error);
    return { data: null, error: error.message };
  }
};

const callAdminApi = async (endpoint, payload = null) => {
  if (!ADMIN_API_URL) return null;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (ADMIN_API_KEY) {
    headers['x-analytics-api-key'] = ADMIN_API_KEY;
  }

  const response = await fetch(`${ADMIN_API_URL}${endpoint}`, {
    method: payload ? 'POST' : 'GET',
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

export const getShiftScheduleConfig = async () => {
  try {
    const { data, error } = await supabase
      .from(SHIFT_SCHEDULE_TABLE)
      .select('shift_a_dates, shift_b_dates, updated_at')
      .eq('config_key', SHIFT_SCHEDULE_KEY)
      .maybeSingle();

    if (error) throw error;

    return {
      data: {
        shift_a_dates: Array.isArray(data?.shift_a_dates) ? data.shift_a_dates : [],
        shift_b_dates: Array.isArray(data?.shift_b_dates) ? data.shift_b_dates : []
      },
      updatedAt: data?.updated_at || null,
      error: null
    };
  } catch (error) {
    console.error('Error fetching shift schedule config:', error);
    return { data: null, updatedAt: null, error: error.message };
  }
};

export const saveShiftScheduleConfig = async (
  { shift_a_dates = [], shift_b_dates = [] },
  updatedBy = null
) => {
  try {
    const payload = {
      config_key: SHIFT_SCHEDULE_KEY,
      shift_a_dates,
      shift_b_dates,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(SHIFT_SCHEDULE_TABLE)
      .upsert(payload, { onConflict: 'config_key' })
      .select('shift_a_dates, shift_b_dates, updated_at')
      .single();

    if (error) throw error;

    emitDataChanged('dashboard', { action: 'shift_schedule_update' });

    return {
      data: {
        shift_a_dates: Array.isArray(data?.shift_a_dates) ? data.shift_a_dates : [],
        shift_b_dates: Array.isArray(data?.shift_b_dates) ? data.shift_b_dates : []
      },
      updatedAt: data?.updated_at || null,
      error: null
    };
  } catch (error) {
    console.error('Error saving shift schedule config:', error);
    return { data: null, updatedAt: null, error: error.message };
  }
};

export const getUsersFromProfiles = async () => {
  try {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, username, avatar_url, completed_simulations, last_simulation, updated_at, created_at')
      .order('created_at', { ascending: false });

    if (profileError) throw profileError;

    const profileIds = (profileRows || []).map((row) => row.id).filter(Boolean);
    let adminMap = new Map();

    if (profileIds.length > 0) {
      const { data: adminRows, error: adminError } = await supabase
        .from('admin')
        .select('admin_id, status, last_login, role, rank')
        .in('admin_id', profileIds);

      if (adminError) {
        console.warn('Could not fetch admin metadata while loading profiles:', adminError);
      } else {
        adminMap = new Map((adminRows || []).map((row) => [row.admin_id, row]));
      }
    }

    const merged = (profileRows || []).map((profile) => {
      const adminMeta = adminMap.get(profile.id) || {};
      return {
        id: profile.id,
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.username || profile.email || 'User',
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
        username: profile.username || '',
        avatar_url: profile.avatar_url || null,
        completed_simulations: profile.completed_simulations || 0,
        last_simulation: profile.last_simulation || '-',
        status: adminMeta.status || 'Active',
        role: adminMeta.role || 'mobile-user',
        rank: adminMeta.rank || '-',
        last_login: adminMeta.last_login || profile.updated_at || profile.created_at || null,
        created_at: profile.created_at || null,
        updated_at: profile.updated_at || null
      };
    });

    return { data: merged, error: null };
  } catch (error) {
    console.error('Error fetching users from profiles:', error);
    return { data: null, error: error.message };
  }
};

// Get all admins
export const getAllUsers = async ({ includePersonnelWorkspaceProfiles = false } = {}) => {
  try {
    const [accountsResult, profilesResult] = await Promise.all([
      supabase.from('admin').select('*'),
      includePersonnelWorkspaceProfiles
        ? supabase.from(PERSONNEL_WORKSPACE_TABLE).select('*')
        : Promise.resolve({ data: [], error: null })
    ]);
    
    if (accountsResult.error) throw accountsResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const accounts = accountsResult.data || [];
    if (!includePersonnelWorkspaceProfiles) {
      return { data: accounts, error: null };
    }

    const accountsById = new Map(accounts.map((account) => [account.admin_id, account]));
    const workspaceUsers = (profilesResult.data || [])
      .map((profile) => toPersonnelWorkspaceUser(accountsById.get(profile.admin_id), profile))
      .filter(Boolean);

    return { data: [...accounts, ...workspaceUsers], error: null };
  } catch (error) {
    console.error('Error fetching admins:', error);
    return { data: null, error: error.message };
  }
};

// Get admin by ID
export const getUserById = async (adminId) => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .select('*')
      .eq('admin_id', adminId)
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching admin:', error);
    return { data: null, error: error.message };
  }
};

// Create new admin
export const createUser = async (userData) => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .insert([userData])
      .select()
      .single();
    
    if (error) throw error;
    emitDataChanged('users', { action: 'create', admin_id: data?.admin_id || null });
    return { data, error: null };
  } catch (error) {
    console.error('Error creating admin:', error);
    return { data: null, error: error.message };
  }
};

// Update admin
export const updateUser = async (adminId, updates) => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .update(updates)
      .eq('admin_id', adminId)
      .select('admin_id');
    
    if (error) throw error;

    if (!Array.isArray(data) || data.length === 0) {
      return {
        data: null,
        error: 'No account was updated. Check admin table UPDATE policy (RLS) and target user ID.'
      };
    }

    emitDataChanged('users', { action: 'update', admin_id: adminId });
    return { data: data[0], error: null };
  } catch (error) {
    console.error('Error updating admin:', error);
    return { data: null, error: error.message };
  }
};

// Delete admin
export const deleteUser = async (adminId) => {
  try {
    const normalizedAdminId = String(adminId || '').trim();
    if (!normalizedAdminId) {
      return { data: null, deletedCount: 0, error: 'Missing admin ID.' };
    }

    if (ADMIN_API_URL) {
      const response = await callAdminApi('/api/admin/users/delete', { admin_id: normalizedAdminId });
      return {
        data: response?.data || null,
        deletedCount: response?.data?.deletedCount || 0,
        error: response?.error || null
      };
    }

    const { data: targetAccount, error: lookupError } = await supabase
      .from('admin')
      .select('role')
      .eq('admin_id', normalizedAdminId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!targetAccount) {
      return { data: null, deletedCount: 0, error: 'Account was not found.' };
    }
    if (String(targetAccount.role || '').trim().toLowerCase() === 'admin') {
      return { data: null, deletedCount: 0, error: 'Administrator accounts cannot be deleted.' };
    }

    const { data, error } = await supabase
      .from('admin')
      .delete()
      .eq('admin_id', normalizedAdminId)
      .select('admin_id');

    if (error) throw error;

    const deletedCount = Array.isArray(data) ? data.length : 0;
    if (deletedCount === 0) {
      throw new Error('No account was deleted. Check admin table DELETE policy (RLS) and target user ID.');
    }

    emitDataChanged('users', { action: 'delete', admin_id: normalizedAdminId });
    return { data, deletedCount, error: null };
  } catch (error) {
    console.error('Error deleting admin:', error);
    return { data: null, error: error.message };
  }
};

// Get admin by email
export const getUserByEmail = async (email) => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching admin by email:', error);
    return { data: null, error: error.message };
  }
};

// Get admins by role
export const getUsersByRole = async (role) => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .select('*')
      .eq('role', role);
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching admins by role:', error);
    return { data: null, error: error.message };
  }
};

// Get active admins
export const getActiveUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .select('*')
      .eq('status', 'Active');
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching active admins:', error);
    return { data: null, error: error.message };
  }
};

// Update admin last login
export const updateUserLastLogin = async (adminId) => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .update({ last_login: new Date().toISOString() })
      .eq('admin_id', adminId)
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating last login:', error);
    return { data: null, error: error.message };
  }
};

// Get personnel overview statistics for dashboard
export const getPersonnelOverviewStats = async () => {
  try {
    const { data: allUsers, error: personnelError } = await getAllUsers({
      includePersonnelWorkspaceProfiles: true
    });
    
    if (personnelError) throw personnelError;
    const personnelData = (allUsers || [])
      .filter((user) => String(user.role || '').toLowerCase() === 'personnel');
    
    const totalPersonnel = personnelData?.length || 0;
    const activePersonnel = personnelData?.filter(p => p.status === 'Active').length || 0;
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's attendance records
    const { data: todayAttendance, error: attendanceError } = await supabase
      .from('attendance_records')
      .select('personnel_id, time_in, time_out')
      .eq('attendance_date', today);
    
    if (attendanceError) throw attendanceError;
    
    // Calculate on-duty and off-duty counts
    const onDutySet = new Set();
    const offDutySet = new Set();
    
    if (todayAttendance && todayAttendance.length > 0) {
      todayAttendance.forEach(record => {
        if (record.time_in && !record.time_out) {
          // Checked in but not checked out = on duty
          onDutySet.add(record.personnel_id);
        } else if (record.time_in && record.time_out) {
          // Both checked in and out = off duty
          offDutySet.add(record.personnel_id);
        }
      });
    }
    
    const onDuty = onDutySet.size;
    const offDuty = offDutySet.size;
    
    // Calculate attendance percentage
    const presentToday = onDutySet.size + offDutySet.size;
    const attendancePercentage = activePersonnel > 0 
      ? Math.round((presentToday / activePersonnel) * 100) 
      : 0;
    
    return {
      data: {
        totalPersonnel: activePersonnel,
        totalCapacity: totalPersonnel,
        onDuty,
        offDuty,
        attendancePercentage
      },
      error: null
    };
  } catch (error) {
    console.error('Error fetching personnel overview stats:', error);
    return { 
      data: null, 
      error: error.message 
    };
  }
};

export const logAdminActivity = async ({
  actorId = null,
  actorName = 'Admin User',
  action,
  actionType = 'edit',
  details = '',
  status = 'SUCCESS',
  metadata = null
}) => {
  try {
    if (!action) {
      return { error: 'Missing required action for admin activity log.' };
    }

    const payload = {
      admin_id: actorId,
      actor_name: actorName,
      action,
      action_type: actionType,
      details,
      status,
      metadata
    };

    const { error } = await supabase
      .from(ADMIN_ACTIVITY_TABLE)
      .insert(payload);

    if (error) {
      // If the table is not set up yet, do not block the user flow.
      if (error.code === '42P01') {
        console.warn('admin_activity_logs table does not exist yet. Run setup SQL to enable custom admin action logs.');
        return { error: null };
      }
      throw error;
    }

    return { error: null };
  } catch (error) {
    console.error('Error logging admin activity:', error);
    return { error: error.message };
  }
};

// Get admin-only audit logs (no report workflow events)
export const getAdminAuditLogs = async () => {
  try {
    const [adminRowsRes, activityRowsRes] = await Promise.all([
      supabase
        .from('admin')
        .select('admin_id, first_name, last_name, email, role, status, created_at, updated_at, last_login')
        .order('updated_at', { ascending: false }),
      supabase
        .from(ADMIN_ACTIVITY_TABLE)
        .select('log_id, admin_id, actor_name, action, action_type, details, status, performed_at')
        .order('performed_at', { ascending: false })
    ]);

    if (adminRowsRes.error) throw adminRowsRes.error;

    let customActivityRows = activityRowsRes.data || [];
    if (activityRowsRes.error) {
      if (activityRowsRes.error.code !== '42P01') {
        throw activityRowsRes.error;
      }
      customActivityRows = [];
    }

    const rows = adminRowsRes.data || [];
    const logs = [];

    rows.forEach((row) => {
      const userLabel = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email || 'Admin User';
      const roleLabel = row.role || '-';
      const statusLabel = row.status || '-';

      if (row.created_at) {
        logs.push({
          id: `create-${row.admin_id}`,
          timestamp: row.created_at,
          user: userLabel,
          action: 'Account Created',
          actionType: 'registration',
          details: `Created ${roleLabel} account (${statusLabel})`,
          status: 'SUCCESS'
        });
      }

      if (row.last_login) {
        logs.push({
          id: `login-${row.admin_id}`,
          timestamp: row.last_login,
          user: userLabel,
          action: 'User Login',
          actionType: 'submission',
          details: 'Successful login',
          status: 'SUCCESS'
        });
      }

      if (row.updated_at && row.created_at && row.updated_at !== row.created_at) {
        logs.push({
          id: `update-${row.admin_id}`,
          timestamp: row.updated_at,
          user: userLabel,
          action: 'Account Updated',
          actionType: 'edit',
          details: `Updated account details (${statusLabel})`,
          status: 'SUCCESS'
        });
      }
    });

    customActivityRows.forEach((row) => {
      logs.push({
        id: `activity-${row.log_id || `${row.admin_id || 'unknown'}-${row.performed_at || Date.now()}`}`,
        timestamp: row.performed_at,
        user: row.actor_name || 'Admin User',
        action: row.action || 'Admin Activity',
        actionType: row.action_type || 'edit',
        details: row.details || '-',
        status: row.status || 'SUCCESS'
      });
    });

    logs.sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return bTime - aTime;
    });

    return { data: logs, error: null };
  } catch (error) {
    console.error('Error fetching admin audit logs:', error);
    return { data: [], error: error.message };
  }
};
