import { supabase } from './supabaseClient';
import { getAllUsers, getShiftScheduleConfig } from './usersService';
import { getManilaToday } from './dateUtils';

const ADMIN_TABLE = 'admin';
const PERSONNEL_WORKSPACE_TABLE = 'personnel_workspace_profiles';
const LEAVE_REQUESTS_TABLE = 'leave_requests';
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

    const { data: latestRequestRows, error: requestError } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select('request_id, start_date, end_date, reason, status, rejection_reason, created_at, updated_at')
      .eq('personnel_id', adminId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (requestError) throw requestError;

    const latestRequest = Array.isArray(latestRequestRows) && latestRequestRows.length > 0
      ? latestRequestRows[0]
      : null;

    return {
      data: {
        admin_id: adminRow?.admin_id || adminId,
        current_status: adminRow?.status || 'Active',
        leave_start_date: adminRow?.leave_start_date || null,
        leave_end_date: adminRow?.leave_end_date || null,
        latest_request: latestRequest
      },
      error: null
    };
  } catch (error) {
    console.error('Error fetching personnel leave request:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('leave_requests')) {
      return {
        data: null,
        error: 'Leave request table is missing. Run leave_requests_setup.sql first, then try again.'
      };
    }
    return { data: null, error: error.message };
  }
};

