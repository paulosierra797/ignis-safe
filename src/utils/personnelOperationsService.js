import { supabase } from './supabaseClient';
import { getAllUsers, getShiftScheduleConfig } from './usersService';
import { getManilaToday } from './dateUtils';

const ADMIN_TABLE = 'admin';
const PERSONNEL_WORKSPACE_TABLE = 'personnel_workspace_profiles';
const LEAVE_REQUESTS_TABLE = 'leave_requests';
const DATA_CHANGED_EVENT = 'ignis-safe:data-changed';

export const LEAVE_TYPES = [
  'Vacation Leave',
  'Sick Leave',
  'Emergency Leave',
  'Maternity Leave',
  'Paternity Leave',
  'Other'
];

export const LEAVE_TYPES_REQUIRING_DOCUMENT = new Set(['Sick Leave', 'Maternity Leave', 'Paternity Leave']);

export const RELIEVER_ADMIN_ASSIGN_VALUE = '__ADMIN_ASSIGN__';

const LEAVE_DOCUMENT_BUCKET = 'leave_supporting_documents';
export const LEAVE_DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png';
export const LEAVE_DOCUMENT_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const LEAVE_DOCUMENT_ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const LEAVE_DOCUMENT_ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);

const CONTACT_NUMBER_REGEX = /^[0-9+\-\s()]{7,20}$/;

export const isValidLeaveContactNumber = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  if (!CONTACT_NUMBER_REGEX.test(trimmed)) return false;
  const digitCount = trimmed.replace(/[^0-9]/g, '').length;
  return digitCount >= 7 && digitCount <= 13;
};

// Inclusive day count (a same-day leave request counts as 1 day), derived
// from the stored dates rather than persisted so it can never go stale.
export const calculateLeaveDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
};

const getLeaveDocumentExtension = (fileName = '') => {
  const match = /\.([a-zA-Z0-9]+)$/.exec(String(fileName || ''));
  return match ? match[1].toLowerCase() : '';
};

export const isAllowedLeaveDocument = (file) => {
  if (!file) return false;
  const extension = getLeaveDocumentExtension(file.name);
  const mimeType = String(file.type || '').trim().toLowerCase();
  return LEAVE_DOCUMENT_ALLOWED_EXTENSIONS.has(extension)
    && (!mimeType || LEAVE_DOCUMENT_ALLOWED_MIME_TYPES.has(mimeType));
};

const sanitizeLeaveDocumentFileName = (fileName = '') =>
  String(fileName || 'leave-document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 140);

export const uploadLeaveSupportingDocument = async (personnelId, file) => {
  try {
    const safeName = sanitizeLeaveDocumentFileName(file?.name || `leave-document-${Date.now()}`);
    const filePath = `${personnelId}/${Date.now()}-${safeName}`;
    const contentType = String(file?.type || '').trim().toLowerCase() || 'application/octet-stream';

    const { error: uploadError } = await supabase.storage
      .from(LEAVE_DOCUMENT_BUCKET)
      .upload(filePath, file, { contentType, upsert: false });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl }
    } = supabase.storage.from(LEAVE_DOCUMENT_BUCKET).getPublicUrl(filePath);

    return { data: { filePath, publicUrl }, error: null };
  } catch (error) {
    console.error('Error uploading leave supporting document:', error);
    return { data: null, error: error.message };
  }
};

const removeLeaveSupportingDocument = async (filePath) => {
  if (!filePath) return;
  try {
    await supabase.storage.from(LEAVE_DOCUMENT_BUCKET).remove([filePath]);
  } catch (error) {
    console.warn('Could not remove uploaded leave document after a failed submission:', error);
  }
};

