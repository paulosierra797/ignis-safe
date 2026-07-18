import { supabase } from './supabaseClient';
import { getAllUsers, getShiftScheduleConfig } from './usersService';

const ADMIN_TABLE = 'admin';
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

export const getPersonnelLeaveRequest = async (adminId) => {
  try {
    if (!adminId) {
      return { data: null, error: 'Missing personnel id.' };
    }

    const { data: adminRow, error: adminError } = await supabase
      .from(ADMIN_TABLE)
      .select('admin_id, status, leave_start_date, leave_end_date')
      .eq('admin_id', adminId)
      .maybeSingle();

    if (adminError) throw adminError;

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

export const approveLeaveRequest = async ({ requestId, personnelId, startDate, endDate, approvedBy }) => {
  try {
    const { data: accountUpdate, error: accountError } = await supabase
      .from(ADMIN_TABLE)
      .update({
        status: 'On Leave',
        leave_start_date: startDate,
        leave_end_date: endDate
      })
      .eq('admin_id', personnelId)
      .select('admin_id, status, leave_start_date, leave_end_date')
      .maybeSingle();

    if (accountError) throw accountError;
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
    const [configResult, personnelResult, assignmentResult] = await Promise.all([
      getShiftScheduleConfig(),
      getAllUsers(),
      getShiftAssignmentsForPeriod({
       startDate: toIsoDate(start),
endDate: toIsoDate(end)
      })
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
    const personnelRows = Array.isArray(personnelResult.data) ? personnelResult.data : [];
    const assignments = Array.isArray(assignmentResult.data) ? assignmentResult.data : [];
    const personnelById = new Map(personnelRows.map((personnel) => [personnel.admin_id, personnel]));

    const shiftA = new Set(config?.shift_a_dates || []);
    const shiftB = new Set(config?.shift_b_dates || []);

    const rows = [];
   for (let offset = 0; offset < totalDays; offset += 1){
     const targetDate = new Date(start);
      targetDate.setDate(start.getDate() + offset);

      const isoDate = toIsoDate(targetDate);
      const hasA = shiftA.has(isoDate);
      const hasB = shiftB.has(isoDate);
      const shiftTypes = [hasA ? 'A' : null, hasB ? 'B' : null].filter(Boolean);

     

      const onLeavePersonnel = personnelRows
        .filter((personnel) => String(personnel.status || '').toLowerCase() === 'on leave')
        .filter((personnel) => isDateWithinInclusiveRange(isoDate, personnel.leave_start_date, personnel.leave_end_date))
        .map((personnel) => ({
          admin_id: personnel.admin_id,
          name: formatPersonnelName(personnel)
        }));

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

    return { data, error: null };
  } catch (error) {
    console.error('Error updating shift assignment:', error);
    return { data: null, error: error.message };
  }
};
