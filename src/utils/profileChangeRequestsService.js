import { supabase } from './supabaseClient';
import { getAllUsers } from './usersService';

const TABLE = 'profile_change_requests';
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

export const PROFILE_FIELD_OPTIONS = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'rank', label: 'Rank' },
  { value: 'email', label: 'Email' },
  { value: 'contact_number', label: 'Phone Number' }
];

export const getProfileFieldLabel = (fieldName) => {
  const match = PROFILE_FIELD_OPTIONS.find((option) => option.value === fieldName);
  return match ? match.label : fieldName;
};

const NAME_FIELDS = ['first_name', 'last_name'];
const NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

const normalizeSpaces = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const isMissingTableError = (error) => (
  error?.code === '42P01'
  || String(error?.message || '').toLowerCase().includes('profile_change_requests')
);

export const getMyProfileChangeRequests = async (personnelId) => {
  try {
    if (!personnelId) {
      return { data: [], error: 'Missing personnel id.' };
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select('request_id, personnel_id, field_name, current_value, requested_value, reason, status, requested_at, reviewed_at, reviewed_by')
      .eq('personnel_id', personnelId)
      .order('requested_at', { ascending: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching profile change requests:', error);
    if (isMissingTableError(error)) {
      return {
        data: [],
        error: 'Profile change request table is missing. Run profile_change_requests_setup.sql first, then try again.'
      };
    }
    return { data: [], error: error.message };
  }
};

export const submitProfileChangeRequest = async (personnelId, { fieldName, currentValue = '', requestedValue, reason = '' }) => {
  try {
    if (!personnelId) {
      return { data: null, error: 'Missing personnel id.' };
    }

    if (!PROFILE_FIELD_OPTIONS.some((option) => option.value === fieldName)) {
      return { data: null, error: 'Please select a valid field to request a change for.' };
    }

    let trimmedRequestedValue = String(requestedValue || '').trim();
    if (!trimmedRequestedValue) {
      return { data: null, error: 'Please provide the requested new value.' };
    }

    if (NAME_FIELDS.includes(fieldName)) {
      trimmedRequestedValue = normalizeSpaces(requestedValue);
      if (!trimmedRequestedValue || !NAME_PATTERN.test(trimmedRequestedValue)) {
        return { data: null, error: 'Only letters and spaces are allowed.' };
      }
    }

    if (trimmedRequestedValue === String(currentValue || '').trim()) {
      return { data: null, error: 'The requested value must be different from the current value.' };
    }

    const { data: pendingRows, error: pendingError } = await supabase
      .from(TABLE)
      .select('request_id')
      .eq('personnel_id', personnelId)
      .eq('field_name', fieldName)
      .eq('status', 'pending')
      .limit(1);

    if (pendingError) throw pendingError;

    if (Array.isArray(pendingRows) && pendingRows.length > 0) {
      return {
        data: null,
        error: `You already have a pending request to change ${getProfileFieldLabel(fieldName)}.`
      };
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        personnel_id: personnelId,
        field_name: fieldName,
        current_value: currentValue || null,
        requested_value: trimmedRequestedValue,
        reason: reason || null,
        status: 'pending'
      })
      .select('request_id, personnel_id, field_name, current_value, requested_value, reason, status, requested_at')
      .single();

    if (error) throw error;

    emitDataChanged('profile_change_requests', { action: 'create', personnel_id: personnelId });

    return { data, error: null };
  } catch (error) {
    console.error('Error submitting profile change request:', error);
    if (error?.code === '23505') {
      return {
        data: null,
        error: `You already have a pending request to change ${getProfileFieldLabel(fieldName)}.`
      };
    }
    if (isMissingTableError(error)) {
      return {
        data: null,
        error: 'Profile change request table is missing. Run profile_change_requests_setup.sql first, then try again.'
      };
    }
    return { data: null, error: error.message };
  }
};

export const getPendingProfileChangeRequestsCount = async () => {
  try {
    const { count, error } = await supabase
      .from(TABLE)
      .select('request_id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) throw error;

    return { count: count || 0, error: null };
  } catch (error) {
    console.error('Error fetching pending profile change requests count:', error);
    if (isMissingTableError(error)) {
      return { count: 0, error: null };
    }
    return { count: 0, error: error.message };
  }
};

export const getAllProfileChangeRequests = async () => {
  try {
    const [requestsRes, usersRes] = await Promise.all([
      supabase
        .from(TABLE)
        .select('request_id, personnel_id, field_name, current_value, requested_value, reason, status, requested_at, reviewed_at, reviewed_by')
        .order('requested_at', { ascending: false }),
      getAllUsers({ includePersonnelWorkspaceProfiles: true })
    ]);

    if (requestsRes.error) throw requestsRes.error;
    if (usersRes.error) throw new Error(usersRes.error);

    const personnelById = new Map(
      (usersRes.data || [])
        .filter((user) => String(user.role || '').toLowerCase() === 'personnel')
        .map((user) => [user.admin_id, user])
    );
    const accountById = new Map(
      (usersRes.data || [])
        .filter((user) => !user.is_personnel_workspace_profile)
        .map((user) => [user.admin_id, user])
    );

    const formatUserLabel = (user) => {
      if (!user) return 'Unknown';
      return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email || 'Unknown';
    };

    const rows = (requestsRes.data || []).map((row) => {
      const personnel = personnelById.get(row.personnel_id);
      const reviewer = row.reviewed_by ? accountById.get(row.reviewed_by) : null;

      return {
        ...row,
        personnel_name: formatUserLabel(personnel),
        personnel_email: personnel?.email || '',
        reviewed_by_name: reviewer ? formatUserLabel(reviewer) : null
      };
    });

    return { data: rows, error: null };
  } catch (error) {
    console.error('Error fetching profile change requests:', error);
    if (isMissingTableError(error)) {
      return {
        data: [],
        error: 'Profile change request table is missing. Run profile_change_requests_setup.sql first, then try again.'
      };
    }
    return { data: [], error: error.message };
  }
};

export const approveProfileChangeRequest = async ({ requestId, reviewedBy }) => {
  try {
    if (!requestId) {
      return { data: null, error: 'Missing request id.' };
    }

    const { data: requestRow, error: fetchError } = await supabase
      .from(TABLE)
      .select('request_id, personnel_id, field_name, requested_value, status')
      .eq('request_id', requestId)
      .eq('status', 'pending')
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!requestRow) {
      return { data: null, error: 'This request is no longer pending.' };
    }

    const { data: workspaceUpdate, error: workspaceUpdateError } = await supabase
      .from('personnel_workspace_profiles')
      .update({ [requestRow.field_name]: requestRow.requested_value })
      .eq('admin_id', requestRow.personnel_id)
      .select('admin_id')
      .maybeSingle();

    if (workspaceUpdateError) throw workspaceUpdateError;

    if (!workspaceUpdate) {
      const { error: profileUpdateError } = await supabase
        .from('admin')
        .update({ [requestRow.field_name]: requestRow.requested_value })
        .eq('admin_id', requestRow.personnel_id);

      if (profileUpdateError) throw profileUpdateError;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy || null
      })
      .eq('request_id', requestId)
      .eq('status', 'pending')
      .select('request_id, personnel_id, field_name, requested_value, status, reviewed_at, reviewed_by')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { data: null, error: 'This request is no longer pending.' };
    }

    emitDataChanged('profile_change_requests', { action: 'approve', request_id: requestId, personnel_id: requestRow.personnel_id });
    emitDataChanged('users', { action: 'update', admin_id: requestRow.personnel_id });

    return { data, error: null };
  } catch (error) {
    console.error('Error approving profile change request:', error);
    return { data: null, error: error.message };
  }
};

export const rejectProfileChangeRequest = async ({ requestId, reviewedBy }) => {
  try {
    if (!requestId) {
      return { data: null, error: 'Missing request id.' };
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy || null
      })
      .eq('request_id', requestId)
      .eq('status', 'pending')
      .select('request_id, personnel_id, field_name, requested_value, status, reviewed_at, reviewed_by')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { data: null, error: 'This request is no longer pending.' };
    }

    emitDataChanged('profile_change_requests', { action: 'reject', request_id: requestId, personnel_id: data.personnel_id });

    return { data, error: null };
  } catch (error) {
    console.error('Error rejecting profile change request:', error);
    return { data: null, error: error.message };
  }
};