const emitDataChanged = (scope, detail = {}) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, {
    detail: {
      scope,
      ...detail
    }
  }));
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatPersonnelName = (personnel) => {
  if (!personnel) return 'Personnel';

  return [personnel.rank, personnel.first_name, personnel.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || personnel.email || 'Personnel';
};

const isDateWithinInclusiveRange = (date, startDate, endDate) => {
  if (!date || !startDate || !endDate) {
    return false;
  }

  return date >= startDate && date <= endDate;
};

// A personnel's shift type is an explicit A/B assignment range, independent of
// whether today happens to be an active duty day for that range - so this
// resolves it from their assignment records (current, else next upcoming,
// else earliest) rather than from a single day's schedule row.
export const resolveCurrentShiftType = (assignments) => {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return null;
  }

  const today = getManilaToday();
  const current = assignments.find(
    (assignment) => assignment.start_date <= today && assignment.end_date >= today
  );
  if (current) {
    return current.shift_type;
  }

  const upcoming = assignments
    .filter((assignment) => assignment.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (upcoming) {
    return upcoming.shift_type;
  }

  return assignments[0].shift_type;
};

export const getReliefCandidates = async (excludePersonnelId) => {
  try {
    const { data, error } = await getAllUsers({ includePersonnelWorkspaceProfiles: true });
    if (error) throw new Error(error);

    const candidates = (data || [])
      .filter((user) => String(user.role || '').toLowerCase() === 'personnel')
      .filter((user) => String(user.status || '').toLowerCase() === 'active')
      .filter((user) => user.admin_id !== excludePersonnelId)
      .map((user) => ({
        admin_id: user.admin_id,
        name: formatPersonnelName(user)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { data: candidates, error: null };
  } catch (error) {
    console.error('Error fetching relief candidates:', error);
    return { data: [], error: error.message };
  }
};

const updatePersonnelLeaveState = async (personnelId, updates) => {
  const { data: workspaceProfile, error: workspaceError } = await supabase
    .from(PERSONNEL_WORKSPACE_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('admin_id', personnelId)
    .select('admin_id, status, leave_start_date, leave_end_date')
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (workspaceProfile) return workspaceProfile;

  const { data: account, error: accountError } = await supabase
    .from(ADMIN_TABLE)
    .update(updates)
    .eq('admin_id', personnelId)
    .select('admin_id, status, leave_start_date, leave_end_date')
    .maybeSingle();

  if (accountError) throw accountError;
  return account;
};

export const getPersonnelLeaveRequest = async (adminId) => {
  try {
    if (!adminId) {
      return { data: null, error: 'Missing personnel id.' };
    }

    const [workspaceResult, adminResult] = await Promise.all([
      supabase
        .from(PERSONNEL_WORKSPACE_TABLE)
        .select('admin_id, status, leave_start_date, leave_end_date')
        .eq('admin_id', adminId)
        .maybeSingle(),
      supabase
        .from(ADMIN_TABLE)
        .select('admin_id, status, leave_start_date, leave_end_date')
        .eq('admin_id', adminId)
        .maybeSingle()
    ]);

    if (workspaceResult.error) throw workspaceResult.error;
    if (adminResult.error) throw adminResult.error;
    const adminRow = workspaceResult.data || adminResult.data;

    const { data: requestRows, error: requestError } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select('request_id, leave_type, other_leave_type, start_date, end_date, reason, contact_number, reliever_id, reliever_type, document_path, document_url, document_name, document_mime_type, document_size_bytes, status, rejection_reason, approved_by, approved_at, created_at, updated_at')
      .eq('personnel_id', adminId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });

    if (requestError) throw requestError;

    const history = Array.isArray(requestRows) ? requestRows : [];

    const reviewerIds = [...new Set(history.map((row) => row.approved_by).filter(Boolean))];
    const relieverIds = [...new Set(history.map((row) => row.reliever_id).filter(Boolean))];
    const lookupIds = [...new Set([...reviewerIds, ...relieverIds])];
    let nameById = new Map();
    if (lookupIds.length > 0) {
      const { data: lookupRows, error: lookupError } = await supabase
        .from(ADMIN_TABLE)
        .select('admin_id, first_name, last_name, email')
        .in('admin_id', lookupIds);

      if (!lookupError && Array.isArray(lookupRows)) {
        nameById = new Map(
          lookupRows.map((row) => [
            row.admin_id,
            [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || 'Admin'
          ])
        );
      }
    }

    const historyWithReviewer = history.map((row) => ({
      ...row,
      reviewed_by_name: row.approved_by ? (nameById.get(row.approved_by) || null) : null,
      reliever_name: row.reliever_id ? (nameById.get(row.reliever_id) || null) : null
    }));

    return {
      data: {
        admin_id: adminRow?.admin_id || adminId,
        current_status: adminRow?.status || 'Active',
        leave_start_date: adminRow?.leave_start_date || null,
        leave_end_date: adminRow?.leave_end_date || null,
        latest_request: historyWithReviewer.length > 0 ? historyWithReviewer[0] : null,
        history: historyWithReviewer
      },
      error: null
    };
  } catch (error) {
    console.error('Error fetching personnel leave request:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('leave_requests')) {
      return {
        data: null,
        error: 'Leave request services are temporarily unavailable. Please try again later or contact the administrator.'
      };
    }
    return { data: null, error: error.message };
  }
};

export const submitPersonnelLeaveRequest = async (adminId, formValues = {}) => {
  const {
    leaveType,
    otherLeaveType = '',
    startDate,
    endDate,
    reason = '',
    contactNumber = '',
    relieverType = '',
    relieverId = null,
    documentFile = null
  } = formValues;

  let uploadedDocument = null;

  try {
    if (!adminId) {
      return { data: null, error: 'Missing personnel id.' };
    }

    if (!leaveType || !LEAVE_TYPES.includes(leaveType)) {
      return { data: null, error: 'Please select a leave type.' };
    }

    if (leaveType === 'Other' && !String(otherLeaveType || '').trim()) {
      return { data: null, error: 'Please specify the leave type.' };
    }

    if (!startDate || !endDate) {
      return { data: null, error: 'Please provide both leave start and end dates.' };
    }

    const today = getManilaToday();

    if (startDate < today || endDate < today) {
      return { data: null, error: 'You cannot submit a leave request for a past date.' };
    }

    if (endDate < startDate) {
      return { data: null, error: 'Leave end date must be on or after the start date.' };
    }

    if (!String(reason || '').trim()) {
      return { data: null, error: 'Please provide a reason for leave.' };
    }

    if (!isValidLeaveContactNumber(contactNumber)) {
      return { data: null, error: 'Please enter a valid contact number.' };
    }

    const requiresDocument = LEAVE_TYPES_REQUIRING_DOCUMENT.has(leaveType);
    if (requiresDocument && !documentFile) {
      return { data: null, error: `A supporting document is required for ${leaveType}.` };
    }

    if (documentFile && !isAllowedLeaveDocument(documentFile)) {
      return { data: null, error: 'Unsupported file type. Please upload a PDF, JPG, JPEG, or PNG file.' };
    }

    if (documentFile && documentFile.size > LEAVE_DOCUMENT_MAX_SIZE_BYTES) {
      return { data: null, error: 'Supporting document exceeds the 5MB size limit.' };
    }

    const { data: pendingRows, error: pendingError } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select('request_id')
      .eq('personnel_id', adminId)
      .eq('status', 'pending')
      .limit(1);

    if (pendingError) throw pendingError;

    if (Array.isArray(pendingRows) && pendingRows.length > 0) {
      return {
        data: null,
        error: 'You already have a pending leave request awaiting admin approval.'
      };
    }

    const { data: overlapRows, error: overlapError } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select('request_id')
      .eq('personnel_id', adminId)
      .eq('is_archived', false)
      .in('status', ['pending', 'approved'])
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .limit(1);

    if (overlapError) throw overlapError;

    if (Array.isArray(overlapRows) && overlapRows.length > 0) {
      return {
        data: null,
        error: 'This leave period overlaps with an existing leave request.'
      };
    }

    if (documentFile) {
      const upload = await uploadLeaveSupportingDocument(adminId, documentFile);
      if (upload.error) {
        return { data: null, error: upload.error };
      }
      uploadedDocument = {
        document_path: upload.data.filePath,
        document_url: upload.data.publicUrl,
        document_name: documentFile.name,
        document_mime_type: String(documentFile.type || '').trim().toLowerCase(),
        document_size_bytes: Number(documentFile.size || 0)
      };
    }

    const { data, error } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .insert({
        personnel_id: adminId,
        leave_type: leaveType,
        other_leave_type: leaveType === 'Other' ? String(otherLeaveType || '').trim() : null,
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
        contact_number: String(contactNumber || '').trim() || null,
        reliever_type: relieverType || null,
        reliever_id: relieverType === 'personnel' ? relieverId : null,
        status: 'pending',
        ...(uploadedDocument || {})
      })
      .select('request_id, personnel_id, leave_type, other_leave_type, start_date, end_date, reason, contact_number, reliever_id, reliever_type, document_path, document_url, document_name, document_mime_type, document_size_bytes, status, created_at, updated_at')
      .single();

    if (error) throw error;

    emitDataChanged('leave_requests', { action: 'create', personnel_id: adminId });

    return { data, error: null };
  } catch (error) {
    console.error('Error submitting personnel leave request:', error);
    if (uploadedDocument) {
      await removeLeaveSupportingDocument(uploadedDocument.document_path);
    }
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('leave_requests')) {
      return {
        data: null,
        error: 'Leave request services are temporarily unavailable. Please try again later or contact the administrator.'
      };
    }
    return { data: null, error: error.message };
  }
};

export const getPendingLeaveRequests = async () => {
  try {
    const { data, error } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select('request_id, personnel_id, leave_type, other_leave_type, start_date, end_date, reason, contact_number, reliever_id, reliever_type, document_path, document_url, document_name, document_mime_type, document_size_bytes, status, created_at')
      .eq('status', 'pending')
      .eq('is_archived', false)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching pending leave requests:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('leave_requests')) {
      return {
        data: [],
        error: 'Leave request services are temporarily unavailable. Please try again later or contact the administrator.'
      };
    }
    return { data: [], error: error.message };
  }
};

export const getAllLeaveRequests = async ({ archived = false } = {}) => {
  try {
    const [requestsRes, usersRes] = await Promise.all([
      supabase
        .from(LEAVE_REQUESTS_TABLE)
        .select('request_id, personnel_id, leave_type, other_leave_type, start_date, end_date, reason, contact_number, reliever_id, reliever_type, document_path, document_url, document_name, document_mime_type, document_size_bytes, status, approved_by, approved_at, rejection_reason, created_at, updated_at, is_archived, archived_at, archived_by')
        .eq('is_archived', archived)
        .order(archived ? 'archived_at' : 'created_at', { ascending: false }),
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
      const reviewer = row.approved_by ? accountById.get(row.approved_by) : null;
      const archiver = row.archived_by ? accountById.get(row.archived_by) : null;
      const reliever = row.reliever_id ? personnelById.get(row.reliever_id) : null;

      return {
        ...row,
        personnel_name: formatUserLabel(personnel),
        personnel_rank: personnel?.rank || '',
        personnel_email: personnel?.email || '',
        reviewed_by_name: reviewer ? formatUserLabel(reviewer) : null,
        archived_by_name: archiver ? formatUserLabel(archiver) : null,
        reliever_name: reliever ? formatUserLabel(reliever) : null
      };
    });

    return { data: rows, error: null };
  } catch (error) {
    console.error('Error fetching leave request history:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('leave_requests')) {
      return {
        data: [],
        error: 'Leave request services are temporarily unavailable. Please try again later or contact the administrator.'
      };
    }
    return { data: [], error: error.message };
  }
};

export const archiveLeaveRequest = async ({ requestId, archivedBy }) => {
  try {
    const { data, error } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
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
    if (!data) return { data: null, error: 'Only reviewed leave requests can be archived.' };

    emitDataChanged('leave_requests', { action: 'archive', request_id: requestId });
    return { data, error: null };
  } catch (error) {
    console.error('Error archiving leave request:', error);
    return { data: null, error: error.message };
  }
};

export const restoreLeaveRequest = async ({ requestId }) => {
  try {
    const { data, error } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
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
    if (!data) return { data: null, error: 'Archived leave request was not found.' };

    emitDataChanged('leave_requests', { action: 'restore', request_id: requestId });
    return { data, error: null };
  } catch (error) {
    console.error('Error restoring leave request:', error);
    return { data: null, error: error.message };
  }
};

export const approveLeaveRequest = async ({ requestId, personnelId, startDate, endDate, approvedBy }) => {
  try {
    const accountUpdate = await updatePersonnelLeaveState(personnelId, {
      status: 'On Leave',
      leave_start_date: startDate,
      leave_end_date: endDate
    });
    if (!accountUpdate) {
      return {
        data: null,
        error: 'No account was updated while approving the leave request.'
      };
    }

    const { data: requestUpdate, error: requestError } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .update({
        status: 'approved',
        approved_by: approvedBy || null,
        approved_at: new Date().toISOString(),
        rejection_reason: null
      })
      .eq('request_id', requestId)
      .eq('status', 'pending')
      .select('request_id, personnel_id, start_date, end_date, status, approved_by, approved_at')
      .maybeSingle();

    if (requestError) throw requestError;
    if (!requestUpdate) {
      return { data: null, error: 'Leave request is no longer pending.' };
    }

    return {
      data: {
        request: requestUpdate,
        account: accountUpdate
      },
      error: null
    };
  } catch (error) {
    console.error('Error approving leave request:', error);
    return { data: null, error: error.message };
  }
};

export const rejectLeaveRequest = async ({ requestId, rejectedBy, rejectionReason = '' }) => {
  try {
    const { data, error } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .update({
        status: 'rejected',
        approved_by: rejectedBy || null,
        approved_at: new Date().toISOString(),
        rejection_reason: rejectionReason || null
      })
      .eq('request_id', requestId)
      .eq('status', 'pending')
      .select('request_id, personnel_id, start_date, end_date, status, rejection_reason, approved_by, approved_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { data: null, error: 'Leave request is no longer pending.' };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error rejecting leave request:', error);
    return { data: null, error: error.message };
  }
};

export const getPersonnelShiftSchedule = async ({
  startDate,
  endDate,
  viewerPersonnelId
}) => {
  try {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const totalDays =
      Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const scheduleStartDate = toIsoDate(start);
    const scheduleEndDate = toIsoDate(end);
    const [configResult, personnelResult, assignmentResult, viewerAssignmentResult] = await Promise.all([
      getShiftScheduleConfig(),
      getAllUsers({ includePersonnelWorkspaceProfiles: true }),
      getShiftAssignmentsForPeriod({
        startDate: scheduleStartDate,
        endDate: scheduleEndDate
      }),
      viewerPersonnelId ? getPersonnelShiftAssignments(viewerPersonnelId) : Promise.resolve({ data: [], error: null })
    ]);

    if (configResult.error) {
      return { data: null, error: configResult.error };
    }

    if (personnelResult.error) {
      return { data: null, error: personnelResult.error };
    }

    if (assignmentResult.error) {
      return { data: null, error: assignmentResult.error };
    }

    const config = configResult.data;
    const personnelRows = (Array.isArray(personnelResult.data) ? personnelResult.data : [])
      .filter((personnel) => String(personnel.role || '').toLowerCase() === 'personnel');
    const assignments = Array.isArray(assignmentResult.data) ? assignmentResult.data : [];
    const personnelById = new Map(personnelRows.map((personnel) => [personnel.admin_id, personnel]));
    const viewerShiftType = resolveCurrentShiftType(viewerAssignmentResult.data || []);

    // Personnel on leave aren't tied to a shift by a duty assignment for the
    // day they're absent, so their own shift is resolved from whatever
    // assignment(s) they hold within the visible period.
    const personnelShiftTypes = new Map();
    assignments.forEach((assignment) => {
      const type = String(assignment.shift_type || '').toUpperCase();
      if (!type) return;
      if (!personnelShiftTypes.has(assignment.personnel_id)) {
        personnelShiftTypes.set(assignment.personnel_id, new Set());
      }
      personnelShiftTypes.get(assignment.personnel_id).add(type);
    });

    const shiftA = new Set(config?.shift_a_dates || []);
    const shiftB = new Set(config?.shift_b_dates || []);

    const rows = [];
    for (let offset = 0; offset < totalDays; offset += 1) {
      const targetDate = new Date(start);
      targetDate.setDate(start.getDate() + offset);

      const isoDate = toIsoDate(targetDate);
      const hasA = shiftA.has(isoDate);
      const hasB = shiftB.has(isoDate);
      const shiftTypes = [hasA ? 'A' : null, hasB ? 'B' : null].filter(Boolean);

      let shift = 'Off Duty';
      if (hasA && hasB) {
        shift = 'Shift A & B';
      } else if (hasA) {
        shift = 'Shift A';
      } else if (hasB) {
        shift = 'Shift B';
      }

      // Admin/management callers omit viewerPersonnelId and see the full
      // roster for both shifts; only a personnel viewer's own page is scoped
      // to their assigned shift.
      const canViewDetails = !viewerPersonnelId
        || (Boolean(viewerShiftType) && shiftTypes.includes(viewerShiftType));
      const dayLabel = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
      const displayDate = targetDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      if (!canViewDetails) {
        rows.push({
          date: isoDate,
          dayLabel,
          displayDate,
          shift,
          onDutyPersonnel: [],
          onLeavePersonnel: [],
          onDutyCount: null,
          onLeaveCount: null,
          restricted: true
        });
        continue;
      }

      const visibleShiftTypes = viewerPersonnelId ? [viewerShiftType] : shiftTypes;

      const onLeavePersonnel = personnelRows
        .filter((personnel) => String(personnel.status || '').toLowerCase() === 'on leave')
        .filter((personnel) => isDateWithinInclusiveRange(isoDate, personnel.leave_start_date, personnel.leave_end_date))
        .filter((personnel) => !viewerPersonnelId || personnelShiftTypes.get(personnel.admin_id)?.has(viewerShiftType))
        .map((personnel) => ({
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel)
        }));

      const leavePersonnelIds = new Set(onLeavePersonnel.map((personnel) => personnel.admin_id));

      const onDutyPersonnel = assignments
        .filter((assignment) => visibleShiftTypes.includes(String(assignment.shift_type || '').toUpperCase()))
        .filter((assignment) => isDateWithinInclusiveRange(isoDate, assignment.start_date, assignment.end_date))
        .map((assignment) => personnelById.get(assignment.personnel_id) || null)
        .filter((personnel) => personnel && !leavePersonnelIds.has(personnel.admin_id))
        .map((personnel) => ({
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel)
        }));

      const uniqueOnDutyPersonnel = Array.from(new Map(onDutyPersonnel.map((personnel) => [personnel.admin_id, personnel])).values());
      const uniqueOnLeavePersonnel = Array.from(new Map(onLeavePersonnel.map((personnel) => [personnel.admin_id, personnel])).values());

      rows.push({
        date: isoDate,
        dayLabel,
        displayDate,
        shift,
        onDutyPersonnel: uniqueOnDutyPersonnel,
        onLeavePersonnel: uniqueOnLeavePersonnel,
        onDutyCount: uniqueOnDutyPersonnel.length,
        onLeaveCount: uniqueOnLeavePersonnel.length,
        restricted: false
      });
    }

    return {
      data: {
        rows,
        totalShiftADates: (config?.shift_a_dates || []).length,
        totalShiftBDates: (config?.shift_b_dates || []).length
      },
      error: null
    };
  } catch (error) {
    console.error('Error loading personnel shift schedule:', error);
    return { data: null, error: error.message };
  }
};

const formatAttendanceTime = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
};