export const submitPersonnelLeaveRequest = async (adminId, { startDate, endDate, reason = '' }) => {
  try {
    if (!adminId) {
      return { data: null, error: 'Missing personnel id.' };
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

    const { data, error } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .insert({
        personnel_id: adminId,
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
        status: 'pending'
      })
      .select('request_id, personnel_id, start_date, end_date, reason, status, created_at, updated_at')
      .single();

    if (error) throw error;

    emitDataChanged('leave_requests', { action: 'create', personnel_id: adminId });

    return { data, error: null };
  } catch (error) {
    console.error('Error submitting personnel leave request:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('leave_requests')) {
      return {
        data: null,
        error: 'Leave request table is missing. Run leave_requests_setup.sql first, then try again.'
      };
    }
    return { data: null, error: error.message };
  }
};

export const getPendingLeaveRequests = async () => {
  try {
    const { data, error } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .select('request_id, personnel_id, start_date, end_date, reason, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching pending leave requests:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('leave_requests')) {
      return {
        data: [],
        error: 'Leave request table is missing. Run leave_requests_setup.sql first, then try again.'
      };
    }
    return { data: [], error: error.message };
  }
};

export const getAllLeaveRequests = async () => {
  try {
    const [requestsRes, usersRes] = await Promise.all([
      supabase
        .from(LEAVE_REQUESTS_TABLE)
        .select('request_id, personnel_id, start_date, end_date, reason, status, approved_by, approved_at, rejection_reason, created_at, updated_at')
        .order('created_at', { ascending: false }),
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

      return {
        ...row,
        personnel_name: formatUserLabel(personnel),
        personnel_rank: personnel?.rank || '',
        personnel_email: personnel?.email || '',
        reviewed_by_name: reviewer ? formatUserLabel(reviewer) : null
      };
    });

    return { data: rows, error: null };
  } catch (error) {
    console.error('Error fetching leave request history:', error);
    if (error?.code === '42P01' || String(error?.message || '').toLowerCase().includes('leave_requests')) {
      return {
        data: [],
        error: 'Leave request table is missing. Run leave_requests_setup.sql first, then try again.'
      };
    }
    return { data: [], error: error.message };
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
  endDate
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
    const [configResult, personnelResult, assignmentResult, leaveRequestResult] = await Promise.all([
      getShiftScheduleConfig(),
      getAllUsers({ includePersonnelWorkspaceProfiles: true }),
      getShiftAssignmentsForPeriod({
        startDate: scheduleStartDate,
        endDate: scheduleEndDate
      }),
      supabase
        .from(LEAVE_REQUESTS_TABLE)
        .select('personnel_id, start_date, end_date, status')
        .lte('start_date', scheduleEndDate)
        .gte('end_date', scheduleStartDate)
        .eq('status', 'approved')
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

    if (leaveRequestResult.error) {
      return { data: null, error: leaveRequestResult.error.message };
    }

    const config = configResult.data;
    const personnelRows = (Array.isArray(personnelResult.data) ? personnelResult.data : [])
      .filter((personnel) => String(personnel.role || '').toLowerCase() === 'personnel');
    const assignments = Array.isArray(assignmentResult.data) ? assignmentResult.data : [];
    const approvedLeaveRequests = Array.isArray(leaveRequestResult.data) ? leaveRequestResult.data : [];
    const personnelById = new Map(personnelRows.map((personnel) => [personnel.admin_id, personnel]));

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

      const approvedLeavePersonnel = approvedLeaveRequests
        .filter((request) => isDateWithinInclusiveRange(isoDate, request.start_date, request.end_date))
        .map((request) => personnelById.get(request.personnel_id) || null)
        .filter(Boolean)
        .map((personnel) => ({
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel)
        }));

      const approvedLeaveIds = new Set(approvedLeavePersonnel.map((personnel) => personnel.admin_id));
      const legacyCurrentLeavePersonnel = personnelRows
        .filter((personnel) => !approvedLeaveIds.has(personnel.admin_id))
        .filter((personnel) => String(personnel.status || '').toLowerCase() === 'on leave')
        .filter((personnel) => isDateWithinInclusiveRange(isoDate, personnel.leave_start_date, personnel.leave_end_date))
        .map((personnel) => ({
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel)
        }));

      const onLeavePersonnel = [...approvedLeavePersonnel, ...legacyCurrentLeavePersonnel];

      const leavePersonnelIds = new Set(onLeavePersonnel.map((personnel) => personnel.admin_id));

      const onDutyPersonnel = assignments
        .filter((assignment) => shiftTypes.includes(String(assignment.shift_type || '').toUpperCase()))
        .filter((assignment) => isDateWithinInclusiveRange(isoDate, assignment.start_date, assignment.end_date))
        .map((assignment) => personnelById.get(assignment.personnel_id) || null)
        .filter((personnel) => personnel && !leavePersonnelIds.has(personnel.admin_id))
        .map((personnel) => ({
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel)
        }));

      const uniqueOnDutyPersonnel = Array.from(new Map(onDutyPersonnel.map((personnel) => [personnel.admin_id, personnel])).values());
      const uniqueOnLeavePersonnel = Array.from(new Map(onLeavePersonnel.map((personnel) => [personnel.admin_id, personnel])).values());

      let shift = 'Off Duty';
      if (hasA && hasB) {
        shift = 'Shift A & B';
      } else if (hasA) {
        shift = 'Shift A';
      } else if (hasB) {
        shift = 'Shift B';
      }

      rows.push({
        date: isoDate,
        dayLabel: targetDate.toLocaleDateString('en-US', { weekday: 'short' }),
        displayDate: targetDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        shift,
        onDutyPersonnel: uniqueOnDutyPersonnel,
        onLeavePersonnel: uniqueOnLeavePersonnel,
        onDutyCount: uniqueOnDutyPersonnel.length,
        onLeaveCount: uniqueOnLeavePersonnel.length
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

export const getPersonnelForDate = async (dateIso) => {
  try {
    if (!dateIso) {
      return { data: null, error: 'Missing date.' };
    }

    const [configResult, personnelResult, assignmentResult, attendanceResult, leaveRequestResult] = await Promise.all([
      getShiftScheduleConfig(),
      getAllUsers({ includePersonnelWorkspaceProfiles: true }),
      getShiftAssignmentsForPeriod({ startDate: dateIso, endDate: dateIso }),
      supabase
        .from('attendance_records')
        .select('personnel_id, time_in, time_out')
        .eq('attendance_date', dateIso),
      supabase
        .from(LEAVE_REQUESTS_TABLE)
        .select('personnel_id, start_date, end_date, status')
        .lte('start_date', dateIso)
        .gte('end_date', dateIso)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
    ]);

    if (configResult.error) return { data: null, error: configResult.error };
    if (personnelResult.error) return { data: null, error: personnelResult.error };
    if (assignmentResult.error) return { data: null, error: assignmentResult.error };
    if (attendanceResult.error) throw attendanceResult.error;
    if (leaveRequestResult.error) throw leaveRequestResult.error;

    const config = configResult.data;
    const personnelRows = (Array.isArray(personnelResult.data) ? personnelResult.data : [])
      .filter((personnel) => String(personnel.role || '').toLowerCase() === 'personnel');
    const personnelById = new Map(personnelRows.map((personnel) => [personnel.admin_id, personnel]));
    const assignments = Array.isArray(assignmentResult.data) ? assignmentResult.data : [];

    const attendanceByPersonnelId = new Map(
      (attendanceResult.data || []).map((row) => [row.personnel_id, row])
    );

    const leaveRequestByPersonnelId = new Map();
    (leaveRequestResult.data || []).forEach((row) => {
      if (!leaveRequestByPersonnelId.has(row.personnel_id)) {
        leaveRequestByPersonnelId.set(row.personnel_id, row);
      }
    });

    const shiftA = new Set(config?.shift_a_dates || []);
    const shiftB = new Set(config?.shift_b_dates || []);
    const hasA = shiftA.has(dateIso);
    const hasB = shiftB.has(dateIso);
    const shiftTypes = [hasA ? 'A' : null, hasB ? 'B' : null].filter(Boolean);

    const approvedLeavePersonnel = Array.from(leaveRequestByPersonnelId.entries())
      .map(([personnelId, request]) => {
        const personnel = personnelById.get(personnelId);
        if (!personnel) return null;

        return {
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel),
          rank: personnel.rank || '-',
          leave_start_date: request.start_date,
          leave_end_date: request.end_date,
          approval_status: 'Approved'
        };
      })
      .filter(Boolean);

    // Keep compatibility with leave dates created before leave request history
    // was introduced, while prioritizing approved historical request records.
    const approvedLeaveIds = new Set(approvedLeavePersonnel.map((personnel) => personnel.admin_id));
    const legacyCurrentLeavePersonnel = personnelRows
      .filter((personnel) => !approvedLeaveIds.has(personnel.admin_id))
      .filter((personnel) => String(personnel.status || '').toLowerCase() === 'on leave')
      .filter((personnel) => isDateWithinInclusiveRange(dateIso, personnel.leave_start_date, personnel.leave_end_date))
      .map((personnel) => ({
        admin_id: personnel.admin_id,
        name: formatPersonnelName(personnel),
        rank: personnel.rank || '-',
        leave_start_date: personnel.leave_start_date,
        leave_end_date: personnel.leave_end_date,
        approval_status: 'Approved'
      }));

    const onLeave = [...approvedLeavePersonnel, ...legacyCurrentLeavePersonnel];

    const onLeaveIds = new Set(onLeave.map((personnel) => personnel.admin_id));

    const onDutyPersonnelIds = new Set(
      assignments
        .filter((assignment) => shiftTypes.includes(String(assignment.shift_type || '').toUpperCase()))
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
      data: { date: dateIso, onDuty, onLeave },
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

    const [personnelResult, assignmentResult] = await Promise.all([
      getAllUsers({ includePersonnelWorkspaceProfiles: true }),
      getShiftAssignmentsForPeriod({ startDate: dateIso, endDate: dateIso })
    ]);

    if (personnelResult.error) return { data: null, error: personnelResult.error };
    if (assignmentResult.error) return { data: null, error: assignmentResult.error };

    const personnelRows = (Array.isArray(personnelResult.data) ? personnelResult.data : [])
      .filter((personnel) => String(personnel.role || '').toLowerCase() === 'personnel');
    const personnelById = new Map(personnelRows.map((personnel) => [personnel.admin_id, personnel]));
    const assignments = Array.isArray(assignmentResult.data) ? assignmentResult.data : [];

    const buildShiftList = (shiftType) => {
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
        }));
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
