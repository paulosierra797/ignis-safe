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
  getShiftAssignmentsForPeriod
} from '../utils/personnelOperationsService';
import { useUser } from '../context/UserContext';

const validPersonnelNamePattern = /^[A-Za-z\s]+$/;
const validContactNumberPattern = /^09\d{9}$/;
const OTHER_RANK_VALUE = '__OTHER__';
const RANK_OPTIONS = [
  { value: 'FDIR', label: 'FDIR - Fire Director' },
  { value: 'DFDIR', label: 'DFDIR - Deputy Fire Director' },
  { value: 'SSUPT', label: 'SSUPT - Senior Fire Superintendent' },
  { value: 'SUPT', label: 'SUPT - Fire Superintendent' },
  { value: 'CINSP', label: 'CINSP - Fire Chief Inspector' },
  { value: 'SINSP', label: 'SINSP - Fire Senior Inspector' },
  { value: 'INSP', label: 'INSP - Fire Inspector' },
  { value: 'SFO4', label: 'SFO4 - Senior Fire Officer IV' },
  { value: 'SFO3', label: 'SFO3 - Senior Fire Officer III' },
  { value: 'SFO2', label: 'SFO2 - Senior Fire Officer II' },
  { value: 'SFO1', label: 'SFO1 - Senior Fire Officer I' },
  { value: 'FO3', label: 'FO3 - Fire Officer III' },
  { value: 'FO2', label: 'FO2 - Fire Officer II' },
  { value: 'FO1', label: 'FO1 - Fire Officer I' },
  { value: OTHER_RANK_VALUE, label: 'Other (Specify)' }
];
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
  const [selectedShiftPersonnelIds, setSelectedShiftPersonnelIds] = useState([]);
  const [shiftPersonnelSearch, setShiftPersonnelSearch] = useState('');
  const [personnelShiftMessage, setPersonnelShiftMessage] = useState({ type: '', text: '' });
  const [periodAssignments, setPeriodAssignments] = useState([]);
  const [pendingRequestsLoading, setPendingRequestsLoading] = useState(true);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState([]);
  const [pendingRequestMessage, setPendingRequestMessage] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
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
    custom_rank: '',
    contact_number: '',
    password: '',
    confirm_password: ''
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

    const rejectionReason = window.prompt('Optional rejection reason:') || '';

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
  };

  const handleDeleteUser = async (adminId) => {
    if (!adminId) {
      alert('Cannot delete this account because its ID is missing.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      const target = accounts.find((account) => account.admin_id === adminId);
      const { error, deletedCount } = await deleteUser(adminId);
      if (error) {
        alert('Error deleting user: ' + error);
      } else {
        if (!deletedCount) {
          alert('Delete request completed but no account was removed. Please check permissions/policies.');
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

        alert('User deleted successfully');
        fetchAccounts(); // Refresh the list
      }
    } catch (err) {
      alert('Error deleting user: ' + err.message);
    }
  };

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    const fieldName = id.replace('personnel-', '').replace(/-/g, '_');

    if (fieldName === 'contact_number') {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 11);
      setFormData(prev => ({
        ...prev,
        contact_number: digitsOnly
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleAddPersonnel = async () => {
    // Validation
    const firstName = formData.first_name.trim();
    const lastName = formData.last_name.trim();
    const rankValue = formData.rank === OTHER_RANK_VALUE
      ? formData.custom_rank.trim().toUpperCase()
      : formData.rank;
    const contactNumber = String(formData.contact_number || '').trim();
    const password = String(formData.password || '');
    const confirmPassword = String(formData.confirm_password || '');

    if (!firstName || !lastName || !formData.email || !formData.role || !formData.rank || !contactNumber || !password || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }

    if (formData.rank === OTHER_RANK_VALUE && !formData.custom_rank.trim()) {
      setMessage({ type: 'error', text: 'Please enter a custom rank.' });
      return;
    }

    if (!validContactNumberPattern.test(contactNumber)) {
      setMessage({ type: 'error', text: 'Contact number must be 11 digits and start with 09.' });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Password and confirm password do not match.' });
      return;
    }

    if (!validPersonnelNamePattern.test(firstName) || !validPersonnelNamePattern.test(lastName)) {
      setMessage({ type: 'error', text: 'First name and last name can only contain letters and spaces.' });
      return;
    }

    setIsLoading(true);
    setMessage({ type: '', text: '' });

    const submittedForm = {
      first_name: firstName,
      last_name: lastName,
      email: formData.email,
      role: formData.role,
      rank: rankValue,
      contact_number: contactNumber
    };

    try {
      console.log('Attempting to add personnel with email verification...');

      // Use signUp to create auth user and send verification email
      const signupAttempt = signUp(formData.email, password, {
        first_name: firstName,
        last_name: lastName,
        role: formData.role,
        rank: rankValue,
        contact_number: contactNumber
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
            custom_rank: '',
            contact_number: '',
            password: '',
            confirm_password: ''
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
        custom_rank: '',
        contact_number: '',
        password: '',
        confirm_password: ''
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
      custom_rank: '',
      contact_number: '',
      password: '',
      confirm_password: ''
    });
    setMessage({ type: '', text: '' });
  };

  const handleTogglePersonnelSelection = (personnelId) => {
    setSelectedShiftPersonnelIds((prev) => {
      if (prev.includes(personnelId)) {
        return prev.filter((id) => id !== personnelId);
      }

      return [...prev, personnelId];
    });
  };

  const handleSelectAllPersonnelForShift = () => {
    const query = shiftPersonnelSearch.trim().toLowerCase();
    const allPersonnelIds = accounts
      .filter((account) => isPersonnelAccount(account))
      .filter((account) => {
        if (!query) return true;

        const haystack = [
          account.first_name,
          account.last_name,
          account.rank,
          account.email
        ].join(' ').toLowerCase();

        return haystack.includes(query);
      })
      .map((account) => account.admin_id)
      .filter(Boolean);

    setSelectedShiftPersonnelIds((prev) => {
      const selectedFromFiltered = allPersonnelIds.filter((id) => prev.includes(id));
      const shouldClearFiltered = selectedFromFiltered.length === allPersonnelIds.length && allPersonnelIds.length > 0;

      if (shouldClearFiltered) {
        return prev.filter((id) => !allPersonnelIds.includes(id));
      }

      const next = new Set(prev);
      allPersonnelIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const handleAssignSelectedPersonnelToShift = async (shiftType) => {
    if (!selectedShiftPersonnelIds.length) {
      setPersonnelShiftMessage({ type: 'error', text: 'Please select at least one personnel member.' });
      return;
    }

    const shiftDates = shiftType === 'A'
      ? shiftSchedule.shift_a_dates
      : shiftSchedule.shift_b_dates;

    if (!shiftDates || shiftDates.length === 0) {
      setPersonnelShiftMessage({
        type: 'error',
        text: `Shift ${shiftType} has no dates set. Please set shift dates first.`
      });
      return;
    }

    const sortedDates = [...shiftDates].sort();
    const formStartDate = sortedDates[0];
    const formEndDate = sortedDates[sortedDates.length - 1];

    setIsPersonnelShiftSaving(true);
    setPersonnelShiftMessage({ type: '', text: '' });

    const failedAssignments = [];
    const successfulAssignments = [];

    for (const personnelId of selectedShiftPersonnelIds) {
      const { error } = await assignPersonnelToShift({
        personnelId,
        shiftType,
        startDate: formStartDate,
        endDate: formEndDate,
        assignedBy: currentUser?.admin_id || null
      });

      if (error) {
        if (String(error).toLowerCase().includes('personnel_shift')) {
          setPersonnelShiftMessage({
            type: 'error',
            text: 'Personnel shift assignments table is missing. Run personnel_shift_assignments_setup.sql first.'
          });
          setIsPersonnelShiftSaving(false);
          return;
        }

        failedAssignments.push({ personnelId, error: String(error) });
      } else {
        successfulAssignments.push(personnelId);
      }
    }

    await loadShiftAssignmentsForSchedule();

    if (successfulAssignments.length > 0) {
      const assignedNames = successfulAssignments
        .map((personnelId) => {
          const match = accounts.find((account) => account.admin_id === personnelId);
          return `${match?.first_name || ''} ${match?.last_name || ''}`.trim() || personnelId;
        });

      logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Personnel Shift Assigned',
        actionType: 'edit',
        details: `Assigned ${successfulAssignments.length} personnel to Shift ${shiftType}: ${assignedNames.join(', ')}.`,
        metadata: {
          target_admin_ids: successfulAssignments,
          shift_type: shiftType,
          assignment_count: successfulAssignments.length,
          period_start: formStartDate,
          period_end: formEndDate
        }
      }).catch((logError) => {
        console.warn('Unable to write admin activity log:', logError);
      });
    }

    if (failedAssignments.length > 0) {
      setPersonnelShiftMessage({
        type: 'error',
        text: `Assigned ${successfulAssignments.length} personnel to Shift ${shiftType}. ${failedAssignments.length} failed. Please retry.`
      });
      setSelectedShiftPersonnelIds(failedAssignments.map((entry) => entry.personnelId));
    } else {
      setPersonnelShiftMessage({
        type: 'success',
        text: `Successfully assigned ${successfulAssignments.length} personnel to Shift ${shiftType}.`
      });
      setSelectedShiftPersonnelIds([]);
    }

    setIsPersonnelShiftSaving(false);
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
    setSelectedShiftPersonnelIds([]);
    setShiftPersonnelSearch('');
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
    setSelectedShiftPersonnelIds([]);
    setShiftPersonnelSearch('');
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

    if (!window.confirm(`Clear leave dates for ${account.first_name || ''} ${account.last_name || ''}?`)) {
      return;
    }

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

  const filteredAccounts = accounts.filter((account) => {
    const fullName = `${account.first_name || ''} ${account.last_name || ''}`.toLowerCase().trim();
    const matchSearch = fullName.includes(personnelSearch.toLowerCase());
    const matchRank = rankFilter === 'All Ranks' || account.rank === rankFilter;
    const matchStatus = statusFilter === 'All Status' || account.status === statusFilter;
    return matchSearch && matchRank && matchStatus;
  });

  const filteredShiftPersonnelAccounts = accounts
    .filter((account) => isPersonnelAccount(account))
    .filter((account) => {
      const query = shiftPersonnelSearch.trim().toLowerCase();
      if (!query) return true;

      const haystack = [
        account.first_name,
        account.last_name,
        account.rank,
        account.email
      ].join(' ').toLowerCase();

      return haystack.includes(query);
    });

  const selectedFromFilteredCount = filteredShiftPersonnelAccounts
    .filter((account) => selectedShiftPersonnelIds.includes(account.admin_id))
    .length;

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
                      {RANK_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  {formData.rank === OTHER_RANK_VALUE && (
                    <div className="accounts-modal-field">
                      <label htmlFor="personnel-custom-rank">Custom Rank</label>
                      <input
                        id="personnel-custom-rank"
                        type="text"
                        placeholder="Enter rank"
                        value={formData.custom_rank}
                        onChange={handleInputChange}
                      />
                    </div>
                  )}
                   <div className="accounts-modal-field">
                    <label htmlFor="personnel-contact-number">Contact number</label>
                    <input
                      id="personnel-contact-number"
                      type="text"
                      placeholder="09XXXXXXXXX"
                      value={formData.contact_number}
                      onChange={handleInputChange}
                      inputMode="numeric"
                      maxLength={11}
                      pattern="09[0-9]{9}"
                      title="Use 11 digits starting with 09"
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-password">Password</label>
                    <input
                      id="personnel-password"
                      type="password"
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-confirm-password">Confirm Password</label>
                    <input
                      id="personnel-confirm-password"
                      type="password"
                      placeholder="Confirm password"
                      value={formData.confirm_password}
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
                  <div className="shift-personnel-selector-header">
                    <label>
                      <strong>Select Personnel</strong>
                    </label>
                    <button
                      type="button"
                      className="shift-select-all-btn"
                      onClick={handleSelectAllPersonnelForShift}
                      disabled={isPersonnelShiftSaving}
                    >
                      {selectedFromFilteredCount === filteredShiftPersonnelAccounts.length && filteredShiftPersonnelAccounts.length > 0
                        ? 'Clear Selection'
                        : 'Select All'}
                    </button>
                  </div>

                  <input
                    type="text"
                    className="shift-personnel-search-input"
                    placeholder="Search personnel by name, rank, or email"
                    value={shiftPersonnelSearch}
                    onChange={(event) => setShiftPersonnelSearch(event.target.value)}
                    disabled={isPersonnelShiftSaving}
                  />

                  <div className="shift-selected-count">
                    {selectedShiftPersonnelIds.length} selected
                  </div>

                  <div className="shift-personnel-checkbox-list">
                    {filteredShiftPersonnelAccounts.length === 0 ? (
                      <div className="shift-personnel-empty">No personnel matched your search.</div>
                    ) : (
                      filteredShiftPersonnelAccounts.map((account) => {
                        const isChecked = selectedShiftPersonnelIds.includes(account.admin_id);
                        return (
                          <label key={account.admin_id} className="shift-personnel-checkbox-item">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePersonnelSelection(account.admin_id)}
                              disabled={isPersonnelShiftSaving}
                            />
                            <span>
                              {account.first_name} {account.last_name} ({account.rank || 'N/A'})
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>

                  <div className="shift-bulk-actions">
                    <button
                      type="button"
                      className="shift-assign-btn"
                      onClick={() => handleAssignSelectedPersonnelToShift('A')}
                      disabled={isPersonnelShiftSaving || selectedShiftPersonnelIds.length === 0}
                    >
                      {isPersonnelShiftSaving ? 'Assigning...' : 'Assign to Shift A'}
                    </button>
                    <button
                      type="button"
                      className="shift-assign-btn"
                      onClick={() => handleAssignSelectedPersonnelToShift('B')}
                      disabled={isPersonnelShiftSaving || selectedShiftPersonnelIds.length === 0}
                    >
                      {isPersonnelShiftSaving ? 'Assigning...' : 'Assign to Shift B'}
                    </button>
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
      </div>
    </div>
  );
}