export const getPersonnelForDate = async (dateIso, viewerPersonnelId) => {
  try {
    if (!dateIso) {
      return { data: null, error: 'Missing date.' };
    }

    const [configResult, personnelResult, assignmentResult, attendanceResult, viewerAssignmentResult] = await Promise.all([
      getShiftScheduleConfig(),
      getAllUsers({ includePersonnelWorkspaceProfiles: true }),
      getShiftAssignmentsForPeriod({ startDate: dateIso, endDate: dateIso }),
      supabase
        .from('attendance_records')
        .select('personnel_id, time_in, time_out')
        .eq('attendance_date', dateIso),
      viewerPersonnelId ? getPersonnelShiftAssignments(viewerPersonnelId) : Promise.resolve({ data: [], error: null })
    ]);

    if (configResult.error) return { data: null, error: configResult.error };
    if (personnelResult.error) return { data: null, error: personnelResult.error };
    if (assignmentResult.error) return { data: null, error: assignmentResult.error };
    if (attendanceResult.error) throw attendanceResult.error;
    const config = configResult.data;
    const personnelRows = (Array.isArray(personnelResult.data) ? personnelResult.data : [])
      .filter((personnel) => String(personnel.role || '').toLowerCase() === 'personnel');
    const personnelById = new Map(personnelRows.map((personnel) => [personnel.admin_id, personnel]));
    const assignments = Array.isArray(assignmentResult.data) ? assignmentResult.data : [];
    const viewerShiftType = resolveCurrentShiftType(viewerAssignmentResult.data || []);

    const attendanceByPersonnelId = new Map(
      (attendanceResult.data || []).map((row) => [row.personnel_id, row])
    );

    const shiftA = new Set(config?.shift_a_dates || []);
    const shiftB = new Set(config?.shift_b_dates || []);
    const hasA = shiftA.has(dateIso);
    const hasB = shiftB.has(dateIso);
    const shiftTypes = [hasA ? 'A' : null, hasB ? 'B' : null].filter(Boolean);

    // The viewer's own on-duty/on-leave status for this date is not personnel
    // detail belonging to someone else, so it is always resolved - even on a
    // date that belongs to the other shift and is otherwise restricted.
    const viewerIsOnLeave = personnelRows.some(
      (personnel) => personnel.admin_id === viewerPersonnelId
        && String(personnel.status || '').toLowerCase() === 'on leave'
        && isDateWithinInclusiveRange(dateIso, personnel.leave_start_date, personnel.leave_end_date)
    );
    const viewerIsOnDuty = !viewerIsOnLeave && assignments.some(
      (assignment) => assignment.personnel_id === viewerPersonnelId
        && shiftTypes.includes(String(assignment.shift_type || '').toUpperCase())
        && isDateWithinInclusiveRange(dateIso, assignment.start_date, assignment.end_date)
    );
    const viewerStatus = viewerIsOnLeave ? 'On Leave' : viewerIsOnDuty ? 'On Duty' : 'Off Duty';

    // Admin/management callers omit viewerPersonnelId and see the full
    // roster for both shifts; only a personnel viewer's own page is scoped
    // to their assigned shift.
    const canViewDetails = !viewerPersonnelId
      || (Boolean(viewerShiftType) && shiftTypes.includes(viewerShiftType));

    if (!canViewDetails) {
      return {
        data: { date: dateIso, onDuty: [], onLeave: [], viewerStatus, restricted: true },
        error: null
      };
    }

    const visibleShiftTypes = viewerPersonnelId ? [viewerShiftType] : shiftTypes;

    const personnelShiftTypes = new Map();
    assignments.forEach((assignment) => {
      const type = String(assignment.shift_type || '').toUpperCase();
      if (!type) return;
      personnelShiftTypes.set(assignment.personnel_id, type);
    });

    const onLeave = personnelRows
      .filter((personnel) => String(personnel.status || '').toLowerCase() === 'on leave')
      .filter((personnel) => isDateWithinInclusiveRange(dateIso, personnel.leave_start_date, personnel.leave_end_date))
      .filter((personnel) => !viewerPersonnelId || personnelShiftTypes.get(personnel.admin_id) === viewerShiftType)
      .map((personnel) => ({
        admin_id: personnel.admin_id,
        name: formatPersonnelName(personnel),
        rank: personnel.rank || '-',
        leave_start_date: personnel.leave_start_date,
        leave_end_date: personnel.leave_end_date,
        approval_status: 'Approved'
      }));

    const onLeaveIds = new Set(onLeave.map((personnel) => personnel.admin_id));

    const onDutyPersonnelIds = new Set(
      assignments
        .filter((assignment) => visibleShiftTypes.includes(String(assignment.shift_type || '').toUpperCase()))
        .filter((assignment) => isDateWithinInclusiveRange(dateIso, assignment.start_date, assignment.end_date))
        .map((assignment) => assignment.personnel_id)
    );

    const onDuty = Array.from(onDutyPersonnelIds)
      .filter((personnelId) => !onLeaveIds.has(personnelId))
      .map((personnelId) => personnelById.get(personnelId))
      .filter(Boolean)
      .map((personnel) => {
        const attendance = attendanceByPersonnelId.get(personnel.admin_id);
        return {
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel),
          rank: personnel.rank || '-',
          time_in: formatAttendanceTime(attendance?.time_in),
          time_out: formatAttendanceTime(attendance?.time_out)
        };
      });

    return {
      data: { date: dateIso, onDuty, onLeave, viewerStatus, restricted: false },
      error: null
    };
  } catch (error) {
    console.error('Error loading personnel for date:', error);
    return { data: null, error: error.message };
  }
};

