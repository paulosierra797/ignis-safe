import { supabase } from './supabaseClient';
import { getShiftScheduleConfig } from './usersService';

const ADMIN_TABLE = 'admin';
const LEAVE_REQUESTS_TABLE = 'leave_requests';

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export const getPersonnelShiftSchedule = async ({ days = 14 } = {}) => {
  try {
    const { data: config, error } = await getShiftScheduleConfig();
    if (error) {
      return { data: null, error };
    }

    const shiftA = new Set(config?.shift_a_dates || []);
    const shiftB = new Set(config?.shift_b_dates || []);
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const rows = [];
    for (let offset = 0; offset < days; offset += 1) {
      const targetDate = new Date(startDate);
      targetDate.setDate(startDate.getDate() + offset);

      const isoDate = toIsoDate(targetDate);
      const hasA = shiftA.has(isoDate);
      const hasB = shiftB.has(isoDate);

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
        shift
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
