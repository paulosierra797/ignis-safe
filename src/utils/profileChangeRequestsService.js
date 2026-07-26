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
  if (fieldName === 'multiple') return 'Multiple Details';
  const match = PROFILE_FIELD_OPTIONS.find((option) => option.value === fieldName);
  return match ? match.label : fieldName;
};

const NAME_FIELDS = ['first_name', 'last_name'];
const NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

const normalizeSpaces = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const normalizeRequestRow = (row = {}) => {
  const storedChanges = row.changes && typeof row.changes === 'object' && !Array.isArray(row.changes)
    ? row.changes
    : {};
  const changeItems = PROFILE_FIELD_OPTIONS
    .filter((option) => storedChanges[option.value])
    .map((option) => ({
      field_name: option.value,
      field_label: option.label,
      current_value: storedChanges[option.value]?.current_value ?? '',
      requested_value: storedChanges[option.value]?.requested_value ?? ''
    }));

  if (changeItems.length === 0 && row.field_name && row.field_name !== 'multiple') {
    changeItems.push({
      field_name: row.field_name,
      field_label: getProfileFieldLabel(row.field_name),
      current_value: row.current_value ?? '',
      requested_value: row.requested_value ?? ''
    });
  }

  return {
    ...row,
    change_items: changeItems
  };
};

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
      .select('request_id, personnel_id, field_name, current_value, requested_value, changes, reason, status, requested_at, reviewed_at, reviewed_by')
      .eq('personnel_id', personnelId)
      .eq('is_archived', false)
      .order('requested_at', { ascending: false });

    if (error) throw error;

    return { data: (data || []).map(normalizeRequestRow), error: null };
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