export const getShiftAssignmentSummaryForDate = async (dateIso) => {
  try {
    if (!dateIso) {
      return { data: null, error: 'Missing date.' };
    }

    const [configResult, personnelResult, assignmentResult] = await Promise.all([
      getShiftScheduleConfig(),
      getAllUsers({ includePersonnelWorkspaceProfiles: true }),
      getShiftAssignmentsForPeriod({ startDate: dateIso, endDate: dateIso })
    ]);

    if (configResult.error) return { data: null, error: configResult.error };
    if (personnelResult.error) return { data: null, error: personnelResult.error };
    if (assignmentResult.error) return { data: null, error: assignmentResult.error };

    const shiftADates = new Set(configResult.data?.shift_a_dates || []);
    const shiftBDates = new Set(configResult.data?.shift_b_dates || []);
    const activeShiftTypes = new Set([
      shiftADates.has(dateIso) ? 'A' : null,
      shiftBDates.has(dateIso) ? 'B' : null
    ].filter(Boolean));
    const personnelRows = (Array.isArray(personnelResult.data) ? personnelResult.data : [])
      .filter((personnel) => String(personnel.role || '').toLowerCase() === 'personnel');
    const personnelById = new Map(personnelRows.map((personnel) => [personnel.admin_id, personnel]));
    const assignments = Array.isArray(assignmentResult.data) ? assignmentResult.data : [];

    const buildShiftList = (shiftType) => {
      if (!activeShiftTypes.has(shiftType)) {
        return [];
      }

      const personnelIds = new Set(
        assignments
          .filter((assignment) => String(assignment.shift_type || '').toUpperCase() === shiftType)
          .filter((assignment) => isDateWithinInclusiveRange(dateIso, assignment.start_date, assignment.end_date))
          .map((assignment) => assignment.personnel_id)
      );

      return Array.from(personnelIds)
        .map((personnelId) => personnelById.get(personnelId))
        .filter(Boolean)
        .map((personnel) => ({
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel),
          rank: personnel.rank || '-'
        }))
        .sort((first, second) => first.name.localeCompare(second.name));
    };

    return {
      data: {
        date: dateIso,
        shiftA: buildShiftList('A'),
        shiftB: buildShiftList('B')
      },
      error: null
    };
  } catch (error) {
    console.error('Error loading shift assignment summary for date:', error);
    return { data: null, error: error.message };
  }
};

