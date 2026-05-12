import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Accounts.css';
import { signUp } from '../utils/authService';
import {
  getAllUsers,
  deleteUser,
  logAdminActivity,
  updateUser,
  getShiftScheduleConfig,
  saveShiftScheduleConfig
} from '../utils/usersService';
import {
  getPendingLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
  assignPersonnelToShift,
  getPersonnelShiftAssignments,
  getShiftAssignmentsForPeriod,
  removeShiftAssignment
} from '../utils/personnelOperationsService';
import { useUser } from '../context/UserContext';

const validPersonnelNamePattern = /^[A-Za-z\s]+$/;
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const contactNumberRegex = /^09\d{9}$/;
const ADD_PERSONNEL_TIMEOUT_MS = 25000;
const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Accounts() {
  const { currentUser } = useUser();
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('All Ranks');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isPersonnelShiftModalOpen, setIsPersonnelShiftModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLeaveSaving, setIsLeaveSaving] = useState(false);
  const [isShiftSaving, setIsShiftSaving] = useState(false);
  const [isPersonnelShiftSaving, setIsPersonnelShiftSaving] = useState(false);
  const [selectedShiftPersonnel, setSelectedShiftPersonnel] = useState(null);
  const [selectedShiftPersonnelIds, setSelectedShiftPersonnelIds] = useState([]);
  const [shiftAssignments, setShiftAssignments] = useState([]);
  const [selectedShiftForAssignment, setSelectedShiftForAssignment] = useState('A');
  const [personnelShiftMessage, setPersonnelShiftMessage] = useState({ type: '', text: '' });
  const [periodAssignments, setPeriodAssignments] = useState([]);
  const [pendingRequestsLoading, setPendingRequestsLoading] = useState(true);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState([]);
  const [pendingRequestMessage, setPendingRequestMessage] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
  const [pendingRejectRequest, setPendingRejectRequest] = useState(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState('');
  const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);
  const [isDeleteUserProcessing, setIsDeleteUserProcessing] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState({ type: '', text: '' });
  const [pendingConfirmAction, setPendingConfirmAction] = useState(null);
  const [isConfirmActionModalOpen, setIsConfirmActionModalOpen] = useState(false);
  const [isConfirmActionProcessing, setIsConfirmActionProcessing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [leaveMessage, setLeaveMessage] = useState({ type: '', text: '' });
  const [shiftMessage, setShiftMessage] = useState({ type: '', text: '' });
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [shiftSchedule, setShiftSchedule] = useState({ shift_a_dates: [], shift_b_dates: [] });
  const [shiftScheduleLoading, setShiftScheduleLoading] = useState(true);
  const [shiftSummaryMonth, setShiftSummaryMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [shiftSelection, setShiftSelection] = useState({ shift_a_dates: [], shift_b_dates: [] });
  const [activeShift, setActiveShift] = useState('A');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    role: '',
    rank: '',
    rank_custom: '',
    contact_number: '',
    password: ''
  });
  const [leaveFormData, setLeaveFormData] = useState({
    start_date: '',
    end_date: ''
  });
  const isPersonnelAccount = (account) => String(account?.role || '').toLowerCase() === 'personnel';
  const isOnLeave = (account) => String(account?.status || '').toLowerCase() === 'on leave';

  const toIsoDate = (date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fromIsoDate = (dateValue) => {
    const parts = String(dateValue || '').split('-');
    if (parts.length !== 3) {
      return null;
    }

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!year || !month || !day) {
      return null;
    }

    return new Date(year, month - 1, day);
  };

  const formatLeaveDate = (dateValue) => {
    if (!dateValue) {
      return '-';
    }

    try {
      return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateValue;
    }
  };

  const handleClearFilters = () => {
    setPersonnelSearch('');
    setRankFilter('All Ranks');
    setStatusFilter('All Status');
  };

  // Fetch accounts on component mount
  useEffect(() => {
    fetchAccounts();
    loadShiftSchedule();
    loadPendingLeaveRequests();
  }, []);

  const formatShiftDate = (dateValue) => {
    if (!dateValue) {
      return '-';
    }

    try {
      return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateValue;
    }
  };

  const formatShiftDateList = (dates = []) => {
    if (!dates.length) {
      return 'No dates set';
    }

    return dates.map((dateValue) => formatShiftDate(dateValue)).join(', ');
  };

  const formatPersonnelName = (account) => {
    if (!account) {
      return 'Personnel';
    }

    return [account.rank, account.first_name, account.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || account.email || 'Personnel';
  };

  const getPersonnelNameById = (personnelId) => {
    const match = accounts.find((account) => account.admin_id === personnelId);
    return formatPersonnelName(match);
  };

  const isDateWithinInclusiveRange = (dateValue, startDate, endDate) => {
    if (!dateValue || !startDate || !endDate) {
      return false;
    }

    return dateValue >= startDate && dateValue <= endDate;
  };

  const formatCalendarMonthLabel = (dateValue) => {
    try {
      return dateValue.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  const getCalendarCells = (monthDate) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const firstWeekday = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const dayOfMonth = index - firstWeekday + 1;
      if (dayOfMonth < 1 || dayOfMonth > daysInMonth) {
        return null;
      }
      return new Date(year, month, dayOfMonth);
    });
  };

  const shiftASet = new Set(shiftSelection.shift_a_dates || []);
  const shiftBSet = new Set(shiftSelection.shift_b_dates || []);

  const toggleCalendarDate = (date) => {
    const targetIsoDate = toIsoDate(date);

    setShiftSelection((prev) => {
      const activeKey = activeShift === 'A' ? 'shift_a_dates' : 'shift_b_dates';
      const otherKey = activeShift === 'A' ? 'shift_b_dates' : 'shift_a_dates';
      const activeDates = new Set(prev[activeKey] || []);
      const otherDates = new Set(prev[otherKey] || []);

      if (activeDates.has(targetIsoDate)) {
        activeDates.delete(targetIsoDate);
      } else {
        activeDates.add(targetIsoDate);
        otherDates.delete(targetIsoDate);
      }

      return {
        ...prev,
        [activeKey]: Array.from(activeDates).sort(),
        [otherKey]: Array.from(otherDates).sort()
      };
    });
  };

  const resetActiveShiftDates = () => {
    const activeKey = activeShift === 'A' ? 'shift_a_dates' : 'shift_b_dates';
    setShiftSelection((prev) => ({
      ...prev,
      [activeKey]: []
    }));
  };

  const handleCalendarMonthChange = (event) => {
    const nextMonth = Number(event.target.value);
    if (Number.isNaN(nextMonth)) {
      return;
    }

    setCalendarMonth((prev) => new Date(prev.getFullYear(), nextMonth, 1));
  };

  const handleCalendarYearChange = (event) => {
    const nextYear = Number(event.target.value);
    if (Number.isNaN(nextYear)) {
      return;
    }

    setCalendarMonth((prev) => new Date(nextYear, prev.getMonth(), 1));
  };

  const loadShiftSchedule = async () => {
    setShiftScheduleLoading(true);

    try {
      const { data, error } = await getShiftScheduleConfig();
      if (error) {
        console.warn('Unable to load shift schedule:', error);
        return;
      }

      setShiftSchedule({
        shift_a_dates: data?.shift_a_dates || [],
        shift_b_dates: data?.shift_b_dates || []
      });
    } finally {
      setShiftScheduleLoading(false);
    }
  };

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await getAllUsers();
      if (error) {
        console.error('Error fetching accounts:', error);
      } else {
        setAccounts(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadPendingLeaveRequests = async () => {
    setPendingRequestsLoading(true);
    setPendingRequestMessage('');

    const { data, error } = await getPendingLeaveRequests();
    if (error) {
      setPendingRequestMessage(error);
      setPendingLeaveRequests([]);
    } else {
      setPendingLeaveRequests(data || []);
    }

    setPendingRequestsLoading(false);
  };

  useEffect(() => {
    const handleDataChanged = (event) => {
      const scope = event?.detail?.scope || '';
      if (!scope || scope === 'users' || scope === 'profile' || scope === 'shift-schedule') {
        fetchAccounts();
        loadShiftSchedule();
        loadPendingLeaveRequests();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('ignis-safe:data-changed', handleDataChanged);
      return () => window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
    }

    return undefined;
  }, []);

  const handleApproveLeaveRequest = async (request) => {
    if (!request?.request_id || !request?.personnel_id) {
      return;
    }

    setPendingRequestMessage('');
    setProcessingRequestId(request.request_id);

    const { data, error } = await approveLeaveRequest({
      requestId: request.request_id,
      personnelId: request.personnel_id,
      startDate: request.start_date,
      endDate: request.end_date,
      approvedBy: currentUser?.admin_id || null
    });

    if (error) {
      setPendingRequestMessage(`Failed to approve leave request: ${error}`);
      setProcessingRequestId('');
      return;
    }

    setPendingLeaveRequests((prev) => prev.filter((row) => row.request_id !== request.request_id));
    setAccounts((prev) =>
      prev.map((account) =>
        account.admin_id === request.personnel_id
          ? {
              ...account,
              status: 'On Leave',
              leave_start_date: request.start_date,
              leave_end_date: request.end_date
            }
          : account
      )
    );

    const target = accounts.find((account) => account.admin_id === request.personnel_id);
    logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Leave Request Approved',
      actionType: 'edit',
      details: `Approved leave request for ${target?.first_name || ''} ${target?.last_name || ''} (${target?.email || request.personnel_id}) from ${request.start_date} to ${request.end_date}.`,
      metadata: {
        request_id: request.request_id,
        personnel_id: request.personnel_id,
        start_date: request.start_date,
        end_date: request.end_date,
        leave_request_status: data?.request?.status || 'approved'
      }
    }).catch((logError) => {
      console.warn('Unable to write admin activity log:', logError);
    });

    setProcessingRequestId('');
  };

  const handleRejectLeaveRequest = async (request) => {
    if (!request?.request_id || !request?.personnel_id) {
      return;
    }

    setPendingRejectRequest(request);
    setRejectReasonInput('');
    setIsRejectModalOpen(true);
  };

  const closeRejectModal = () => {
    if (processingRequestId) {
      return;
    }

    setIsRejectModalOpen(false);
    setPendingRejectRequest(null);
    setRejectReasonInput('');
  };

  const confirmRejectLeaveRequest = async () => {
    const request = pendingRejectRequest;
    if (!request?.request_id || !request?.personnel_id) {
      return;
    }

    const rejectionReason = rejectReasonInput.trim();

    setPendingRequestMessage('');
    setProcessingRequestId(request.request_id);

    const { data, error } = await rejectLeaveRequest({
      requestId: request.request_id,
      rejectedBy: currentUser?.admin_id || null,
      rejectionReason
    });

    if (error) {
      setPendingRequestMessage(`Failed to reject leave request: ${error}`);
      setProcessingRequestId('');
      return;
    }

    setPendingLeaveRequests((prev) => prev.filter((row) => row.request_id !== request.request_id));

    const target = accounts.find((account) => account.admin_id === request.personnel_id);
    logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Leave Request Rejected',
      actionType: 'edit',
      details: `Rejected leave request for ${target?.first_name || ''} ${target?.last_name || ''} (${target?.email || request.personnel_id}) from ${request.start_date} to ${request.end_date}.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
      metadata: {
        request_id: request.request_id,
        personnel_id: request.personnel_id,
        start_date: request.start_date,
        end_date: request.end_date,
        leave_request_status: data?.status || 'rejected',
        rejection_reason: rejectionReason || null
      }
    }).catch((logError) => {
      console.warn('Unable to write admin activity log:', logError);
    });

    setProcessingRequestId('');
    setIsRejectModalOpen(false);
    setPendingRejectRequest(null);
    setRejectReasonInput('');
  };

  const handleDeleteUser = async (adminId) => {
    if (!adminId) {
      setDeleteMessage({ type: 'error', text: 'Cannot delete this account because its ID is missing.' });
      return;
    }

    setDeleteMessage({ type: '', text: '' });
    setPendingDeleteUserId(adminId);
    setIsDeleteUserModalOpen(true);
  };

  const closeDeleteUserModal = () => {
    if (isDeleteUserProcessing) {
      return;
    }

    setIsDeleteUserModalOpen(false);
    setPendingDeleteUserId('');
    setDeleteMessage({ type: '', text: '' });
  };

  const confirmDeleteUser = async () => {
    const adminId = pendingDeleteUserId;
    if (!adminId) {
      return;
    }

    setIsDeleteUserProcessing(true);
    setDeleteMessage({ type: '', text: '' });

    try {
      const target = accounts.find((account) => account.admin_id === adminId);
      const { error, deletedCount } = await deleteUser(adminId);
      if (error) {
        setDeleteMessage({ type: 'error', text: `Error deleting user: ${error}` });
        return;
      }

      if (!deletedCount) {
        setDeleteMessage({ type: 'error', text: 'Delete request completed but no account was removed. Please check permissions/policies.' });
        return;
      }

      await logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Account Deleted',
        actionType: 'archive',
        details: `Deleted account ${target?.email || adminId}${target?.role ? ` (${target.role})` : ''}.`,
        metadata: {
          deleted_admin_id: adminId,
          deleted_email: target?.email || null,
          deleted_role: target?.role || null
        }
      });

      setDeleteMessage({ type: 'success', text: 'User deleted successfully.' });
      fetchAccounts();

      setTimeout(() => {
        setIsDeleteUserModalOpen(false);
        setPendingDeleteUserId('');
        setDeleteMessage({ type: '', text: '' });
      }, 900);
    } catch (err) {
      setDeleteMessage({ type: 'error', text: err.message || 'Error deleting user.' });
    } finally {
      setIsDeleteUserProcessing(false);
    }
  };

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    const fieldName = id.replace('personnel-', '').replace(/-/g, '_');
    const nextValue = fieldName === 'contact_number'
      ? String(value || '').replace(/\D/g, '').slice(0, 11)
      : value;

    setFormData(prev => ({
      ...prev,
      [fieldName]: nextValue
    }));
  };

  const handleAddPersonnel = async () => {
    // Validation
    const firstName = formData.first_name.trim();
    const lastName = formData.last_name.trim();
    const selectedRank = String(formData.rank || '').trim();
    const customRank = String(formData.rank_custom || '').trim();
    const finalRank = selectedRank === 'OTHER' ? customRank : selectedRank;
    const contactNumber = String(formData.contact_number || '').trim();
    const password = String(formData.password || '');

    if (!firstName || !lastName || !formData.email || !formData.role || !finalRank || !password) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }

    if (!validPersonnelNamePattern.test(firstName) || !validPersonnelNamePattern.test(lastName)) {
      setMessage({ type: 'error', text: 'First name and last name can only contain letters and spaces.' });
      return;
    }

    if (!strongPasswordRegex.test(password)) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters with uppercase, lowercase, number, and symbol.' });
      return;
    }

    if (contactNumber && !contactNumberRegex.test(contactNumber)) {
      setMessage({ type: 'error', text: 'Contact number must start with 09 and be exactly 11 digits.' });
      return;
    }

    // Check if email already exists
    try {
      const { data: existingUsers, error: fetchError } = await getAllUsers();
      if (!fetchError && (existingUsers || []).some((user) =>
        String(user.email || '').toLowerCase() === String(formData.email || '').toLowerCase()
      )) {
        setMessage({ type: 'error', text: 'This email address is already in use. Please use a different email.' });
        return;
      }
    } catch (error) {
      console.error('Error checking email uniqueness:', error);
      setMessage({ type: 'error', text: 'Error verifying email. Please try again.' });
      return;
    }

    setIsLoading(true);
    setMessage({ type: '', text: '' });

    const submittedForm = {
      first_name: firstName,
      last_name: lastName,
      email: formData.email,
      role: formData.role,
      rank: finalRank,
      contact_number: contactNumber
    };

    try {
      console.log('Attempting to add personnel with email verification...');

      // Use signUp to create auth user and send verification email
      const signupAttempt = signUp(formData.email, password, {
        first_name: firstName,
        last_name: lastName,
        role: formData.role,
        rank: finalRank,
        contact_number: contactNumber || null
      });

      const timeoutAttempt = new Promise((resolve) => {
        setTimeout(() => resolve({ timedOut: true }), ADD_PERSONNEL_TIMEOUT_MS);
      });

      const signupResponse = await Promise.race([signupAttempt, timeoutAttempt]);

      if (signupResponse?.timedOut) {
        console.warn('Add personnel request timed out in UI. Checking current admin accounts list...');
        const { data: latestAccounts, error: fetchError } = await getAllUsers();
        const accountExists = !fetchError && (latestAccounts || []).some((account) =>
          String(account.email || '').toLowerCase() === String(formData.email || '').toLowerCase()
        );

        if (accountExists) {
          setAccounts(latestAccounts || []);
          setMessage({
            type: 'success',
            text: 'Account was created successfully. The request took longer than expected, but the account is now in the list.'
          });

          logAdminActivity({
            actorId: currentUser?.admin_id || null,
            actorName: currentUser?.name || currentUser?.email || 'Admin User',
            action: 'Account Created',
            actionType: 'registration',
            details: `Created account for ${submittedForm.first_name} ${submittedForm.last_name} (${submittedForm.role}, ${submittedForm.rank}) - ${submittedForm.email}.`,
            metadata: {
              created_email: submittedForm.email,
              created_role: submittedForm.role,
              created_rank: submittedForm.rank
            }
          }).catch((logError) => {
            console.warn('Unable to write admin activity log:', logError);
          });

          setFormData({
            first_name: '',
            last_name: '',
            email: '',
            role: '',
            rank: '',
            rank_custom: '',
            contact_number: '',
            password: ''
          });

          setTimeout(() => {
            setIsAddModalOpen(false);
            setMessage({ type: '', text: '' });
          }, 2500);
          return;
        }

        setMessage({
          type: 'error',
          text: 'Request is taking too long and no admin record was found yet. Please retry once, then check Supabase admin table for this email.'
        });
        return;
      }

      const result = signupResponse;
      
      console.log('Sign up result:', result);

      if (result.error) {
        console.error('Error from signup:', result.error);
        if (String(result.error).toLowerCase().includes('already registered')) {
          setMessage({ type: 'error', text: 'This email is already registered in authentication. Use a different email or remove the existing auth user first.' });
          setIsLoading(false);
          return;
        }
        setMessage({ type: 'error', text: `Error: ${result.error}` });
        setIsLoading(false);
        return;
      }

      setMessage({ 
        type: 'success', 
        text: 'Personnel added successfully! OTP email sent to ' + formData.email + '. Ask the user to confirm at /confirm-signup.'
      });

      logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Account Created',
        actionType: 'registration',
        details: `Created account for ${submittedForm.first_name} ${submittedForm.last_name} (${submittedForm.role}, ${submittedForm.rank}) - ${submittedForm.email}.`,
        metadata: {
          created_email: submittedForm.email,
          created_role: submittedForm.role,
          created_rank: submittedForm.rank
        }
      }).catch((logError) => {
        console.warn('Unable to write admin activity log:', logError);
      });
      
      // Refresh accounts list
      fetchAccounts();
      
      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        role: '',
        rank: '',
        rank_custom: '',
        contact_number: '',
        password: ''
      });

      // Close modal after success
      setTimeout(() => {
        setIsAddModalOpen(false);
        setMessage({ type: '', text: '' });
      }, 2500);
    } catch (err) {
      console.error('Error adding personnel:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to add personnel. Please check console for details.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      role: '',
      rank: '',
      rank_custom: '',
      contact_number: '',
      password: ''
    });
    setMessage({ type: '', text: '' });
  };

  const handleAssignPersonnelToShift = async () => {
    if (!selectedShiftPersonnelIds.length) {
      setPersonnelShiftMessage({ type: 'error', text: 'Please select at least one personnel member.' });
      return;
    }

    // Get dates from the shift schedule
    const shiftDates = selectedShiftForAssignment === 'A' 
      ? shiftSchedule.shift_a_dates 
      : shiftSchedule.shift_b_dates;

    if (!shiftDates || shiftDates.length === 0) {
      setPersonnelShiftMessage({ 
        type: 'error', 
        text: `Shift ${selectedShiftForAssignment} has no dates set. Please set shift dates first.` 
      });
      return;
    }

    // Get the first and last dates
    const sortedDates = [...shiftDates].sort();
    const formStartDate = sortedDates[0];
    const formEndDate = sortedDates[sortedDates.length - 1];
    const selectedShiftType = String(selectedShiftForAssignment || '').toUpperCase();

    setIsPersonnelShiftSaving(true);
    setPersonnelShiftMessage({ type: '', text: '' });

    // Enforce one-shift-only rule for the active schedule period.
    const conflictingPersonnelIds = selectedShiftPersonnelIds.filter((personnelId) =>
      periodAssignments.some((assignment) =>
        assignment.personnel_id === personnelId
          && String(assignment.shift_type || '').toUpperCase() !== selectedShiftType
      )
    );

    const assignablePersonnelIds = selectedShiftPersonnelIds.filter(
      (personnelId) => !conflictingPersonnelIds.includes(personnelId)
    );

    if (!assignablePersonnelIds.length) {
      const conflictNames = conflictingPersonnelIds
        .map((personnelId) => getPersonnelNameById(personnelId))
        .join(', ');

      setPersonnelShiftMessage({
        type: 'error',
        text: `Cannot assign Shift ${selectedShiftType}. These personnel are already assigned to the other shift this period: ${conflictNames}.`
      });
      setIsPersonnelShiftSaving(false);
      return;
    }

    const assignmentResults = await Promise.all(
      assignablePersonnelIds.map(async (personnelId) => {
        const { error } = await assignPersonnelToShift({
          personnelId,
          shiftType: selectedShiftType,
          startDate: formStartDate,
          endDate: formEndDate,
          assignedBy: currentUser?.admin_id || null
        });

        return { personnelId, error };
      })
    );

    const failedAssignments = assignmentResults.filter((row) => row.error);
    const successfulAssignments = assignmentResults.filter((row) => !row.error);

    if (successfulAssignments.length) {
      const successfulPersonnelNames = successfulAssignments
        .map((row) => getPersonnelNameById(row.personnelId))
        .join(', ');

      logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Personnel Shift Assigned',
        actionType: 'edit',
        details: `Assigned ${successfulAssignments.length} personnel to Shift ${selectedShiftType}: ${successfulPersonnelNames}.`,
        metadata: {
          target_admin_ids: successfulAssignments.map((row) => row.personnelId),
          shift_type: selectedShiftType,
          start_date: formStartDate,
          end_date: formEndDate
        }
      }).catch((logError) => {
        console.warn('Unable to write admin activity log:', logError);
      });
    }

    await loadShiftAssignmentsForSchedule();

    if (selectedShiftPersonnel?.admin_id) {
      await loadPersonnelShiftAssignments(selectedShiftPersonnel.admin_id);
    }

    if (!failedAssignments.length) {
      if (conflictingPersonnelIds.length) {
        const conflictNames = conflictingPersonnelIds
          .map((personnelId) => getPersonnelNameById(personnelId))
          .join(', ');

        setPersonnelShiftMessage({
          type: 'error',
          text: `Shift assignment saved for ${successfulAssignments.length} personnel. Not assigned (already in opposite shift): ${conflictNames}.`
        });
      } else {
        setPersonnelShiftMessage({
          type: 'success',
          text: `Shift assignment saved for ${successfulAssignments.length} personnel.`
        });
      }
      setSelectedShiftPersonnelIds([]);
    } else {
      const missingTableError = failedAssignments.some((row) =>
        String(row.error || '').toLowerCase().includes('personnel_shift')
      );

      if (missingTableError) {
        setPersonnelShiftMessage({
          type: 'error',
          text: 'Personnel shift assignments table is missing. Run personnel_shift_assignments_setup.sql first.'
        });
      } else {
        const failedNames = failedAssignments
          .map((row) => getPersonnelNameById(row.personnelId))
          .join(', ');
        const conflictNames = conflictingPersonnelIds
          .map((personnelId) => getPersonnelNameById(personnelId))
          .join(', ');
        const firstFailureReason = failedAssignments[0]?.error || 'Unknown error';
        const conflictSuffix = conflictNames
          ? ` Opposite-shift blocked: ${conflictNames}.`
          : '';

        setPersonnelShiftMessage({
          type: 'error',
          text: successfulAssignments.length
            ? `Assigned ${successfulAssignments.length} personnel. Failed for: ${failedNames}. Reason: ${firstFailureReason}.${conflictSuffix}`
            : `Failed to assign selected personnel: ${failedNames}. Reason: ${firstFailureReason}.${conflictSuffix}`
        });
      }
    }

    setIsPersonnelShiftSaving(false);
  };

  const loadPersonnelShiftAssignments = async (personnelId) => {
    const { data, error } = await getPersonnelShiftAssignments(personnelId);
    if (!error) {
      setShiftAssignments(data || []);
    }
  };

  const handleRemoveShiftAssignment = async (assignmentId) => {
    if (!assignmentId) {
      return;
    }

    setPendingConfirmAction({
      action: 'remove-shift-assignment',
      payload: { assignmentId },
      title: 'Remove Shift Assignment',
      message: 'Are you sure you want to remove this shift assignment?',
      confirmLabel: 'Remove'
    });
    setIsConfirmActionModalOpen(true);
  };

  const executeRemoveShiftAssignment = async (assignmentId) => {
    const { error } = await removeShiftAssignment(assignmentId);
    if (error) {
      setPersonnelShiftMessage({ type: 'error', text: `Failed to remove assignment: ${error}` });
      return;
    }

    // Reload assignments
    if (selectedShiftPersonnel) {
      await loadPersonnelShiftAssignments(selectedShiftPersonnel.admin_id);
    }

    setPersonnelShiftMessage({ type: 'success', text: 'Shift assignment removed successfully.' });
  };

  const handleSelectPersonnelForShift = async (personnel) => {
    setSelectedShiftPersonnel(personnel);
    await loadPersonnelShiftAssignments(personnel.admin_id);
    setPersonnelShiftMessage({ type: '', text: '' });
  };

  const handleTogglePersonnelForShift = async (personnel, checked) => {
    if (!personnel?.admin_id) {
      return;
    }

    const currentIds = selectedShiftPersonnelIds;
    const nextIds = checked
      ? Array.from(new Set([...currentIds, personnel.admin_id]))
      : currentIds.filter((id) => id !== personnel.admin_id);

    setSelectedShiftPersonnelIds(nextIds);

    if (checked && !selectedShiftPersonnel) {
      await handleSelectPersonnelForShift(personnel);
      return;
    }

    if (!checked && selectedShiftPersonnel?.admin_id === personnel.admin_id) {
      const nextPreviewId = nextIds[0];
      const nextPreviewPersonnel = accounts.find((account) => account.admin_id === nextPreviewId) || null;

      if (nextPreviewPersonnel) {
        await handleSelectPersonnelForShift(nextPreviewPersonnel);
      } else {
        setSelectedShiftPersonnel(null);
        setShiftAssignments([]);
      }
    }
  };

  const openShiftModal = () => {
    const selectedShiftData = {
      shift_a_dates: [...(shiftSchedule.shift_a_dates || [])].sort(),
      shift_b_dates: [...(shiftSchedule.shift_b_dates || [])].sort()
    };

    const earliest = [
      ...(selectedShiftData.shift_a_dates || []),
      ...(selectedShiftData.shift_b_dates || [])
    ].sort()[0];

    const baseDate = fromIsoDate(earliest) || new Date();
    setCalendarMonth(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    setShiftSelection(selectedShiftData);
    setActiveShift('A');
    setShiftMessage({ type: '', text: '' });
    setIsShiftModalOpen(true);
  };

  const openPersonnelShiftModal = () => {
    setSelectedShiftPersonnel(null);
    setSelectedShiftPersonnelIds([]);
    setSelectedShiftForAssignment('A');
    setShiftAssignments([]);
    setPersonnelShiftMessage({ type: '', text: '' });
    setIsPersonnelShiftModalOpen(true);
    // load assignments for the configured shift schedule period so admin can see who is assigned
    loadShiftAssignmentsForSchedule().catch((err) => {
      console.warn('Unable to load period assignments:', err);
    });
  };

  const loadShiftAssignmentsForSchedule = async () => {
    // derive period from current shiftSchedule
    const allDates = [ ...(shiftSchedule.shift_a_dates || []), ...(shiftSchedule.shift_b_dates || []) ];
    if (!allDates.length) {
      setPeriodAssignments([]);
      return;
    }

    const sorted = [...new Set(allDates)].sort();
    const startDate = sorted[0];
    const endDate = sorted[sorted.length - 1];

    const { data, error } = await getShiftAssignmentsForPeriod({ startDate, endDate });
    if (error) {
      console.warn('Error loading shift assignments for period:', error);
      setPeriodAssignments([]);
      return;
    }

    setPeriodAssignments(Array.isArray(data) ? data : []);
  };

  const closeShiftModal = () => {
    if (isShiftSaving) {
      return;
    }

    setIsShiftModalOpen(false);
    setShiftMessage({ type: '', text: '' });
  };

  const closePersonnelShiftModal = () => {
    if (isPersonnelShiftSaving) {
      return;
    }

    setIsPersonnelShiftModalOpen(false);
    setPersonnelShiftMessage({ type: '', text: '' });
    setSelectedShiftPersonnel(null);
    setSelectedShiftPersonnelIds([]);
  };

  const handleSaveShiftSchedule = async () => {
    setShiftMessage({ type: '', text: '' });

    const shiftADates = [...(shiftSelection.shift_a_dates || [])].sort();
    const shiftBDates = [...(shiftSelection.shift_b_dates || [])].sort();

    if (!shiftADates.length || !shiftBDates.length) {
      setShiftMessage({
        type: 'error',
        text: 'Please select at least one duty date for both Shift A and Shift B.'
      });
      return;
    }

    setIsShiftSaving(true);

    const payload = {
      shift_a_dates: shiftADates,
      shift_b_dates: shiftBDates
    };

    const { error } = await saveShiftScheduleConfig(payload, currentUser?.admin_id || null);
    if (error) {
      if (String(error).toLowerCase().includes('shift_schedule')) {
        setShiftMessage({
          type: 'error',
          text: 'Shift schedule table is missing. Run shift_schedule_setup.sql first, then try again.'
        });
      } else {
        setShiftMessage({ type: 'error', text: `Failed to save shift schedule: ${error}` });
      }
      setIsShiftSaving(false);
      return;
    }

    setShiftSchedule(payload);

    logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Shift Schedule Updated',
      actionType: 'edit',
      details: `Updated shift schedule. Shift A dates: ${payload.shift_a_dates.join(', ')}. Shift B dates: ${payload.shift_b_dates.join(', ')}.`,
      metadata: {
        shift_a_dates: payload.shift_a_dates,
        shift_b_dates: payload.shift_b_dates
      }
    }).catch((logError) => {
      console.warn('Unable to write admin activity log:', logError);
    });

    setShiftMessage({ type: 'success', text: 'Shift schedule saved successfully.' });
    setIsShiftSaving(false);

    setTimeout(() => {
      closeShiftModal();
    }, 900);
  };

  const openLeaveModal = (account) => {
    setSelectedAccount(account);
    setLeaveFormData({
      start_date: account.leave_start_date || '',
      end_date: account.leave_end_date || ''
    });
    setLeaveMessage({ type: '', text: '' });
    setIsLeaveModalOpen(true);
  };

  const closeLeaveModal = () => {
    if (isLeaveSaving) {
      return;
    }

    setIsLeaveModalOpen(false);
    setSelectedAccount(null);
    setLeaveFormData({ start_date: '', end_date: '' });
    setLeaveMessage({ type: '', text: '' });
  };

  const handleLeaveInputChange = (event) => {
    const { id, value } = event.target;
    const field = id === 'leave-start-date' ? 'start_date' : 'end_date';
    setLeaveFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveLeaveDate = async () => {
    if (!selectedAccount?.admin_id) {
      setLeaveMessage({ type: 'error', text: 'No personnel account selected.' });
      return;
    }

    if (!leaveFormData.start_date || !leaveFormData.end_date) {
      setLeaveMessage({ type: 'error', text: 'Please provide both leave start and end dates.' });
      return;
    }

    if (leaveFormData.end_date < leaveFormData.start_date) {
      setLeaveMessage({ type: 'error', text: 'Leave end date must be on or after the start date.' });
      return;
    }

    setIsLeaveSaving(true);
    setLeaveMessage({ type: '', text: '' });

    const updates = {
      status: 'On Leave',
      leave_start_date: leaveFormData.start_date,
      leave_end_date: leaveFormData.end_date
    };

    const { error } = await updateUser(selectedAccount.admin_id, updates);

    if (error) {
      if (String(error).toLowerCase().includes('leave_start_date') || String(error).toLowerCase().includes('leave_end_date')) {
        setLeaveMessage({
          type: 'error',
          text: 'Leave columns are missing in the database. Run leave_dates_setup.sql first, then try again.'
        });
      } else {
        setLeaveMessage({ type: 'error', text: `Failed to save leave dates: ${error}` });
      }
      setIsLeaveSaving(false);
      return;
    }

    setAccounts((prev) =>
      prev.map((account) =>
        account.admin_id === selectedAccount.admin_id
          ? {
              ...account,
              ...updates
            }
          : account
      )
    );

    logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Personnel Leave Date Updated',
      actionType: 'edit',
      details: `Set leave period for ${selectedAccount.first_name || ''} ${selectedAccount.last_name || ''} (${selectedAccount.email || selectedAccount.admin_id}) from ${leaveFormData.start_date} to ${leaveFormData.end_date}.`,
      metadata: {
        target_admin_id: selectedAccount.admin_id,
        leave_start_date: leaveFormData.start_date,
        leave_end_date: leaveFormData.end_date
      }
    }).catch((logError) => {
      console.warn('Unable to write admin activity log:', logError);
    });

    setLeaveMessage({ type: 'success', text: 'Leave dates saved successfully.' });
    setIsLeaveSaving(false);

    setTimeout(() => {
      closeLeaveModal();
    }, 900);
  };

  const handleClearLeaveDate = async (account) => {
    if (!account?.admin_id) {
      return;
    }

    setPendingConfirmAction({
      action: 'clear-leave-date',
      payload: { account },
      title: 'Clear Leave Dates',
      message: `Clear leave dates for ${account.first_name || ''} ${account.last_name || ''}?`,
      confirmLabel: 'Clear Leave'
    });
    setIsConfirmActionModalOpen(true);
  };

  const executeClearLeaveDate = async (account) => {
    const updates = {
      status: 'Active',
      leave_start_date: null,
      leave_end_date: null
    };

    const { error } = await updateUser(account.admin_id, updates);
    if (error) {
      alert(`Failed to clear leave dates: ${error}`);
      return;
    }

    setAccounts((prev) =>
      prev.map((row) =>
        row.admin_id === account.admin_id
          ? {
              ...row,
              ...updates
            }
          : row
      )
    );

    logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Personnel Leave Date Cleared',
      actionType: 'edit',
      details: `Cleared leave period for ${account.first_name || ''} ${account.last_name || ''} (${account.email || account.admin_id}).`,
      metadata: {
        target_admin_id: account.admin_id
      }
    }).catch((logError) => {
      console.warn('Unable to write admin activity log:', logError);
    });
  };

  const closeConfirmActionModal = () => {
    if (isConfirmActionProcessing) {
      return;
    }

    setIsConfirmActionModalOpen(false);
    setPendingConfirmAction(null);
  };

  const confirmActionModal = async () => {
    if (!pendingConfirmAction?.action) {
      return;
    }

    setIsConfirmActionProcessing(true);

    if (pendingConfirmAction.action === 'remove-shift-assignment') {
      await executeRemoveShiftAssignment(pendingConfirmAction.payload.assignmentId);
    }

    if (pendingConfirmAction.action === 'clear-leave-date') {
      await executeClearLeaveDate(pendingConfirmAction.payload.account);
    }

    setIsConfirmActionProcessing(false);
    setIsConfirmActionModalOpen(false);
    setPendingConfirmAction(null);
  };

  const filteredAccounts = accounts.filter((account) => {
    const fullName = `${account.first_name || ''} ${account.last_name || ''}`.toLowerCase().trim();
    const matchSearch = fullName.includes(personnelSearch.toLowerCase());
    const matchRank = rankFilter === 'All Ranks' || account.rank === rankFilter;
    const matchStatus = statusFilter === 'All Status' || account.status === statusFilter;
    return matchSearch && matchRank && matchStatus;
  });

  const shiftScheduleASet = new Set(shiftSchedule.shift_a_dates || []);
  const shiftScheduleBSet = new Set(shiftSchedule.shift_b_dates || []);
  const shiftSummaryCalendarCells = getCalendarCells(shiftSummaryMonth);
  const shiftSummaryMonthLabel = formatCalendarMonthLabel(shiftSummaryMonth);

  const handleShiftSummaryMonthShift = (offset) => {
    setShiftSummaryMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  return (
    <div className="accounts-container">
      <Sidebar />

      <div className="accounts-main">
        <PageHeader
          title="Accounts"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="accounts-header">
          <h2>Personnel Accounts</h2>
          <div className="accounts-header-actions">
            <button className="shift-schedule-btn" onClick={openShiftModal}>
              Set Shift Dates
            </button>
            <button className="shift-schedule-btn" onClick={openPersonnelShiftModal}>
              Assign Personnel
            </button>
            <button className="add-personnel-btn" onClick={() => setIsAddModalOpen(true)}>
              Add Personnel
            </button>
          </div>
        </div>

        <div className="shift-summary-card">
          <div className="shift-summary-calendar-header">
            <button
              className="shift-calendar-nav"
              type="button"
              onClick={() => handleShiftSummaryMonthShift(-1)}
              aria-label="Previous month"
            >
              {'<'}
            </button>
            <div className="shift-summary-calendar-title">
              {shiftSummaryMonthLabel}
            </div>
            <button
              className="shift-calendar-nav"
              type="button"
              onClick={() => handleShiftSummaryMonthShift(1)}
              aria-label="Next month"
            >
              {'>'}
            </button>
          </div>

          <div className="shift-summary-calendar-legend">
            <span><i className="legend-dot legend-shift-a" /> Shift A</span>
            <span><i className="legend-dot legend-shift-b" /> Shift B</span>
            <span><i className="legend-dot legend-active" /> Both</span>
          </div>

          <div className="shift-summary-calendar-grid shift-calendar-weekdays">
            {CALENDAR_WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="shift-summary-calendar-grid shift-calendar-days">
            {shiftScheduleLoading ? (
              <div className="shift-summary-calendar-loading">Loading shift schedule...</div>
            ) : (
              shiftSummaryCalendarCells.map((dayDate, index) => {
                if (!dayDate) {
                  return <span key={`shift-empty-${index}`} className="shift-calendar-empty" />;
                }

                const isoDate = toIsoDate(dayDate);
                const selectedA = shiftScheduleASet.has(isoDate);
                const selectedB = shiftScheduleBSet.has(isoDate);
                const leavePersonnel = accounts
                  .filter((account) => isPersonnelAccount(account))
                  .filter((account) => isOnLeave(account))
                  .filter((account) => isDateWithinInclusiveRange(
                    isoDate,
                    account.leave_start_date,
                    account.leave_end_date
                  ))
                  .map((account) => ({
                    admin_id: account.admin_id,
                    name: formatPersonnelName(account)
                  }));

                const uniqueLeavePersonnel = Array.from(
                  new Map(leavePersonnel.map((personnel) => [personnel.admin_id, personnel])).values()
                );

                return (
                  <div
                    key={isoDate}
                    className={`shift-summary-day ${selectedA ? 'shift-a' : ''} ${selectedB ? 'shift-b' : ''} ${selectedA && selectedB ? 'both' : ''}`}
                  >
                    <span className="shift-summary-day-number">{dayDate.getDate()}</span>
                    <div className="shift-summary-day-badges">
                      {selectedA && <span className="shift-summary-day-badge shift-summary-day-badge-a">A</span>}
                      {selectedB && <span className="shift-summary-day-badge shift-summary-day-badge-b">B</span>}
                      {!selectedA && !selectedB && <span className="shift-summary-day-empty">Off</span>}
                    </div>

                    <div className="shift-summary-day-leave">
                      <span className="shift-summary-day-leave-label">On Leave</span>
                      <div className="shift-summary-day-leave-list">
                        {uniqueLeavePersonnel.length ? (
                          uniqueLeavePersonnel.map((personnel) => (
                            <span key={personnel.admin_id} className="shift-summary-leave-pill">
                              {personnel.name}
                            </span>
                          ))
                        ) : (
                          <span className="shift-summary-day-leave-empty">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="leave-approval-card">
          <div className="leave-approval-header">
            <h3>Pending Leave Requests</h3>
            <span>{pendingLeaveRequests.length} pending</span>
          </div>

          {pendingRequestMessage && (
            <div className="leave-approval-message">{pendingRequestMessage}</div>
          )}

          {pendingRequestsLoading ? (
            <p className="leave-approval-empty">Loading leave requests...</p>
          ) : pendingLeaveRequests.length === 0 ? (
            <p className="leave-approval-empty">No pending leave requests.</p>
          ) : (
            <div className="leave-approval-table-wrap">
              <table className="leave-approval-table">
                <thead>
                  <tr>
                    <th>Personnel</th>
                    <th>Email</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Requested</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLeaveRequests.map((request) => {
                    const target = accounts.find((account) => account.admin_id === request.personnel_id);
                    const isProcessing = processingRequestId === request.request_id;

                    return (
                      <tr key={request.request_id}>
                        <td>{target ? `${target.first_name || ''} ${target.last_name || ''}`.trim() : request.personnel_id}</td>
                        <td>{target?.email || '-'}</td>
                        <td>{formatLeaveDate(request.start_date)}</td>
                        <td>{formatLeaveDate(request.end_date)}</td>
                        <td>{new Date(request.created_at).toLocaleDateString('en-US')}</td>
                        <td>
                          <button
                            className="leave-approve-btn"
                            type="button"
                            onClick={() => handleApproveLeaveRequest(request)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            className="leave-reject-btn"
                            type="button"
                            onClick={() => handleRejectLeaveRequest(request)}
                            disabled={isProcessing}
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="accounts-filters">
          <div className="accounts-filter-item">
            <label>Search by Name</label>
            <input
              type="text"
              placeholder="Type a user name"
              value={personnelSearch}
              onChange={(event) => setPersonnelSearch(event.target.value)}
            />
          </div>

          <div className="accounts-filter-item">
            <label>Filter by Rank</label>
            <select
              value={rankFilter}
              onChange={(event) => setRankFilter(event.target.value)}
            >
              <option>All Ranks</option>
              <option>FDIR</option>
              <option>DFDIR</option>
              <option>SSUPT</option>
              <option>SUPT</option>
              <option>CINSP</option>
              <option>SINSP</option>
              <option>INSP</option>
              <option>SFO4</option>
              <option>SFO3</option>
              <option>SFO2</option>
              <option>SFO1</option>
              <option>FO3</option>
              <option>FO2</option>
              <option>FO1</option>
            </select>
          </div>

          <div className="accounts-filter-item">
            <label>Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
               <option>On Leave</option>
             
              <option>Pending Activation</option>
      
              <option>Expired</option>
            </select>
          </div>

          <button className="accounts-clear-btn" onClick={handleClearFilters}>
            CLEAR FILTERS
          </button>
        </div>

        <div className="accounts-table-card">
          {loadingAccounts ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>Loading accounts...</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>No accounts found.</p>
            </div>
          ) : (
            <table className="accounts-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Rank</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account, index) => (
                  <tr key={account.admin_id || account.id}>
                    <td>{index + 1}.</td>
                    <td>{account.first_name} {account.last_name}</td>
                    <td>{account.email}</td>
                    <td>{account.rank}</td>
                    <td>{account.role}</td>
                    <td>
                      <span
                        className={`status-pill ${account.status
                          .toLowerCase()
                          .replace(/\s+/g, '-')}`}
                      >
                        {account.status.toUpperCase()}
                      </span>
                      {isOnLeave(account) && (
                        <p className="leave-date-meta">
                          {`Leave: ${formatLeaveDate(account.leave_start_date)} to ${formatLeaveDate(account.leave_end_date)}`}
                        </p>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons">
                        {isPersonnelAccount(account) && (
                          <button
                            className="leave-btn"
                            onClick={() => openLeaveModal(account)}
                          >
                            Set Leave
                          </button>
                        )}
                        {isPersonnelAccount(account) && isOnLeave(account) && (
                          <button
                            className="leave-clear-btn"
                            onClick={() => handleClearLeaveDate(account)}
                          >
                            Clear Leave
                          </button>
                        )}
                        <button 
                          className="delete-btn"
                          onClick={() => handleDeleteUser(account.admin_id || account.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {isAddModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal">
              <div className="accounts-modal-header">
                <h3>Add New Personnel Account</h3>
                <button
                  className="accounts-modal-close"
                  onClick={handleCloseModal}
                  aria-label="Close modal"
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <h4>Personnel Information</h4>
                
                <div className="accounts-modal-grid">
                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-first-name">First Name</label>
                    <input
                      id="personnel-first-name"
                      type="text"
                      placeholder="Michael"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      pattern="[A-Za-z\\s]+"
                      title="Use letters and spaces only"
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-last-name">Last Name</label>
                    <input
                      id="personnel-last-name"
                      type="text"
                      placeholder="Escano"
                      value={formData.last_name}
                      onChange={handleInputChange}
                      pattern="[A-Za-z\\s]+"
                      title="Use letters and spaces only"
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-email">Email Address</label>
                    <input
                      id="personnel-email"
                      type="email"
                      placeholder="youremail@gmail.com"
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-role">Role</label>
                    <select 
                      id="personnel-role" 
                      value={formData.role}
                      onChange={handleInputChange}
                    >
                      <option value="">Select a role...</option>
                      <option value="admin">Admin</option>
                      <option value="personnel">Personnel</option>
                     
                    </select>
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-rank">Rank Designation</label>
                    <select 
                      id="personnel-rank"
                      value={formData.rank}
                      onChange={handleInputChange}
                    >
                      <option value="">Select a rank...</option>
                      <option value="FDIR">FDIR - Fire Director</option>
                      <option value="DFDIR">DFDIR - Deputy Fire Director</option>
                      <option value="SSUPT">SSUPT - Senior Fire Superintendent</option>
                      <option value="SUPT">SUPT - Fire Superintendent</option>
                      <option value="CINSP">CINSP - Fire Chief Inspector</option>
                      <option value="SINSP">SINSP - Fire Senior Inspector</option>
                      <option value="INSP">INSP - Fire Inspector</option>
                      <option value="SFO4">SFO4 - Senior Fire Officer IV</option>
                      <option value="SFO3">SFO3 - Senior Fire Officer III</option>
                      <option value="SFO2">SFO2 - Senior Fire Officer II</option>
                      <option value="SFO1">SFO1 - Senior Fire Officer I</option>
                      <option value="FO3">FO3 - Fire Officer III</option>
                      <option value="FO2">FO2 - Fire Officer II</option>
                      <option value="FO1">FO1 - Fire Officer I</option>
                      <option value="OTHER">Other (Specify)</option>
                    </select>
                  </div>
                  {formData.rank === 'OTHER' && (
                    <div className="accounts-modal-field">
                      <label htmlFor="personnel-rank-custom">Custom Rank</label>
                      <input
                        id="personnel-rank-custom"
                        type="text"
                        placeholder="Enter custom rank"
                        value={formData.rank_custom}
                        onChange={handleInputChange}
                      />
                    </div>
                  )}
                   <div className="accounts-modal-field">
                    <label htmlFor="personnel-contact-number">Contact number</label>
                    <input
                      id="personnel-contact-number"
                      type="text"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="09XXXXXXXXX"
                      value={formData.contact_number}
                      onChange={handleInputChange}
                      maxLength={11}
                      pattern="^09[0-9]{9}$"
                      title="Must start with 09 and be exactly 11 digits"
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-password">Temporary Password</label>
                    <input
                      id="personnel-password"
                      type="password"
                      placeholder="Set initial password"
                      value={formData.password}
                      onChange={handleInputChange}
                    />
                  </div>

                </div>

                {message.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${message.type}`}>
                    {message.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button 
                  className="accounts-modal-add"
                  onClick={handleAddPersonnel}
                  disabled={isLoading}
                >
                  {isLoading ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLeaveModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-leave-modal">
              <div className="accounts-modal-header">
                <h3>Set Personnel Leave Dates</h3>
                <button
                  className="accounts-modal-close"
                  onClick={closeLeaveModal}
                  aria-label="Close leave date modal"
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <h4>
                  {selectedAccount
                    ? `${selectedAccount.first_name || ''} ${selectedAccount.last_name || ''}`.trim() || selectedAccount.email
                    : 'Personnel'}
                </h4>

                <div className="accounts-modal-grid">
                  <div className="accounts-modal-field">
                    <label htmlFor="leave-start-date">Leave Start Date</label>
                    <input
                      id="leave-start-date"
                      type="date"
                      value={leaveFormData.start_date}
                      onChange={handleLeaveInputChange}
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="leave-end-date">Leave End Date</label>
                    <input
                      id="leave-end-date"
                      type="date"
                      value={leaveFormData.end_date}
                      min={leaveFormData.start_date || undefined}
                      onChange={handleLeaveInputChange}
                    />
                  </div>
                </div>

                {leaveMessage.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${leaveMessage.type}`}>
                    {leaveMessage.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={closeLeaveModal} disabled={isLeaveSaving}>
                  Cancel
                </button>
                <button
                  className="accounts-modal-add"
                  onClick={handleSaveLeaveDate}
                  disabled={isLeaveSaving}
                >
                  {isLeaveSaving ? 'Saving...' : 'Save Leave Dates'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isShiftModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-shift-modal">
              <div className="accounts-modal-header">
                <h3>Set Shift Duty Dates</h3>
                <button
                  className="accounts-modal-close"
                  onClick={closeShiftModal}
                  aria-label="Close shift schedule modal"
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <h4>Select a shift, then click calendar dates to toggle duty days.</h4>

                <div className="shift-picker-controls">
                  <div className="shift-picker-tabs" role="tablist" aria-label="Shift selector">
                    <button
                      className={`shift-picker-tab ${activeShift === 'A' ? 'active' : ''}`}
                      onClick={() => setActiveShift('A')}
                      type="button"
                    >
                      Shift A
                    </button>
                    <button
                      className={`shift-picker-tab ${activeShift === 'B' ? 'active' : ''}`}
                      onClick={() => setActiveShift('B')}
                      type="button"
                    >
                      Shift B
                    </button>
                  </div>

                  <button className="shift-picker-clear" type="button" onClick={resetActiveShiftDates}>
                    Clear {activeShift}
                  </button>
                </div>

                <div className="shift-calendar-header">
                  <button
                    className="shift-calendar-nav"
                    type="button"
                    onClick={() =>
                      setCalendarMonth(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                      )
                    }
                  >
                    {'<'}
                  </button>
                  <div className="shift-calendar-jump">
                    <select
                      aria-label="Select calendar month"
                      value={calendarMonth.getMonth()}
                      onChange={handleCalendarMonthChange}
                    >
                      {Array.from({ length: 12 }, (_, monthIndex) => (
                        <option key={monthIndex} value={monthIndex}>
                          {new Date(2026, monthIndex, 1).toLocaleDateString('en-US', {
                            month: 'long'
                          })}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Select calendar year"
                      value={calendarMonth.getFullYear()}
                      onChange={handleCalendarYearChange}
                    >
                      {Array.from({ length: 21 }, (_, index) => {
                        const year = new Date().getFullYear() - 10 + index;
                        return (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <button
                    className="shift-calendar-nav"
                    type="button"
                    onClick={() =>
                      setCalendarMonth(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                      )
                    }
                  >
                    {'>'}
                  </button>
                </div>

                <div className="shift-calendar-grid shift-calendar-weekdays">
                  {CALENDAR_WEEKDAYS.map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>

                <div className="shift-calendar-grid shift-calendar-days">
                  {getCalendarCells(calendarMonth).map((dayDate, index) => {
                    if (!dayDate) {
                      return <span key={`empty-${index}`} className="shift-calendar-empty" />;
                    }

                    const isoDate = toIsoDate(dayDate);
                    const selectedA = shiftASet.has(isoDate);
                    const selectedB = shiftBSet.has(isoDate);
                    const selectedActive =
                      (activeShift === 'A' && selectedA) || (activeShift === 'B' && selectedB);

                    return (
                      <button
                        key={isoDate}
                        type="button"
                        className={`shift-calendar-day ${selectedA ? 'shift-a' : ''} ${selectedB ? 'shift-b' : ''} ${selectedActive ? 'active' : ''}`}
                        onClick={() => toggleCalendarDate(dayDate)}
                        title={`${isoDate}${selectedA ? ' - Shift A' : ''}${selectedB ? ' - Shift B' : ''}`}
                      >
                        {dayDate.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="shift-selection-summary">
                  <p><strong>Shift A:</strong> {formatShiftDateList(shiftSelection.shift_a_dates)}</p>
                  <p><strong>Shift B:</strong> {formatShiftDateList(shiftSelection.shift_b_dates)}</p>
                </div>

                <div className="shift-selection-legend">
                  <span><i className="legend-dot legend-shift-a" /> Shift A date</span>
                  <span><i className="legend-dot legend-shift-b" /> Shift B date</span>
                  <span><i className="legend-dot legend-active" /> Active shift selection</span>
                </div>

                {shiftMessage.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${shiftMessage.type}`}>
                    {shiftMessage.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={closeShiftModal} disabled={isShiftSaving}>
                  Cancel
                </button>
                <button
                  className="accounts-modal-add"
                  onClick={handleSaveShiftSchedule}
                  disabled={isShiftSaving}
                >
                  {isShiftSaving ? 'Saving...' : 'Save Shift Dates'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isPersonnelShiftModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-shift-modal">
              <div className="accounts-modal-header">
                <h3>Assign Personnel to Shifts</h3>
                <button
                  className="accounts-modal-close"
                  onClick={closePersonnelShiftModal}
                  aria-label="Close personnel shift assignment modal"
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <div className="shift-personnel-selector">
                  <label>
                    <strong>Select Personnel (multiple allowed):</strong>
                  </label>

                  <div className="shift-personnel-checkbox-list">
                    {accounts
                      .filter((account) => isPersonnelAccount(account))
                      .map((account) => (
                        <label key={account.admin_id} className="shift-personnel-checkbox-item">
                          <input
                            type="checkbox"
                            checked={selectedShiftPersonnelIds.includes(account.admin_id)}
                            onChange={(event) => {
                              handleTogglePersonnelForShift(account, event.target.checked);
                            }}
                          />
                          <span>
                            {account.first_name} {account.last_name} ({account.rank || 'N/A'})
                          </span>
                        </label>
                      ))}
                  </div>

                  <div className="shift-personnel-selection-count">
                    {selectedShiftPersonnelIds.length} selected
                  </div>
                </div>

                <div className="shift-overview-grid">
                  <div className="shift-overview-col">
                    <div className="shift-overview-header">Shift A</div>
                    <div className="shift-overview-list">
                      {(() => {
                        const ids = Array.from(new Set(periodAssignments
                          .filter(a => String(a.shift_type || '').toUpperCase() === 'A')
                          .map(a => a.personnel_id)
                        ));
                        return ids.length ? (
                          <>
                            <div className="shift-overview-count">{ids.length} personnel assigned</div>
                            {ids.map((personnelId) => (
                              <div key={personnelId} className="shift-overview-item">
                                {getPersonnelNameById(personnelId)}
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="shift-overview-empty">No personnel assigned</div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="shift-overview-col">
                    <div className="shift-overview-header">Shift B</div>
                    <div className="shift-overview-list">
                      {(() => {
                        const ids = Array.from(new Set(periodAssignments
                          .filter(a => String(a.shift_type || '').toUpperCase() === 'B')
                          .map(a => a.personnel_id)
                        ));
                        return ids.length ? (
                          <>
                            <div className="shift-overview-count">{ids.length} personnel assigned</div>
                            {ids.map((personnelId) => (
                              <div key={personnelId} className="shift-overview-item">
                                {getPersonnelNameById(personnelId)}
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="shift-overview-empty">No personnel assigned</div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {selectedShiftPersonnelIds.length > 0 && (
                  <div className="shift-assignment-form">
                    <h4>Assign {selectedShiftPersonnelIds.length} selected personnel to:</h4>

                    <div className="shift-assignment-simple">
                      <div className="shift-assignment-shift">
                        <label htmlFor="shift-assignment-type">Shift:</label>
                        <select
                          id="shift-assignment-type"
                          value={selectedShiftForAssignment}
                          onChange={(e) => setSelectedShiftForAssignment(e.target.value)}
                        >
                          <option value="A">Shift A</option>
                          <option value="B">Shift B</option>
                        </select>
                      </div>

                      <div className="shift-assignment-shift">
                        <label htmlFor="shift-assignment-preview">Preview assignments for:</label>
                        <select
                          id="shift-assignment-preview"
                          value={selectedShiftPersonnel?.admin_id || ''}
                          onChange={(event) => {
                            const selectedId = event.target.value;
                            const selectedPersonnel = accounts.find((acc) => acc.admin_id === selectedId);
                            if (selectedPersonnel) {
                              handleSelectPersonnelForShift(selectedPersonnel);
                            }
                          }}
                        >
                          {selectedShiftPersonnelIds.map((personnelId) => {
                            const personnel = accounts.find((account) => account.admin_id === personnelId);
                            if (!personnel) {
                              return null;
                            }

                            return (
                              <option key={personnelId} value={personnelId}>
                                {personnel.first_name} {personnel.last_name}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    <button
                      className="shift-assign-btn"
                      onClick={handleAssignPersonnelToShift}
                      disabled={isPersonnelShiftSaving}
                    >
                      {isPersonnelShiftSaving ? 'Assigning...' : 'Add Shift Assignment'}
                    </button>

                    {shiftAssignments.length > 0 && (
                      <div className="shift-assignments-list">
                        <h5>
                          Current Shift Assignments for {selectedShiftPersonnel?.first_name} {selectedShiftPersonnel?.last_name}:
                        </h5>
                        <div className="assignments-table">
                          {shiftAssignments.map((assignment) => (
                            <div key={assignment.assignment_id} className="assignment-row">
                              <div className="assignment-info">
                                <span className="assignment-shift">Shift {assignment.shift_type}</span>
                                <span className="assignment-dates">
                                  {formatShiftDate(assignment.start_date)} - {formatShiftDate(assignment.end_date)}
                                </span>
                              </div>
                              <button
                                className="assignment-remove-btn"
                                onClick={() => handleRemoveShiftAssignment(assignment.assignment_id)}
                                title="Remove this assignment"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {personnelShiftMessage.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${personnelShiftMessage.type}`}>
                    {personnelShiftMessage.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={closePersonnelShiftModal} disabled={isPersonnelShiftSaving}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {isDeleteUserModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-confirm-modal">
              <div className="accounts-modal-header">
                <h3>Delete User</h3>
                <button
                  className="accounts-modal-close"
                  onClick={closeDeleteUserModal}
                  aria-label="Close delete confirmation modal"
                  disabled={isDeleteUserProcessing}
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <p>Are you sure you want to delete this user?</p>
                {deleteMessage.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${deleteMessage.type}`}>
                    {deleteMessage.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={closeDeleteUserModal} disabled={isDeleteUserProcessing}>
                  Cancel
                </button>
                <button className="delete-btn" onClick={confirmDeleteUser} disabled={isDeleteUserProcessing}>
                  {isDeleteUserProcessing ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isRejectModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-confirm-modal">
              <div className="accounts-modal-header">
                <h3>Reject Leave Request</h3>
                <button
                  className="accounts-modal-close"
                  onClick={closeRejectModal}
                  aria-label="Close reject leave modal"
                  disabled={Boolean(processingRequestId)}
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <p>Optional reason for rejection:</p>
                <textarea
                  className="accounts-modal-textarea"
                  rows={4}
                  value={rejectReasonInput}
                  onChange={(event) => setRejectReasonInput(event.target.value)}
                  placeholder="Enter reason..."
                />
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={closeRejectModal} disabled={Boolean(processingRequestId)}>
                  Cancel
                </button>
                <button className="leave-reject-btn" onClick={confirmRejectLeaveRequest} disabled={Boolean(processingRequestId)}>
                  {processingRequestId ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isConfirmActionModalOpen && pendingConfirmAction && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-confirm-modal">
              <div className="accounts-modal-header">
                <h3>{pendingConfirmAction.title}</h3>
                <button
                  className="accounts-modal-close"
                  onClick={closeConfirmActionModal}
                  aria-label="Close confirmation modal"
                  disabled={isConfirmActionProcessing}
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <p>{pendingConfirmAction.message}</p>
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={closeConfirmActionModal} disabled={isConfirmActionProcessing}>
                  Cancel
                </button>
                <button className="leave-reject-btn" onClick={confirmActionModal} disabled={isConfirmActionProcessing}>
                  {isConfirmActionProcessing ? 'Processing...' : pendingConfirmAction.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