export const submitProfileChangeRequest = async (
  personnelId,
  { changes = null, fieldName, currentValue = '', requestedValue, reason = '' }
) => {
  try {
    if (!personnelId) {
      return { data: null, error: 'Missing personnel id.' };
    }

    const requestedChanges = changes || {
      [fieldName]: { currentValue, requestedValue }
    };
    const normalizedChanges = {};

    for (const option of PROFILE_FIELD_OPTIONS) {
      const requestedChange = requestedChanges?.[option.value];
      if (!requestedChange) continue;

      const normalizedCurrentValue = String(
        requestedChange.currentValue ?? requestedChange.current_value ?? ''
      ).trim();
      let normalizedRequestedValue = String(
        requestedChange.requestedValue ?? requestedChange.requested_value ?? ''
      ).trim();
      if (!normalizedRequestedValue) continue;

      if (NAME_FIELDS.includes(option.value)) {
        normalizedRequestedValue = normalizeSpaces(normalizedRequestedValue);
        if (!NAME_PATTERN.test(normalizedRequestedValue)) {
          return { data: null, error: `${option.label} may only contain letters and spaces.` };
        }
      }

      if (normalizedRequestedValue === normalizedCurrentValue) continue;

      normalizedChanges[option.value] = {
        current_value: normalizedCurrentValue,
        requested_value: normalizedRequestedValue
      };
    }

    const changeEntries = Object.entries(normalizedChanges);
    if (changeEntries.length === 0) {
      return { data: null, error: 'Enter at least one new value that differs from your current information.' };
    }

    const { data: pendingRows, error: pendingError } = await supabase
      .from(TABLE)
      .select('request_id')
      .eq('personnel_id', personnelId)
      .eq('status', 'pending')
      .limit(1);

    if (pendingError) throw pendingError;

    if (Array.isArray(pendingRows) && pendingRows.length > 0) {
      return {
        data: null,
        error: 'You already have a pending profile change request awaiting admin review.'
      };
    }

    const [primaryFieldName, primaryChange] = changeEntries[0];

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        personnel_id: personnelId,
        field_name: primaryFieldName,
        current_value: primaryChange.current_value || null,
        requested_value: primaryChange.requested_value,
        changes: normalizedChanges,
        reason: reason || null,
        status: 'pending'
      })
      .select('request_id, personnel_id, field_name, current_value, requested_value, changes, reason, status, requested_at')
      .single();

    if (error) throw error;

    emitDataChanged('profile_change_requests', { action: 'create', personnel_id: personnelId });

    return { data: normalizeRequestRow(data), error: null };
  } catch (error) {
    console.error('Error submitting profile change request:', error);
    if (error?.code === '23505') {
      return {
        data: null,
        error: 'You already have a pending profile change request awaiting admin review.'
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
      .eq('status', 'pending')
      .eq('is_archived', false);

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

export const getAllProfileChangeRequests = async ({ archived = false } = {}) => {
  try {
    const [requestsRes, usersRes] = await Promise.all([
      supabase
        .from(TABLE)
        .select('request_id, personnel_id, field_name, current_value, requested_value, changes, reason, status, requested_at, reviewed_at, reviewed_by, is_archived, archived_at, archived_by')
        .eq('is_archived', archived)
        .order(archived ? 'archived_at' : 'requested_at', { ascending: false }),
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
      const archiver = row.archived_by ? accountById.get(row.archived_by) : null;

      return normalizeRequestRow({
        ...row,
        personnel_name: formatUserLabel(personnel),
        personnel_email: personnel?.email || '',
        reviewed_by_name: reviewer ? formatUserLabel(reviewer) : null,
        archived_by_name: archiver ? formatUserLabel(archiver) : null
      });
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
      .select('request_id, personnel_id, field_name, requested_value, changes, status')
      .eq('request_id', requestId)
      .eq('status', 'pending')
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!requestRow) {
      return { data: null, error: 'This request is no longer pending.' };
    }

    const normalizedRequest = normalizeRequestRow(requestRow);
    const profileUpdates = Object.fromEntries(
      normalizedRequest.change_items.map((item) => [item.field_name, item.requested_value])
    );
    if (Object.keys(profileUpdates).length === 0) {
      return { data: null, error: 'This request has no valid profile changes.' };
    }

    const { data: workspaceUpdate, error: workspaceUpdateError } = await supabase
      .from('personnel_workspace_profiles')
      .update({ ...profileUpdates, updated_at: new Date().toISOString() })
      .eq('admin_id', requestRow.personnel_id)
      .select('admin_id')
      .maybeSingle();

    if (workspaceUpdateError) throw workspaceUpdateError;

    if (!workspaceUpdate) {
      const { error: profileUpdateError } = await supabase
        .from('admin')
        .update(profileUpdates)
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
      .select('request_id, personnel_id, field_name, requested_value, changes, status, reviewed_at, reviewed_by')
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

export const archiveProfileChangeRequest = async ({ requestId, archivedBy }) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: archivedBy || null
      })
      .eq('request_id', requestId)
      .neq('status', 'pending')
      .eq('is_archived', false)
      .select('request_id, is_archived, archived_at, archived_by')
      .maybeSingle();

    if (error) throw error;
    if (!data) return { data: null, error: 'Only reviewed profile requests can be archived.' };

    emitDataChanged('profile_change_requests', { action: 'archive', request_id: requestId });
    return { data, error: null };
  } catch (error) {
    console.error('Error archiving profile change request:', error);
    return { data: null, error: error.message };
  }
};

export const restoreProfileChangeRequest = async ({ requestId }) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        is_archived: false,
        archived_at: null,
        archived_by: null
      })
      .eq('request_id', requestId)
      .eq('is_archived', true)
      .select('request_id, is_archived')
      .maybeSingle();

    if (error) throw error;
    if (!data) return { data: null, error: 'Archived profile request was not found.' };

    emitDataChanged('profile_change_requests', { action: 'restore', request_id: requestId });
    return { data, error: null };
  } catch (error) {
    console.error('Error restoring profile change request:', error);
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