const PERSONNEL_SHIFT_ASSIGNMENTS_TABLE = 'personnel_shift_assignments';

export const assignPersonnelToShift = async ({ personnelId, shiftType, startDate, endDate, assignedBy }) => {
  try {
    if (!personnelId || !shiftType || !startDate || !endDate) {
      return { data: null, error: 'Missing required fields for shift assignment.' };
    }

    if (endDate < startDate) {
      return { data: null, error: 'End date must be on or after the start date.' };
    }

    const { data, error } = await supabase
      .from(PERSONNEL_SHIFT_ASSIGNMENTS_TABLE)
      .insert({
        personnel_id: personnelId,
        shift_type: shiftType.toUpperCase(),
        start_date: startDate,
        end_date: endDate,
        assigned_by: assignedBy
      })
      .select()
      .single();

    if (error) throw error;

    emitDataChanged('dashboard', { action: 'shift_assign', personnel_id: personnelId });

    return { data, error: null };
  } catch (error) {
    console.error('Error assigning personnel to shift:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('personnel_shift')) {
      return {
        data: null,
        error: 'Personnel shift assignments table is missing. Run personnel_shift_assignments_setup.sql first.'
      };
    }
    return { data: null, error: error.message };
  }
};

export const assignPersonnelToShiftBulk = async ({
  personnelIds,
  shiftType,
  startDate,
  endDate,
  assignedBy
}) => {
  try {
    const uniquePersonnelIds = Array.from(new Set(
      (Array.isArray(personnelIds) ? personnelIds : []).filter(Boolean)
    ));

    if (!uniquePersonnelIds.length || !shiftType || !startDate || !endDate) {
      return { data: [], error: 'Missing required fields for shift assignment.' };
    }

    if (endDate < startDate) {
      return { data: [], error: 'End date must be on or after the start date.' };
    }

    const rows = uniquePersonnelIds.map((personnelId) => ({
      personnel_id: personnelId,
      shift_type: shiftType.toUpperCase(),
      start_date: startDate,
      end_date: endDate,
      assigned_by: assignedBy
    }));

    const { data, error } = await supabase
      .from(PERSONNEL_SHIFT_ASSIGNMENTS_TABLE)
      .insert(rows)
      .select();

    if (error) throw error;

    emitDataChanged('dashboard', {
      action: 'shift_assign_bulk',
      personnel_ids: uniquePersonnelIds
    });

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error assigning personnel to shift in bulk:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('personnel_shift')) {
      return {
        data: [],
        error: 'Personnel shift assignments table is missing. Run personnel_shift_assignments_setup.sql first.'
      };
    }
    return { data: [], error: error.message };
  }
};

export const getPersonnelShiftAssignments = async (personnelId) => {
  try {
    if (!personnelId) {
      return { data: [], error: 'Missing personnel id.' };
    }

    const { data, error } = await supabase
      .from(PERSONNEL_SHIFT_ASSIGNMENTS_TABLE)
      .select('assignment_id, personnel_id, shift_type, start_date, end_date, assigned_by, created_at')
      .eq('personnel_id', personnelId)
      .order('start_date', { ascending: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching personnel shift assignments:', error);
    return { data: [], error: error.message };
  }
};

export const getShiftAssignmentsForPeriod = async ({ startDate, endDate, shiftType }) => {
  try {
    let query = supabase
      .from(PERSONNEL_SHIFT_ASSIGNMENTS_TABLE)
      .select('assignment_id, personnel_id, shift_type, start_date, end_date, assigned_by, created_at');

    if (shiftType) {
      query = query.eq('shift_type', shiftType.toUpperCase());
    }

    const { data, error } = await query
      .gte('end_date', startDate)
      .lte('start_date', endDate)
      .order('start_date', { ascending: true });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching shift assignments for period:', error);
    return { data: [], error: error.message };
  }
};

export const removeShiftAssignment = async (assignmentId) => {
  try {
    if (!assignmentId) {
      return { data: null, error: 'Missing assignment id.' };
    }

    const { data, error } = await supabase
      .from(PERSONNEL_SHIFT_ASSIGNMENTS_TABLE)
      .delete()
      .eq('assignment_id', assignmentId)
      .select()
      .single();

    if (error) throw error;

    emitDataChanged('dashboard', { action: 'shift_remove', assignment_id: assignmentId });

    return { data, error: null };
  } catch (error) {
    console.error('Error removing shift assignment:', error);
    return { data: null, error: error.message };
  }
};

export const removeShiftAssignmentsForTypes = async (shiftTypes) => {
  try {
    const normalizedShiftTypes = Array.from(new Set(
      (Array.isArray(shiftTypes) ? shiftTypes : [])
        .map((shiftType) => String(shiftType || '').trim().toUpperCase())
        .filter((shiftType) => ['A', 'B'].includes(shiftType))
    ));

    if (!normalizedShiftTypes.length) {
      return { data: [], removedCount: 0, error: null };
    }

    const { data, error } = await supabase
      .from(PERSONNEL_SHIFT_ASSIGNMENTS_TABLE)
      .delete()
      .in('shift_type', normalizedShiftTypes)
      .select('assignment_id, shift_type');

    if (error) throw error;

    const removedAssignments = data || [];
    emitDataChanged('dashboard', {
      action: 'shift_clear',
      shift_types: normalizedShiftTypes,
      removed_count: removedAssignments.length
    });

    return {
      data: removedAssignments,
      removedCount: removedAssignments.length,
      error: null
    };
  } catch (error) {
    console.error('Error clearing shift assignments:', error);
    return { data: [], removedCount: 0, error: error.message };
  }
};

export const updateShiftAssignment = async ({ assignmentId, startDate, endDate }) => {
  try {
    if (!assignmentId || !startDate || !endDate) {
      return { data: null, error: 'Missing required fields for shift assignment update.' };
    }

    if (endDate < startDate) {
      return { data: null, error: 'End date must be on or after the start date.' };
    }

    const { data, error } = await supabase
      .from(PERSONNEL_SHIFT_ASSIGNMENTS_TABLE)
      .update({
        start_date: startDate,
        end_date: endDate
      })
      .eq('assignment_id', assignmentId)
      .select()
      .single();

    if (error) throw error;

    emitDataChanged('dashboard', { action: 'shift_update', assignment_id: assignmentId });

    return { data, error: null };
  } catch (error) {
    console.error('Error updating shift assignment:', error);
    return { data: null, error: error.message };
  }
};
