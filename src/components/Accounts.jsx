import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useBlocker } from 'react-router-dom';
import { FaArchive, FaChevronDown, FaSearch, FaTimes, FaUndo } from 'react-icons/fa';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { supabase } from "../utils/supabaseClient";
import './Accounts.css';
import { invitePersonnel } from '../utils/authService';
import {
  getAllUsers,
  deleteUser,
  logAdminActivity,
  updatePersonnelWorkspaceProfile,
  updateUser,
  getShiftScheduleConfig,
  saveShiftScheduleConfig
} from '../utils/usersService';
import {
  getPendingLeaveRequests,
  getAllLeaveRequests,
  archiveLeaveRequest,
  restoreLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  getPersonnelShiftSchedule,
  assignPersonnelToShiftBulk,
  getShiftAssignmentsForPeriod,
  removeShiftAssignment,
  getPersonnelForDate
} from '../utils/personnelOperationsService';
import {
  getAllProfileChangeRequests,
  archiveProfileChangeRequest,
  restoreProfileChangeRequest,
  approveProfileChangeRequest,
  rejectProfileChangeRequest,
  getProfileFieldLabel
} from '../utils/profileChangeRequestsService';
import { useUser } from '../context/UserContext';
import { getManilaToday } from '../utils/dateUtils';

const validPersonnelNamePattern = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const contactNumberRegex = /^09\d{9}$/;
const ADD_PERSONNEL_TIMEOUT_MS = 30000;
const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REQUEST_PREVIEW_LIMIT = 3;
const ACCOUNT_PAGE_SIZE = 10;
const EMPTY_PERSONNEL_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  role: '',
  rank: '',
  rank_custom: '',
  contact_number: ''
};
const isPersonnelAccount = (account) => String(account?.role || '').toLowerCase() === 'personnel';

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};



const ACCOUNT_ACTION_MENU_WIDTH = 196;

function AccountActionsMenu({ account, actions }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current || !isOpen) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.getBoundingClientRect().height || Math.max(136, actions.length * 42 + 12);
    const viewportPadding = 12;
    const gap = 8;
    const openAbove = triggerRect.bottom + gap + menuHeight > window.innerHeight - viewportPadding;
    const preferredTop = openAbove
      ? triggerRect.top - menuHeight - gap
      : triggerRect.bottom + gap;
    const top = Math.min(
      Math.max(preferredTop, viewportPadding),
      Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding)
    );
    const left = Math.min(
      Math.max(triggerRect.right - ACCOUNT_ACTION_MENU_WIDTH, viewportPadding),
      Math.max(viewportPadding, window.innerWidth - ACCOUNT_ACTION_MENU_WIDTH - viewportPadding)
    );

    setMenuPosition({ top, left });
  }, [actions.length, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    updateMenuPosition();

    const handleOutsidePointer = (event) => {
      if (
        !triggerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setMenuPosition(null);
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuPosition(null);
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (isOpen && menuPosition) {
      menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    }
  }, [isOpen, menuPosition]);

  const handleMenuToggle = () => {
    setMenuPosition(null);
    setIsOpen((open) => !open);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="account-action-menu-trigger"
        aria-label={`Open actions for ${account.first_name || ''} ${account.last_name || ''}`.trim()}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleMenuToggle}
      >
        <span aria-hidden="true">...</span>
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="account-action-menu"
          role="menu"
          aria-label="Personnel actions"
          style={{
            top: menuPosition?.top ?? 0,
            left: menuPosition?.left ?? 0,
            visibility: menuPosition ? 'visible' : 'hidden'
          }}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              className={`account-action-menu-item${action.destructive ? ' is-destructive' : ''}`}
              onClick={() => {
                setMenuPosition(null);
                setIsOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function RequestSectionToggle({ expanded, itemCount, label, onToggle }) {
  if (itemCount <= REQUEST_PREVIEW_LIMIT) {
    return null;
  }

  return (
    <div className="request-section-toggle-row">
      <button
        type="button"
        className="request-section-toggle"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
        onClick={onToggle}
      >
        <span>{expanded ? 'Collapse' : 'Expand'}</span>
        <span className={`request-section-toggle-icon${expanded ? ' is-expanded' : ''}`} aria-hidden="true">
          <FaChevronDown />
        </span>
      </button>
      {!expanded && (
        <span className="request-section-preview-note">
          Showing the latest {REQUEST_PREVIEW_LIMIT} {label}
        </span>
      )}
    </div>
  );
}

function ProfileRequestChanges({ request }) {
  const changes = Array.isArray(request?.change_items) && request.change_items.length > 0
    ? request.change_items
    : [{
      field_name: request?.field_name,
      field_label: getProfileFieldLabel(request?.field_name),
      current_value: request?.current_value || '',
      requested_value: request?.requested_value || ''
    }];

  return (
    <div className="profile-request-change-list">
      {changes.map((change) => (
        <div className="profile-request-change-item" key={change.field_name}>
          <strong>{change.field_label}</strong>
          <span>{change.current_value || '—'} to {change.requested_value}</span>
        </div>
      ))}
    </div>
  );
}

function AccountDirectoryGroup({
  title,
  description,
  accounts,
  totalCount,
  startIndex = 1,
  emptyMessage,
  getAccountActions,
  isOnLeave,
  formatLeaveDate,
  variant,
  page,
  totalPages,
  onPageChange,
}) {
  const rangeEnd = accounts.length > 0 ? startIndex + accounts.length - 1 : 0;

  return (
    <section className={`account-directory-group account-directory-group-${variant}`}>
      <div className="account-directory-group-header">
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <span>{totalCount}</span>
      </div>

      {accounts.length === 0 ? (
        <div className="account-directory-group-empty">{emptyMessage}</div>
      ) : (
        <div className="account-directory-entries">
          {accounts.map((account, index) => {
            const accountName = `${account.first_name || ''} ${account.last_name || ''}`.trim()
              || (variant === 'admin' ? 'Admin' : 'Personnel');
            const normalizedStatus = String(account.status || 'inactive').toLowerCase().replace(/\s+/g, '-');

            return (
              <article className="account-directory-entry" key={account.admin_id || account.id}>
                <span className="account-directory-entry-number">{startIndex + index}</span>
                <div className="account-directory-entry-content">
                  <div className="account-directory-entry-heading">
                    <div className="account-directory-entry-identity">
                      <strong title={accountName}>{accountName}</strong>
                      <span title={account.email || ''}>{account.email || '—'}</span>
                    </div>
                    <span className={`status-pill ${normalizedStatus}`}>
                      {String(account.status || 'Inactive')}
                    </span>
                  </div>

                  <div className="account-directory-entry-meta">
                    <span><b>Rank:</b> {account.rank || '—'}</span>
                    <span><b>Role:</b> {account.role || '—'}</span>
                    {isOnLeave(account) && (
                      <span>
                        <b>Leave:</b> {formatLeaveDate(account.leave_start_date)} – {formatLeaveDate(account.leave_end_date)}
                      </span>
                    )}
                  </div>
                </div>

                <AccountActionsMenu account={account} actions={getAccountActions(account)} />
              </article>
            );
          })}
        </div>
      )}

      {totalCount > 0 && (
        <div className="accounts-directory-pagination" aria-label={`${title} pagination`}>
          <p>
            Showing {startIndex}-{rangeEnd} of {totalCount} {title.toLowerCase()}
          </p>
          <div className="accounts-directory-page-controls">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Accounts() {
  const { currentUser } = useUser();
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('All Ranks');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [personnelPage, setPersonnelPage] = useState(1);
  const [adminPage, setAdminPage] = useState(1);
  const [expandedRequestSections, setExpandedRequestSections] = useState({
    pendingLeave: false,
    leaveHistory: false,
    pendingProfile: false,
    profileHistory: false
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddExitConfirmOpen, setIsAddExitConfirmOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isShiftExitConfirmOpen, setIsShiftExitConfirmOpen] = useState(false);
  const [isPersonnelShiftModalOpen, setIsPersonnelShiftModalOpen] = useState(false);
  const [isPersonnelShiftExitConfirmOpen, setIsPersonnelShiftExitConfirmOpen] = useState(false);
  const [isShiftConfirmModalOpen, setIsShiftConfirmModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLeaveSaving, setIsLeaveSaving] = useState(false);
  const [isShiftSaving, setIsShiftSaving] = useState(false);
  const [isPersonnelShiftSaving, setIsPersonnelShiftSaving] = useState(false);
  const [isPersonnelShiftReviewSaved, setIsPersonnelShiftReviewSaved] = useState(false);
  const [selectedShiftPersonnelIds, setSelectedShiftPersonnelIds] = useState([]);
  const [selectedShiftForAssignment, setSelectedShiftForAssignment] = useState('');
  const [personnelShiftSearch, setPersonnelShiftSearch] = useState('');
  const [personnelShiftMessage, setPersonnelShiftMessage] = useState({ type: '', text: '' });
  const [periodAssignments, setPeriodAssignments] = useState([]);
  const [pendingRequestsLoading, setPendingRequestsLoading] = useState(true);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState([]);
  const [pendingRequestMessage, setPendingRequestMessage] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
  const [leaveRequestHistory, setLeaveRequestHistory] = useState([]);
  const [archivedLeaveRequests, setArchivedLeaveRequests] = useState([]);
  const [leaveHistoryLoading, setLeaveHistoryLoading] = useState(true);
  const [leaveHistoryMessage, setLeaveHistoryMessage] = useState('');
  const [leaveHistoryStatusFilter, setLeaveHistoryStatusFilter] = useState('all');
  const [leaveHistorySearch, setLeaveHistorySearch] = useState('');
  const [profileChangeRequests, setProfileChangeRequests] = useState([]);
  const [archivedProfileChangeRequests, setArchivedProfileChangeRequests] = useState([]);
  const [profileRequestsLoading, setProfileRequestsLoading] = useState(true);
  const [profileRequestMessage, setProfileRequestMessage] = useState('');
  const [profileHistoryStatusFilter, setProfileHistoryStatusFilter] = useState('all');
  const [profileHistorySearch, setProfileHistorySearch] = useState('');
  const [processingProfileRequestId, setProcessingProfileRequestId] = useState('');
  const [requestArchiveType, setRequestArchiveType] = useState('');
  const [requestArchiveLoading, setRequestArchiveLoading] = useState(false);
  const [requestArchiveMessage, setRequestArchiveMessage] = useState('');
  const [processingArchiveRequestId, setProcessingArchiveRequestId] = useState('');
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
  const [formErrors, setFormErrors] = useState({});
  const [leaveMessage, setLeaveMessage] = useState({ type: '', text: '' });
  const [shiftMessage, setShiftMessage] = useState({ type: '', text: '' });
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [shiftSchedule, setShiftSchedule] = useState({ shift_a_dates: [], shift_b_dates: [] });
  const [shiftSummaryMonth, setShiftSummaryMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [shiftSummaryRows, setShiftSummaryRows] = useState([]);
  const [shiftSummaryLoading, setShiftSummaryLoading] = useState(true);
  const [shiftSummaryError, setShiftSummaryError] = useState('');
  const shiftSummaryRequestIdRef = useRef(0);
  const [isDayDetailModalOpen, setIsDayDetailModalOpen] = useState(false);
  const [dayDetailDate, setDayDetailDate] = useState('');
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [dayDetailError, setDayDetailError] = useState('');
  const [dayDetailData, setDayDetailData] = useState({ onDuty: [], onLeave: [] });
  const dayDetailRequestIdRef = useRef(0);
  const [shiftSelection, setShiftSelection] = useState({ shift_a_dates: [], shift_b_dates: [] });
  const [activeShift, setActiveShift] = useState('A');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Form state
  const [formData, setFormData] = useState({ ...EMPTY_PERSONNEL_FORM });
  const pendingAddNavigationRef = useRef(null);
  const pendingPersonnelShiftNavigationRef = useRef(null);
  const bypassAddNavigationRef = useRef(false);
  const isAddPersonnelFormValid = useMemo(() => {
    const firstName = String(formData.first_name || '').trim();
    const lastName = String(formData.last_name || '').trim();
    const selectedRank = String(formData.rank || '').trim();
    const customRank = String(formData.rank_custom || '').trim();
    const contactNumber = String(formData.contact_number || '').trim();

    return Boolean(
      firstName &&
      lastName &&
      String(formData.email || '').trim() &&
      formData.role &&
      selectedRank &&
      (selectedRank !== 'OTHER' || customRank) &&
      contactNumberRegex.test(contactNumber) &&
      validPersonnelNamePattern.test(firstName) &&
      validPersonnelNamePattern.test(lastName)
    );
  }, [formData]);
  const isAddFormDirty = isAddModalOpen && Object.values(formData).some(
    (value) => String(value || '').trim() !== ''
  );
  const isPersonnelShiftDirty = isPersonnelShiftModalOpen && (
    selectedShiftPersonnelIds.length > 0 || Boolean(selectedShiftForAssignment)
  );
  const isShiftScheduleDirty = isShiftModalOpen && (
    JSON.stringify([...(shiftSelection.shift_a_dates || [])].sort())
      !== JSON.stringify([...(shiftSchedule.shift_a_dates || [])].sort())
    || JSON.stringify([...(shiftSelection.shift_b_dates || [])].sort())
      !== JSON.stringify([...(shiftSchedule.shift_b_dates || [])].sort())
  );
  const shouldBlockAccountsNavigation = useCallback(({ currentLocation, nextLocation }) => {
    if (bypassAddNavigationRef.current) {
      bypassAddNavigationRef.current = false;
      return false;
    }

    const currentPath = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextPath = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return (isAddFormDirty || isPersonnelShiftDirty || isShiftScheduleDirty) && currentPath !== nextPath;
  }, [isAddFormDirty, isPersonnelShiftDirty, isShiftScheduleDirty]);
  const addPersonnelBlocker = useBlocker(shouldBlockAccountsNavigation);
  const hasPendingAddExit = isAddExitConfirmOpen
    || (addPersonnelBlocker.state === 'blocked' && isAddFormDirty);
  const hasPendingPersonnelShiftExit = isPersonnelShiftExitConfirmOpen
    || (addPersonnelBlocker.state === 'blocked' && isPersonnelShiftDirty);
  const hasPendingShiftScheduleExit = isShiftExitConfirmOpen
    || (addPersonnelBlocker.state === 'blocked' && isShiftScheduleDirty);
  const [leaveFormData, setLeaveFormData] = useState({
    start_date: '',
    end_date: ''
  });
  const isOnLeave = (account) => String(account?.status || '').toLowerCase() === 'on leave';
  const findPersonnelAccount = useCallback((personnelId) => accounts.find((account) =>
    account.admin_id === personnelId && isPersonnelAccount(account)
  ), [accounts]);

  useEffect(() => {
    if (!isAddFormDirty && !isPersonnelShiftDirty && !isShiftScheduleDirty) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAddFormDirty, isPersonnelShiftDirty, isShiftScheduleDirty]);

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
    setPersonnelPage(1);
    setAdminPage(1);
  };

  // Fetch accounts on component mount
  useEffect(() => {
    fetchAccounts();
    loadShiftSchedule();
    loadPendingLeaveRequests();
    loadLeaveRequestHistory();
    loadProfileChangeRequests();
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
    const match = findPersonnelAccount(personnelId);
    return formatPersonnelName(match);
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

  const loadShiftSummary = useCallback(async (monthDate) => {
    const requestId = shiftSummaryRequestIdRef.current + 1;
    shiftSummaryRequestIdRef.current = requestId;

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const startDate = toIsoDate(new Date(year, month, 1));
    const endDate = toIsoDate(new Date(year, month + 1, 0));

    setShiftSummaryLoading(true);
    setShiftSummaryError('');

    const { data, error } = await getPersonnelShiftSchedule({ startDate, endDate });
    if (requestId !== shiftSummaryRequestIdRef.current) {
      return;
    }

    if (error) {
      setShiftSummaryRows([]);
      setShiftSummaryError(error);
    } else {
      setShiftSummaryRows(Array.isArray(data?.rows) ? data.rows : []);
    }

    setShiftSummaryLoading(false);
  }, []);

  useEffect(() => {
    loadShiftSummary(shiftSummaryMonth);

    return () => {
      shiftSummaryRequestIdRef.current += 1;
    };
  }, [loadShiftSummary, shiftSummaryMonth]);

  const shiftASet = new Set(shiftSelection.shift_a_dates || []);
  const shiftBSet = new Set(shiftSelection.shift_b_dates || []);

  const toggleCalendarDate = (date) => {
    const targetIsoDate = toIsoDate(date);
    if (targetIsoDate < getManilaToday()) {
      return;
    }

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
    const todayIso = getManilaToday();
    setShiftSelection((prev) => ({
      ...prev,
      [activeKey]: (prev[activeKey] || []).filter((dateValue) => dateValue < todayIso)
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
    const { data, error } = await getShiftScheduleConfig();
    if (error) {
      console.warn('Unable to load shift schedule:', error);
      return;
    }

    setShiftSchedule({
      shift_a_dates: data?.shift_a_dates || [],
      shift_b_dates: data?.shift_b_dates || []
    });
  };

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await getAllUsers({ includePersonnelWorkspaceProfiles: true });
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

  const loadLeaveRequestHistory = async () => {
    setLeaveHistoryLoading(true);
    setLeaveHistoryMessage('');

    const { data, error } = await getAllLeaveRequests();
    if (error) {
      setLeaveHistoryMessage(error);
      setLeaveRequestHistory([]);
    } else {
      setLeaveRequestHistory(data || []);
    }

    setLeaveHistoryLoading(false);
  };

  const loadProfileChangeRequests = async () => {
    setProfileRequestsLoading(true);
    setProfileRequestMessage('');

    const { data, error } = await getAllProfileChangeRequests();
    if (error) {
      setProfileRequestMessage(error);
      setProfileChangeRequests([]);
    } else {
      setProfileChangeRequests(data || []);
    }

    setProfileRequestsLoading(false);
  };

  const loadArchivedRequests = async (type) => {
    setRequestArchiveLoading(true);
    setRequestArchiveMessage('');

    const result = type === 'leave'
      ? await getAllLeaveRequests({ archived: true })
      : await getAllProfileChangeRequests({ archived: true });

    if (result.error) {
      setRequestArchiveMessage(result.error);
    } else if (type === 'leave') {
      setArchivedLeaveRequests(result.data || []);
    } else {
      setArchivedProfileChangeRequests(result.data || []);
    }

    setRequestArchiveLoading(false);
  };

  const openRequestArchive = async (type) => {
    setRequestArchiveType(type);
    await loadArchivedRequests(type);
  };

  const closeRequestArchive = () => {
    if (processingArchiveRequestId) return;
    setRequestArchiveType('');
    setRequestArchiveMessage('');
  };

  useEffect(() => {
    const handleDataChanged = (event) => {
      const scope = event?.detail?.scope || '';
      if (!scope || scope === 'users' || scope === 'profile' || scope === 'shift-schedule' || scope === 'leave_requests') {
        fetchAccounts();
        loadShiftSchedule();
        loadShiftSummary(shiftSummaryMonth);
        loadPendingLeaveRequests();
        loadLeaveRequestHistory();
      }
      if (!scope || scope === 'profile_change_requests') {
        loadProfileChangeRequests();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('ignis-safe:data-changed', handleDataChanged);
      return () => window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
    }

    return undefined;
  }, [loadShiftSummary, shiftSummaryMonth]);

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
        account.admin_id === request.personnel_id && isPersonnelAccount(account)
          ? {
              ...account,
              status: 'On Leave',
              leave_start_date: request.start_date,
              leave_end_date: request.end_date
            }
          : account
      )
    );
    await Promise.all([
      loadShiftSummary(shiftSummaryMonth),
      loadLeaveRequestHistory()
    ]);

    const target = findPersonnelAccount(request.personnel_id);
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
    await loadLeaveRequestHistory();

    const target = findPersonnelAccount(request.personnel_id);
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

  const formatRequestStatus = (status) => {
    if (!status) return '—';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const matchesLeaveHistorySearch = (request, query) => {
    if (!query) return true;

    const haystack = [
      request.personnel_name,
      request.personnel_rank,
      request.start_date,
      request.end_date,
      request.created_at,
      request.approved_at,
      formatLeaveDate(request.start_date),
      formatLeaveDate(request.end_date),
      request.created_at ? new Date(request.created_at).toLocaleDateString('en-US') : '',
      request.approved_at ? new Date(request.approved_at).toLocaleDateString('en-US') : ''
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  };

  const filteredLeaveRequestHistory = leaveRequestHistory.filter((request) => {
    const matchesStatus =
      leaveHistoryStatusFilter === 'all' || request.status === leaveHistoryStatusFilter;
    if (!matchesStatus) return false;
    return matchesLeaveHistorySearch(request, leaveHistorySearch.trim().toLowerCase());
  });

  const pendingProfileChangeRequests = profileChangeRequests.filter(
    (request) => request.status === 'pending'
  );

  const pendingProfileChangeRequestCount = pendingProfileChangeRequests.length;

  const getProfileRequestChanges = (request) => (
    Array.isArray(request?.change_items) && request.change_items.length > 0
      ? request.change_items
      : [{
        field_name: request?.field_name,
        field_label: getProfileFieldLabel(request?.field_name),
        current_value: request?.current_value || '',
        requested_value: request?.requested_value || ''
      }]
  );

  const matchesProfileHistorySearch = (request, query) => {
    if (!query) return true;

    const haystack = [
      request.personnel_name,
      request.field_name,
      getProfileFieldLabel(request.field_name),
      request.current_value,
      request.requested_value,
      ...getProfileRequestChanges(request).flatMap((change) => [
        change.field_label,
        change.current_value,
        change.requested_value
      ])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  };

  const filteredProfileChangeHistory = profileChangeRequests.filter((request) => {
    const matchesStatus =
      profileHistoryStatusFilter === 'all' || request.status === profileHistoryStatusFilter;
    if (!matchesStatus) return false;
    return matchesProfileHistorySearch(request, profileHistorySearch.trim().toLowerCase());
  });

  const getVisibleRequestItems = (items, sectionKey) => (
    expandedRequestSections[sectionKey]
      ? items
      : items.slice(0, REQUEST_PREVIEW_LIMIT)
  );
  const visiblePendingLeaveRequests = getVisibleRequestItems(pendingLeaveRequests, 'pendingLeave');
  const visibleLeaveRequestHistory = getVisibleRequestItems(filteredLeaveRequestHistory, 'leaveHistory');
  const visiblePendingProfileChangeRequests = getVisibleRequestItems(pendingProfileChangeRequests, 'pendingProfile');
  const visibleProfileChangeHistory = getVisibleRequestItems(filteredProfileChangeHistory, 'profileHistory');

  const toggleRequestSection = (sectionKey) => {
    setExpandedRequestSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey]
    }));
  };

  const handleApproveProfileChangeRequest = async (request) => {
    if (!request?.request_id || processingProfileRequestId) {
      return;
    }

    setProcessingProfileRequestId(request.request_id);
    setProfileRequestMessage('');

    const { error } = await approveProfileChangeRequest({
      requestId: request.request_id,
      reviewedBy: currentUser?.admin_id || null
    });

    if (error) {
      setProfileRequestMessage(`Failed to approve request: ${error}`);
      setProcessingProfileRequestId('');
      return;
    }

    const changeSummary = getProfileRequestChanges(request)
      .map((change) => `${change.field_label}: ${change.current_value || '—'} to ${change.requested_value}`)
      .join('; ');

    logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Profile Change Request Approved',
      actionType: 'edit',
      details: `Approved profile changes for ${request.personnel_name || request.personnel_id}: ${changeSummary}.`,
      metadata: {
        request_id: request.request_id,
        personnel_id: request.personnel_id,
        field_name: request.field_name
      }
    }).catch((logError) => {
      console.warn('Unable to write admin activity log:', logError);
    });

    await loadProfileChangeRequests();
    setProcessingProfileRequestId('');
  };

  const handleRejectProfileChangeRequest = async (request) => {
    if (!request?.request_id || processingProfileRequestId) {
      return;
    }

    setProcessingProfileRequestId(request.request_id);
    setProfileRequestMessage('');

    const { error } = await rejectProfileChangeRequest({
      requestId: request.request_id,
      reviewedBy: currentUser?.admin_id || null
    });

    if (error) {
      setProfileRequestMessage(`Failed to reject request: ${error}`);
      setProcessingProfileRequestId('');
      return;
    }

    const requestedFields = getProfileRequestChanges(request)
      .map((change) => change.field_label)
      .join(', ');

    logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Profile Change Request Rejected',
      actionType: 'edit',
      details: `Rejected profile changes (${requestedFields}) for ${request.personnel_name || request.personnel_id}.`,
      metadata: {
        request_id: request.request_id,
        personnel_id: request.personnel_id,
        field_name: request.field_name
      }
    }).catch((logError) => {
      console.warn('Unable to write admin activity log:', logError);
    });

    await loadProfileChangeRequests();
    setProcessingProfileRequestId('');
  };

  const requestArchiveHistoryItem = (type, request) => {
    const label = type === 'leave' ? 'leave request' : 'profile change request';
    setPendingConfirmAction({
      action: 'archive-request-history',
      payload: { type, request },
      title: `Archive ${type === 'leave' ? 'Leave' : 'Profile'} Request`,
      message: `Archive this ${label} for ${request.personnel_name || 'this personnel member'}? It will move to the archive list and can be restored later.`,
      confirmLabel: 'Archive'
    });
    setIsConfirmActionModalOpen(true);
  };

  const executeArchiveHistoryItem = async (type, request) => {
    setProcessingArchiveRequestId(request.request_id);
    const result = type === 'leave'
      ? await archiveLeaveRequest({
        requestId: request.request_id,
        archivedBy: currentUser?.admin_id || null
      })
      : await archiveProfileChangeRequest({
        requestId: request.request_id,
        archivedBy: currentUser?.admin_id || null
      });

    if (result.error) {
      setRequestArchiveMessage(result.error);
      if (type === 'leave') {
        setLeaveHistoryMessage(result.error);
      } else {
        setProfileRequestMessage(result.error);
      }
      setProcessingArchiveRequestId('');
      return;
    }

    if (type === 'leave') {
      setLeaveRequestHistory((current) => current.filter((row) => row.request_id !== request.request_id));
    } else {
      setProfileChangeRequests((current) => current.filter((row) => row.request_id !== request.request_id));
    }

    setProcessingArchiveRequestId('');
  };

  const handleRestoreHistoryItem = async (type, request) => {
    if (processingArchiveRequestId) return;
    setProcessingArchiveRequestId(request.request_id);
    setRequestArchiveMessage('');

    const result = type === 'leave'
      ? await restoreLeaveRequest({ requestId: request.request_id })
      : await restoreProfileChangeRequest({ requestId: request.request_id });

    if (result.error) {
      setRequestArchiveMessage(result.error);
      setProcessingArchiveRequestId('');
      return;
    }

    await Promise.all([
      type === 'leave' ? loadLeaveRequestHistory() : loadProfileChangeRequests(),
      loadArchivedRequests(type)
    ]);
    setProcessingArchiveRequestId('');
  };

  const handleDeleteUser = async (adminId) => {
    if (!adminId) {
      setDeleteMessage({ type: 'error', text: 'Cannot delete this account because its ID is missing.' });
      return;
    }

    const targetAccount = accounts.find((account) =>
      String(account.admin_id || account.id) === String(adminId)
    );
    if (String(targetAccount?.role || '').trim().toLowerCase() === 'admin') {
      setDeleteMessage({ type: 'error', text: 'Administrator accounts cannot be deleted.' });
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
      : fieldName === 'first_name' || fieldName === 'last_name'
        ? String(value || '').replace(/[^A-Za-z ]/g, '')
      : value;

    setFormData(prev => ({
      ...prev,
      [fieldName]: nextValue
    }));

    setFormErrors((prev) => {
      if (!prev[fieldName] && !(fieldName === 'rank' && prev.rank_custom)) {
        return prev;
      }

      const nextErrors = { ...prev };
      delete nextErrors[fieldName];
      if (fieldName === 'rank') {
        delete nextErrors.rank_custom;
      }
      return nextErrors;
    });
  };

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
const [selectedEditAccount, setSelectedEditAccount] = useState(null);
const [editFormData, setEditFormData] = useState({
  first_name: '',
  last_name: '',
  email: '',
  role: '',
  rank: '',
  contact_number: ''
});
const openEditModal = (account) => {
  setSelectedEditAccount(account);
  setEditFormData({
    first_name: account.first_name || '',
    last_name: account.last_name || '',
    email: account.email || '',
    role: account.role || '',
    rank: account.rank || '',
    contact_number: account.contact_number || ''
  });
  setIsEditModalOpen(true);
};

const handleUpdatePersonnel = async () => {
  if (!selectedEditAccount?.admin_id) return;

  const updates = {
    first_name: editFormData.first_name.trim(),
    last_name: editFormData.last_name.trim(),
    email: editFormData.email.trim(),
    role: editFormData.role,
    rank: editFormData.rank,
    contact_number: editFormData.contact_number
  };
  const { data: authData } = await supabase.auth.getUser();
console.log("AUTH USER:", authData);

  console.log("Updating admin_id:", selectedEditAccount.admin_id);

  if (!updates.first_name || !updates.last_name || !updates.email) {
    setMessage({ type: 'error', text: 'Required fields missing.' });
    return;
  }

  const updateResult = selectedEditAccount.is_personnel_workspace_profile
    ? await updatePersonnelWorkspaceProfile(selectedEditAccount.admin_id, {
      ...updates,
      role: undefined
    })
    : await updateUser(selectedEditAccount.admin_id, updates);
  const { error } = updateResult;

  if (error) {
    setMessage({ type: 'error', text: `Update failed: ${error}` });
    return;
  }

  setAccounts((prev) =>
    prev.map((acc) =>
      acc.admin_id === selectedEditAccount.admin_id
        ? { ...acc, ...updates }
        : acc
    )
  );

  setMessage({ type: 'success', text: 'Personnel updated successfully.' });

  logAdminActivity({
    actorId: currentUser?.admin_id,
    actorName: currentUser?.name || currentUser?.email,
    action: 'Personnel Updated',
    actionType: 'edit',
    details: `Updated profile of ${updates.first_name} ${updates.last_name} (${updates.email})`
  }).catch(console.warn);

  setTimeout(() => {
    setIsEditModalOpen(false);
    setSelectedEditAccount(null);
    setMessage({ type: '', text: '' });
  }, 1500);
};
  const handleAddPersonnel = async () => {
    // Validation
    const firstName = formData.first_name.trim();
    const lastName = formData.last_name.trim();
    const selectedRank = String(formData.rank || '').trim();
    const customRank = String(formData.rank_custom || '').trim();
    const finalRank = selectedRank === 'OTHER' ? customRank : selectedRank;
    const contactNumber = String(formData.contact_number || '').trim();

    const requiredErrors = {};
    if (!firstName) requiredErrors.first_name = 'First name is required.';
    if (!lastName) requiredErrors.last_name = 'Last name is required.';
    if (!String(formData.email || '').trim()) requiredErrors.email = 'Email address is required.';
    if (!formData.role) requiredErrors.role = 'Role is required.';
    if (!selectedRank) requiredErrors.rank = 'Rank designation is required.';
    if (selectedRank === 'OTHER' && !customRank) requiredErrors.rank_custom = 'Custom rank is required.';
    if (!contactNumber) requiredErrors.contact_number = 'Contact number is required.';

    setFormErrors(requiredErrors);

    if (Object.keys(requiredErrors).length > 0) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }

    if (!validPersonnelNamePattern.test(firstName) || !validPersonnelNamePattern.test(lastName)) {
      setMessage({ type: 'error', text: 'First name and last name can only contain letters and spaces.' });
      return;
    }

    if (!contactNumberRegex.test(contactNumber)) {
      setMessage({ type: 'error', text: 'Contact number must start with 09 and be exactly 11 digits.' });
      return;
    }

    setIsLoading(true);
    setMessage({ type: 'info', text: 'Sending the activation invitation...' });

    const submittedForm = {
      first_name: firstName,
      last_name: lastName,
      email: formData.email,
      role: formData.role,
      rank: finalRank,
      contact_number: contactNumber
    };
    const getDefaultPermissions = (role) => {
  switch (role) {
    case "admin":
      return [
        "view_dashboard",
        "view_reports",
        "create_reports",
        "view_attendance",
        "manage_users",
        "view_analytics",
        "view_charts",
        "view_accounts",
        "view_audit_logs"
      ];

    
    case "personnel":
    default:
      return [];
  }
};

const permissions = getDefaultPermissions(formData.role);

    try {
      const signupAttempt = invitePersonnel(formData.email, {
        first_name: firstName,
        last_name: lastName,
        role: formData.role,
        rank: finalRank,
        contact_number: contactNumber || null,
        permissions
      });

      const timeoutAttempt = new Promise((resolve) => {
        setTimeout(() => resolve({ timedOut: true }), ADD_PERSONNEL_TIMEOUT_MS);
      });

      const signupResponse = await Promise.race([signupAttempt, timeoutAttempt]);

      if (signupResponse?.timedOut) {
        console.warn('Add personnel request timed out in UI. Checking current admin accounts list...');
        const { data: latestAccounts, error: fetchError } = await getAllUsers({
          includePersonnelWorkspaceProfiles: true
        });
        const accountExists = !fetchError && (latestAccounts || []).some((account) =>
          String(account.email || '').toLowerCase() === String(formData.email || '').toLowerCase()
        );

        if (accountExists) {
          setAccounts(latestAccounts || []);
          setMessage({
            type: 'success',
            text: 'Account invitation was created. The personnel must use the emailed activation link before signing in.'
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

          setFormData({ ...EMPTY_PERSONNEL_FORM });
          setFormErrors({});

          setTimeout(() => {
            setIsAddModalOpen(false);
            setMessage({ type: '', text: '' });
          }, 1200);
          return;
        }

        setMessage({
          type: 'error',
          text: 'Request is taking too long and no admin record was found yet. Please retry once, then check Supabase admin table for this email.'
        });
        return;
      }

      const result = signupResponse;
      
      if (result.error) {
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
        text: 'Invitation sent. The personnel must activate the account from the email before signing in.'
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
      
      const createdAccount = result.data?.user;
      if (createdAccount) {
        setAccounts((previousAccounts) => [
          createdAccount,
          ...previousAccounts.filter((account) =>
            String(account.admin_id || account.id) !== String(createdAccount.admin_id)
          )
        ]);
      } else {
        void fetchAccounts();
      }
      
      // Reset form
      setFormData({ ...EMPTY_PERSONNEL_FORM });
      setFormErrors({});

      // Close modal after success
      setTimeout(() => {
        setIsAddModalOpen(false);
        setMessage({ type: '', text: '' });
      }, 1200);
    } catch (err) {
      console.error('Error adding personnel:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to add personnel. Please check console for details.' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetAddPersonnelForm = () => {
    setFormData({ ...EMPTY_PERSONNEL_FORM });
    setFormErrors({});
    setMessage({ type: '', text: '' });
  };

  const closeAddPersonnelModal = () => {
    setIsAddModalOpen(false);
    resetAddPersonnelForm();
  };

  const handleOpenAddModal = () => {
    resetAddPersonnelForm();
    setIsAddModalOpen(true);
  };

  const runAddManualNavigation = (navigation) => {
    bypassAddNavigationRef.current = true;

    try {
      const actionResult = navigation.action();
      Promise.resolve(actionResult).finally(() => {
        bypassAddNavigationRef.current = false;
      });
    } catch (error) {
      bypassAddNavigationRef.current = false;
      throw error;
    }
  };

  const handleCloseModal = () => {
    if (!isAddFormDirty) {
      closeAddPersonnelModal();
      return;
    }

    pendingAddNavigationRef.current = { type: 'close' };
    setIsAddExitConfirmOpen(true);
  };

  const handleAccountsHeaderNavigationRequest = (navigation) => {
    if (isAddFormDirty) {
      pendingAddNavigationRef.current = { type: 'manual', navigation };
      setIsAddExitConfirmOpen(true);
      return;
    }

    if (isPersonnelShiftDirty) {
      pendingPersonnelShiftNavigationRef.current = { type: 'manual', navigation };
      setIsPersonnelShiftExitConfirmOpen(true);
      return;
    }

    if (!isAddFormDirty && !isPersonnelShiftDirty) {
      navigation.action();
    }
  };

  const handleKeepEditingAddPersonnel = () => {
    pendingAddNavigationRef.current = null;
    setIsAddExitConfirmOpen(false);

    if (addPersonnelBlocker.state === 'blocked') {
      addPersonnelBlocker.reset();
    }
  };

  const handleDiscardAddPersonnel = () => {
    const pendingExit = pendingAddNavigationRef.current;
    pendingAddNavigationRef.current = null;
    setIsAddExitConfirmOpen(false);
    closeAddPersonnelModal();

    if (pendingExit?.type === 'manual') {
      if (addPersonnelBlocker.state === 'blocked') {
        addPersonnelBlocker.reset();
      }
      runAddManualNavigation(pendingExit.navigation);
      return;
    }

    if (addPersonnelBlocker.state === 'blocked') {
      addPersonnelBlocker.proceed();
    }
  };

  const shiftConfirmPreview = useMemo(() => {
    const selectedType = String(selectedShiftForAssignment || '').toUpperCase();
    const existingA = new Map();
    const existingB = new Map();

    periodAssignments.forEach((assignment) => {
      const type = String(assignment.shift_type || '').toUpperCase();
      const target = type === 'A' ? existingA : type === 'B' ? existingB : null;
      if (target) {
        target.set(assignment.personnel_id, true);
      }
    });

    const pendingIds = selectedShiftPersonnelIds.filter(
      (id) => !existingA.has(id) && !existingB.has(id)
    );
    const targetMap = selectedType === 'A' ? existingA : existingB;
    if (targetMap) {
      pendingIds.forEach((id) => targetMap.set(id, true));
    }

    const buildList = (map) =>
      Array.from(map.keys()).map((id) => {
        const account = findPersonnelAccount(id);
        return {
          id,
          name: account ? `${account.first_name} ${account.last_name}` : 'Personnel',
          rank: account?.rank || 'N/A',
          pending: pendingIds.includes(id) && map === targetMap
        };
      });

    return {
      shiftA: buildList(existingA),
      shiftB: buildList(existingB),
      skippedCount: selectedShiftPersonnelIds.length - pendingIds.length
    };
  }, [periodAssignments, selectedShiftPersonnelIds, selectedShiftForAssignment, findPersonnelAccount]);

  const personnelShiftCandidates = useMemo(() => {
    const normalizedSearch = personnelShiftSearch.trim().toLowerCase();

    return accounts
      .filter(isPersonnelAccount)
      .filter((account) => {
        if (!normalizedSearch) {
          return true;
        }

        const searchableText = [
          account.first_name,
          account.last_name,
          account.rank,
          account.email
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort((first, second) =>
        formatPersonnelName(first).localeCompare(formatPersonnelName(second))
      );
  }, [accounts, personnelShiftSearch]);

  const selectedShiftPersonnelRows = useMemo(
    () => selectedShiftPersonnelIds
      .map((personnelId) => findPersonnelAccount(personnelId))
      .filter(Boolean),
    [findPersonnelAccount, selectedShiftPersonnelIds]
  );

  const visibleAssignablePersonnelIds = useMemo(
    () => personnelShiftCandidates
      .filter((account) => !periodAssignments.some(
        (assignment) => assignment.personnel_id === account.admin_id
      ))
      .map((account) => account.admin_id),
    [periodAssignments, personnelShiftCandidates]
  );

  const allVisiblePersonnelSelected = Boolean(visibleAssignablePersonnelIds.length)
    && visibleAssignablePersonnelIds.every((personnelId) =>
      selectedShiftPersonnelIds.includes(personnelId)
    );

  const handleSelectShiftForAssignment = (shiftType) => {
    if (shiftType === selectedShiftForAssignment) {
      return;
    }

    setSelectedShiftForAssignment(shiftType);
    setSelectedShiftPersonnelIds([]);
    setIsPersonnelShiftReviewSaved(false);
    setPersonnelShiftMessage({ type: '', text: '' });
  };

  const handleToggleVisiblePersonnel = () => {
    if (!selectedShiftForAssignment || !visibleAssignablePersonnelIds.length) {
      return;
    }

    setIsPersonnelShiftReviewSaved(false);
    setSelectedShiftPersonnelIds((currentIds) => {
      if (allVisiblePersonnelSelected) {
        return currentIds.filter((id) => !visibleAssignablePersonnelIds.includes(id));
      }

      return Array.from(new Set([...currentIds, ...visibleAssignablePersonnelIds]));
    });
  };

  const openShiftConfirmModal = () => {
    if (!selectedShiftForAssignment) {
      setPersonnelShiftMessage({ type: 'error', text: 'Please choose Shift A or Shift B first.' });
      return;
    }

    if (!selectedShiftPersonnelIds.length) {
      setPersonnelShiftMessage({ type: 'error', text: 'Please select at least one personnel member.' });
      return;
    }

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

    setPersonnelShiftMessage({ type: '', text: '' });
    setIsShiftConfirmModalOpen(true);
  };

  const closeShiftConfirmModal = () => {
    if (isPersonnelShiftSaving) {
      return;
    }
    setIsShiftConfirmModalOpen(false);
  };

  const handleConfirmShiftAssignment = async () => {
    if (isPersonnelShiftSaving) {
      return;
    }
    setIsShiftConfirmModalOpen(false);
    await handleAssignPersonnelToShift();
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

    // A personnel member can only have one assignment in the active schedule period.
    const alreadyAssignedPersonnelIds = selectedShiftPersonnelIds.filter((personnelId) =>
      periodAssignments.some((assignment) => assignment.personnel_id === personnelId)
    );

    const assignablePersonnelIds = selectedShiftPersonnelIds.filter(
      (personnelId) => !alreadyAssignedPersonnelIds.includes(personnelId)
    );

    if (!assignablePersonnelIds.length) {
      const assignedNames = alreadyAssignedPersonnelIds
        .map((personnelId) => getPersonnelNameById(personnelId))
        .join(', ');

      setPersonnelShiftMessage({
        type: 'error',
        text: `Cannot assign Shift ${selectedShiftType}. These personnel already have an assignment in this schedule: ${assignedNames}.`
      });
      setIsPersonnelShiftSaving(false);
      return;
    }

    const { error: bulkAssignmentError } = await assignPersonnelToShiftBulk({
      personnelIds: assignablePersonnelIds,
      shiftType: selectedShiftType,
      startDate: formStartDate,
      endDate: formEndDate,
      assignedBy: currentUser?.admin_id || null
    });
    const assignmentResults = assignablePersonnelIds.map((personnelId) => ({
      personnelId,
      error: bulkAssignmentError
    }));

    const failedAssignments = assignmentResults.filter((row) => row.error);
    const successfulAssignments = assignmentResults.filter((row) => !row.error);

    if (successfulAssignments.length) {
      setIsPersonnelShiftReviewSaved(true);
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
    await loadShiftSummary(shiftSummaryMonth);

    if (!failedAssignments.length) {
      if (alreadyAssignedPersonnelIds.length) {
        const assignedNames = alreadyAssignedPersonnelIds
          .map((personnelId) => getPersonnelNameById(personnelId))
          .join(', ');

        setPersonnelShiftMessage({
          type: 'error',
          text: `Shift assignment saved for ${successfulAssignments.length} personnel. Already assigned and skipped: ${assignedNames}.`
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
        const assignedNames = alreadyAssignedPersonnelIds
          .map((personnelId) => getPersonnelNameById(personnelId))
          .join(', ');
        const firstFailureReason = failedAssignments[0]?.error || 'Unknown error';
        const assignedSuffix = assignedNames
          ? ` Already assigned: ${assignedNames}.`
          : '';

        setPersonnelShiftMessage({
          type: 'error',
          text: successfulAssignments.length
            ? `Assigned ${successfulAssignments.length} personnel. Failed for: ${failedNames}. Reason: ${firstFailureReason}.${assignedSuffix}`
            : `Failed to assign selected personnel: ${failedNames}. Reason: ${firstFailureReason}.${assignedSuffix}`
        });
      }
    }

    setIsPersonnelShiftSaving(false);
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

    await loadShiftAssignmentsForSchedule();
    await loadShiftSummary(shiftSummaryMonth);

    setPersonnelShiftMessage({ type: 'success', text: 'Shift assignment removed successfully.' });
  };

  const handleTogglePersonnelForShift = (personnel, checked) => {
    if (!personnel?.admin_id) {
      return;
    }

    if (checked && periodAssignments.some(
      (assignment) => assignment.personnel_id === personnel.admin_id
    )) {
      return;
    }

    setSelectedShiftPersonnelIds((currentIds) => checked
      ? Array.from(new Set([...currentIds, personnel.admin_id]))
      : currentIds.filter((id) => id !== personnel.admin_id)
    );
    setIsPersonnelShiftReviewSaved(false);
    setPersonnelShiftMessage({ type: '', text: '' });
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
    setSelectedShiftForAssignment('');
    setPersonnelShiftSearch('');
    setIsPersonnelShiftReviewSaved(false);
    setPersonnelShiftMessage({ type: '', text: '' });
    setIsShiftConfirmModalOpen(false);
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
    setIsShiftExitConfirmOpen(false);
    setShiftMessage({ type: '', text: '' });
  };

  const requestCloseShiftModal = () => {
    if (isShiftSaving) return;
    if (!isShiftScheduleDirty) {
      closeShiftModal();
      return;
    }
    setIsShiftExitConfirmOpen(true);
  };

  const handleKeepEditingShiftSchedule = () => {
    setIsShiftExitConfirmOpen(false);
    if (addPersonnelBlocker.state === 'blocked') {
      addPersonnelBlocker.reset();
    }
  };

  const handleDiscardShiftSchedule = () => {
    setIsShiftExitConfirmOpen(false);
    closeShiftModal();
    if (addPersonnelBlocker.state === 'blocked') {
      addPersonnelBlocker.proceed();
    }
  };

  const closePersonnelShiftModal = () => {
    if (isPersonnelShiftSaving) {
      return;
    }

    setIsShiftConfirmModalOpen(false);
    setIsPersonnelShiftModalOpen(false);
    setPersonnelShiftMessage({ type: '', text: '' });
    setSelectedShiftPersonnelIds([]);
    setSelectedShiftForAssignment('');
    setPersonnelShiftSearch('');
    setIsPersonnelShiftReviewSaved(false);
    setIsPersonnelShiftExitConfirmOpen(false);
    pendingPersonnelShiftNavigationRef.current = null;
  };

  const requestClosePersonnelShiftModal = () => {
    if (isPersonnelShiftSaving) {
      return;
    }

    if (!isPersonnelShiftDirty || isPersonnelShiftReviewSaved) {
      closePersonnelShiftModal();
      return;
    }

    pendingPersonnelShiftNavigationRef.current = { type: 'close' };
    setIsPersonnelShiftExitConfirmOpen(true);
  };

  const handleKeepEditingPersonnelShift = () => {
    pendingPersonnelShiftNavigationRef.current = null;
    setIsPersonnelShiftExitConfirmOpen(false);

    if (addPersonnelBlocker.state === 'blocked') {
      addPersonnelBlocker.reset();
    }
  };

  const handleDiscardPersonnelShift = () => {
    const pendingExit = pendingPersonnelShiftNavigationRef.current;
    pendingPersonnelShiftNavigationRef.current = null;
    setIsPersonnelShiftExitConfirmOpen(false);
    closePersonnelShiftModal();

    if (pendingExit?.type === 'manual') {
      if (addPersonnelBlocker.state === 'blocked') {
        addPersonnelBlocker.reset();
      }
      runAddManualNavigation(pendingExit.navigation);
      return;
    }

    if (addPersonnelBlocker.state === 'blocked') {
      addPersonnelBlocker.proceed();
    }
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
    await loadShiftSummary(shiftSummaryMonth);

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

    const { error } = selectedAccount.is_personnel_workspace_profile
      ? await updatePersonnelWorkspaceProfile(selectedAccount.admin_id, updates)
      : await updateUser(selectedAccount.admin_id, updates);

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
          && Boolean(account.is_personnel_workspace_profile)
            === Boolean(selectedAccount.is_personnel_workspace_profile)
          ? {
              ...account,
              ...updates
            }
          : account
      )
    );
    await loadShiftSummary(shiftSummaryMonth);

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

    const { error } = account.is_personnel_workspace_profile
      ? await updatePersonnelWorkspaceProfile(account.admin_id, updates)
      : await updateUser(account.admin_id, updates);
    if (error) {
      alert(`Failed to clear leave dates: ${error}`);
      return;
    }

    setAccounts((prev) =>
      prev.map((row) =>
        row.admin_id === account.admin_id
          && Boolean(row.is_personnel_workspace_profile)
            === Boolean(account.is_personnel_workspace_profile)
          ? {
              ...row,
              ...updates
            }
          : row
      )
    );
    await Promise.all([
      fetchAccounts(),
      loadShiftSummary(shiftSummaryMonth)
    ]);
    if (isDayDetailModalOpen && dayDetailDate) {
      await openDayDetailModal(dayDetailDate);
    }

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

    if (pendingConfirmAction.action === 'archive-request-history') {
      await executeArchiveHistoryItem(
        pendingConfirmAction.payload.type,
        pendingConfirmAction.payload.request
      );
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
  const filteredPersonnelAccounts = filteredAccounts.filter(isPersonnelAccount);
  const filteredAdminAccounts = filteredAccounts.filter((account) => !isPersonnelAccount(account));
  const personnelTotalPages = Math.max(1, Math.ceil(filteredPersonnelAccounts.length / ACCOUNT_PAGE_SIZE));
  const safePersonnelPage = Math.min(personnelPage, personnelTotalPages);
  const paginatedPersonnelAccounts = filteredPersonnelAccounts.slice(
    (safePersonnelPage - 1) * ACCOUNT_PAGE_SIZE,
    safePersonnelPage * ACCOUNT_PAGE_SIZE
  );
  const personnelRangeStart = filteredPersonnelAccounts.length === 0
    ? 0
    : (safePersonnelPage - 1) * ACCOUNT_PAGE_SIZE + 1;
  const adminTotalPages = Math.max(1, Math.ceil(filteredAdminAccounts.length / ACCOUNT_PAGE_SIZE));
  const safeAdminPage = Math.min(adminPage, adminTotalPages);
  const paginatedAdminAccounts = filteredAdminAccounts.slice(
    (safeAdminPage - 1) * ACCOUNT_PAGE_SIZE,
    safeAdminPage * ACCOUNT_PAGE_SIZE
  );
  const adminRangeStart = filteredAdminAccounts.length === 0
    ? 0
    : (safeAdminPage - 1) * ACCOUNT_PAGE_SIZE + 1;

  const getAccountActions = (account) => [
    ...(isPersonnelAccount(account)
      ? [{ key: 'set-leave', label: 'Set Leave', onSelect: () => openLeaveModal(account) }]
      : []),
    ...(isPersonnelAccount(account) && isOnLeave(account)
      ? [{ key: 'clear-leave', label: 'Clear Leave', onSelect: () => handleClearLeaveDate(account) }]
      : []),
    { key: 'edit', label: 'Edit', onSelect: () => openEditModal(account) },
    ...(String(account.role || '').trim().toLowerCase() !== 'admin'
      && !account.is_personnel_workspace_profile
      ? [{
        key: 'delete',
        label: 'Delete',
        destructive: true,
        onSelect: () => handleDeleteUser(account.admin_id || account.id)
      }]
      : [])
  ];
  const shiftSummaryCalendarCells = getCalendarCells(shiftSummaryMonth);
  const shiftSummaryMonthLabel = formatCalendarMonthLabel(shiftSummaryMonth);
  const shiftSummaryTodayIso = getManilaToday();
  const shiftSummaryRowsByDate = new Map(
    shiftSummaryRows.map((row) => [row.date, row])
  );

  const handleShiftSummaryMonthShift = (offset) => {
    setShiftSummaryMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const openDayDetailModal = async (isoDate) => {
    const requestId = dayDetailRequestIdRef.current + 1;
    dayDetailRequestIdRef.current = requestId;

    setDayDetailDate(isoDate);
    setIsDayDetailModalOpen(true);
    setDayDetailLoading(true);
    setDayDetailError('');
    setDayDetailData({ onDuty: [], onLeave: [] });

    const { data, error } = await getPersonnelForDate(isoDate);
    if (requestId !== dayDetailRequestIdRef.current) {
      return;
    }

    if (error) {
      setDayDetailError(error);
    } else {
      setDayDetailData({ onDuty: data?.onDuty || [], onLeave: data?.onLeave || [] });
    }

    setDayDetailLoading(false);
  };

  const closeDayDetailModal = () => {
    dayDetailRequestIdRef.current += 1;
    setIsDayDetailModalOpen(false);
    setDayDetailError('');
    setDayDetailData({ onDuty: [], onLeave: [] });
  };

  return (
    <div className="accounts-container">
      <Sidebar />

      <div className="accounts-main">
        <PageHeader
          title="Personnel"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNavigationRequest={handleAccountsHeaderNavigationRequest}
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
            <button className="add-personnel-btn" onClick={handleOpenAddModal}>
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
            <span><i className="legend-dot legend-on-duty" /> On Duty</span>
            <span><i className="legend-dot legend-on-leave" /> On Leave</span>
            <span><i className="legend-dot legend-off-duty" /> Off Duty</span>
          </div>

          <div className="shift-summary-calendar-scroll">
          <div className="shift-summary-calendar-grid shift-summary-calendar-weekdays">
            {CALENDAR_WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="shift-summary-calendar-grid shift-summary-calendar-days">
            {shiftSummaryLoading ? (
              <div className="shift-summary-calendar-loading">Loading shift schedule...</div>
            ) : shiftSummaryError ? (
              <div className="shift-summary-calendar-error" role="alert">
                Unable to load the personnel schedule: {shiftSummaryError}
              </div>
            ) : (
              shiftSummaryCalendarCells.map((dayDate, index) => {
                if (!dayDate) {
                  return <span key={`shift-empty-${index}`} className="shift-summary-calendar-empty" />;
                }

                const isoDate = toIsoDate(dayDate);
                const row = shiftSummaryRowsByDate.get(isoDate);
                const shiftLabel = row?.shift || 'Off Duty';
                const onDutyCount = row?.onDutyCount ?? 0;
                const onLeaveCount = row?.onLeaveCount ?? 0;
                const onDutyPersonnel = Array.isArray(row?.onDutyPersonnel)
                  ? row.onDutyPersonnel
                  : [];
                const visibleOnDutyPersonnel = onDutyPersonnel.slice(0, 2);
                const isPastDate = isoDate < shiftSummaryTodayIso;
                const isToday = isoDate === shiftSummaryTodayIso;
                const shiftClass = shiftLabel === 'Shift A'
                  ? 'shift-a'
                  : shiftLabel === 'Shift B'
                    ? 'shift-b'
                    : shiftLabel === 'Shift A & B'
                      ? 'shift-a-b'
                      : 'off-duty';

                return (
                  <div
                    key={isoDate}
                    className={`shift-summary-day ${shiftClass} ${isPastDate ? 'is-past-date' : ''} ${isToday ? 'today' : ''}`}
                    aria-label={`${row?.displayDate || isoDate}: ${shiftLabel}, On Duty ${onDutyCount}, On Leave ${onLeaveCount}${isPastDate ? ', past date, view details only' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDayDetailModal(isoDate)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDayDetailModal(isoDate);
                      }
                    }}
                  >
                    <div className="shift-summary-day-top">
                      <span className="shift-summary-day-number">{dayDate.getDate()}</span>
                      <span className={`shift-summary-shift-label ${shiftClass}`}>{shiftLabel}</span>
                    </div>
                    <div className="shift-summary-day-body">
                      <span className="shift-summary-stat shift-summary-stat-duty">On Duty ({onDutyCount})</span>
                      <div className="shift-summary-duty-names">
                        {visibleOnDutyPersonnel.length ? (
                          <>
                            {visibleOnDutyPersonnel.map((personnel) => (
                              <span key={personnel.admin_id} title={personnel.name}>
                                {personnel.name}
                              </span>
                            ))}
                            {onDutyPersonnel.length > visibleOnDutyPersonnel.length && (
                              <strong>+{onDutyPersonnel.length - visibleOnDutyPersonnel.length} more</strong>
                            )}
                          </>
                        ) : (
                          <span className="shift-summary-duty-empty">No personnel</span>
                        )}
                      </div>
                      <span className="shift-summary-stat shift-summary-stat-leave">On Leave: {onLeaveCount}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
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
                  {visiblePendingLeaveRequests.map((request) => {
                    const target = findPersonnelAccount(request.personnel_id);
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
          <div className="leave-approval-mobile-list">
  {visiblePendingLeaveRequests.map((request) => {
    const target = findPersonnelAccount(request.personnel_id);

    const isProcessing =
      processingRequestId === request.request_id;

    return (
      <div
        className="leave-request-card"
        key={request.request_id}
      >
        <h3>
          {target
            ? `${target.first_name} ${target.last_name}`
            : request.personnel_id}
        </h3>

        <p>
          <strong>Email</strong><br />
          {target?.email || "-"}
        </p>

        <p>
          <strong>Leave</strong><br />
          {formatLeaveDate(request.start_date)}
          {" - "}
          {formatLeaveDate(request.end_date)}
        </p>

        <p>
          <strong>Requested</strong><br />
          {new Date(request.created_at).toLocaleDateString()}
        </p>

        <div className="leave-card-actions">
          <button
            className="leave-approve-btn"
            onClick={() =>
              handleApproveLeaveRequest(request)
            }
            disabled={isProcessing}
          >
            Approve
          </button>

          <button
            className="leave-reject-btn"
            onClick={() =>
              handleRejectLeaveRequest(request)
            }
            disabled={isProcessing}
          >
            Reject
          </button>
        </div>
      </div>
    );
  })}
</div>
          <RequestSectionToggle
            expanded={expandedRequestSections.pendingLeave}
            itemCount={pendingLeaveRequests.length}
            label="leave requests"
            onToggle={() => toggleRequestSection('pendingLeave')}
          />
        </div>

        <div className="leave-approval-card leave-history-card">
          <div className="leave-approval-header">
            <h3>Leave Request History</h3>
            <div className="request-history-heading-actions">
              <span>
                {visibleLeaveRequestHistory.length} of {filteredLeaveRequestHistory.length} shown
              </span>
              <button
                type="button"
                className="request-archive-list-button"
                onClick={() => openRequestArchive('leave')}
              >
                <FaArchive aria-hidden="true" />
                Archive List
              </button>
            </div>
          </div>

          <div className="request-history-toolbar">
            <select
              className="profile-request-status-select"
              value={leaveHistoryStatusFilter}
              onChange={(event) => setLeaveHistoryStatusFilter(event.target.value)}
              aria-label="Filter leave request history by status"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input
              type="text"
              className="request-history-search"
              placeholder="Search by name, rank, or date"
              value={leaveHistorySearch}
              onChange={(event) => setLeaveHistorySearch(event.target.value)}
              aria-label="Search leave request history"
            />
          </div>

          {leaveHistoryMessage && (
            <div className="leave-approval-message">{leaveHistoryMessage}</div>
          )}

          {leaveHistoryLoading ? (
            <p className="leave-approval-empty">Loading leave request history...</p>
          ) : filteredLeaveRequestHistory.length === 0 ? (
            <p className="leave-approval-empty">No leave request history found.</p>
          ) : (
            <div className="leave-approval-table-wrap">
              <table className="leave-approval-table">
                <thead>
                  <tr>
                    <th>Personnel</th>
                    <th>Rank</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Date Requested</th>
                    <th>Date Reviewed</th>
                    <th>Reviewed By</th>
                    <th>Rejection Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLeaveRequestHistory.map((request) => (
                    <tr key={request.request_id}>
                      <td>{request.personnel_name || request.personnel_id}</td>
                      <td>{request.personnel_rank || '—'}</td>
                      <td>{formatLeaveDate(request.start_date)}</td>
                      <td>{formatLeaveDate(request.end_date)}</td>
                      <td>{request.reason || '—'}</td>
                      <td className="profile-request-status-cell">
                        <span className={`profile-request-status profile-request-status-${request.status}`}>
                          {formatRequestStatus(request.status)}
                        </span>
                      </td>
                      <td>
                        {request.created_at
                          ? new Date(request.created_at).toLocaleDateString('en-US')
                          : '—'}
                      </td>
                      <td>
                        {request.approved_at
                          ? new Date(request.approved_at).toLocaleDateString('en-US')
                          : '—'}
                      </td>
                      <td>{request.reviewed_by_name || '—'}</td>
                      <td>
                        {request.status === 'rejected'
                          ? (request.rejection_reason || '—')
                          : '—'}
                      </td>
                      <td>
                        {request.status !== 'pending' && (
                          <button
                            type="button"
                            className="request-row-icon-button"
                            onClick={() => requestArchiveHistoryItem('leave', request)}
                            aria-label={`Archive leave request for ${request.personnel_name || 'personnel'}`}
                            title="Archive request"
                          >
                            <FaArchive aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="leave-history-mobile-list">
            {visibleLeaveRequestHistory.map((request) => (
              <div className="leave-request-card" key={request.request_id}>
                <h3>{request.personnel_name || request.personnel_id}</h3>

                <p>
                  <strong>Rank</strong><br />
                  {request.personnel_rank || '—'}
                </p>

                <p>
                  <strong>Leave</strong><br />
                  {formatLeaveDate(request.start_date)}
                  {' - '}
                  {formatLeaveDate(request.end_date)}
                </p>

                <p>
                  <strong>Reason</strong><br />
                  {request.reason || '—'}
                </p>

                <p>
                  <strong>Status</strong><br />
                  <span className={`profile-request-status profile-request-status-${request.status}`}>
                    {formatRequestStatus(request.status)}
                  </span>
                </p>

                <p>
                  <strong>Date Requested</strong><br />
                  {request.created_at
                    ? new Date(request.created_at).toLocaleDateString('en-US')
                    : '—'}
                </p>

                <p>
                  <strong>Date Reviewed</strong><br />
                  {request.approved_at
                    ? new Date(request.approved_at).toLocaleDateString('en-US')
                    : '—'}
                </p>

                <p>
                  <strong>Reviewed By</strong><br />
                  {request.reviewed_by_name || '—'}
                </p>

                {request.status === 'rejected' && (
                  <p>
                    <strong>Rejection Reason</strong><br />
                    {request.rejection_reason || '—'}
                  </p>
                )}

                {request.status !== 'pending' && (
                  <button
                    type="button"
                    className="request-mobile-archive-button"
                    onClick={() => requestArchiveHistoryItem('leave', request)}
                  >
                    <FaArchive aria-hidden="true" />
                    Archive
                  </button>
                )}
              </div>
            ))}
          </div>
          <RequestSectionToggle
            expanded={expandedRequestSections.leaveHistory}
            itemCount={filteredLeaveRequestHistory.length}
            label="history entries"
            onToggle={() => toggleRequestSection('leaveHistory')}
          />
        </div>

        <div className="profile-request-card">
          <div className="leave-approval-header">
            <h3>Pending Profile Change Requests</h3>
            <span>{pendingProfileChangeRequestCount} pending</span>
          </div>

          {profileRequestMessage && (
            <div className="leave-approval-message">{profileRequestMessage}</div>
          )}

          {profileRequestsLoading ? (
            <p className="leave-approval-empty">Loading profile change requests...</p>
          ) : pendingProfileChangeRequests.length === 0 ? (
            <p className="leave-approval-empty">No pending profile change requests.</p>
          ) : (
            <div className="leave-approval-table-wrap">
              <table className="leave-approval-table">
                <thead>
                  <tr>
                    <th>Personnel</th>
                    <th>Requested Changes</th>
                    <th>Reason</th>
                    <th>Requested</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePendingProfileChangeRequests.map((request) => {
                    const isProcessing = processingProfileRequestId === request.request_id;

                    return (
                      <tr key={request.request_id}>
                        <td className="profile-request-personnel-cell">
                          <div className="profile-request-personnel">{request.personnel_name}</div>
                          <div className="profile-request-email">{request.personnel_email}</div>
                        </td>
                        <td><ProfileRequestChanges request={request} /></td>
                        <td>{request.reason || '—'}</td>
                        <td>{new Date(request.requested_at).toLocaleDateString('en-US')}</td>
                        <td>
                          <div className="profile-request-actions">
                            <button
                              className="leave-approve-btn"
                              type="button"
                              onClick={() => handleApproveProfileChangeRequest(request)}
                              disabled={isProcessing}
                            >
                              {isProcessing ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                              className="leave-reject-btn"
                              type="button"
                              onClick={() => handleRejectProfileChangeRequest(request)}
                              disabled={isProcessing}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="profile-request-mobile-list">
            {visiblePendingProfileChangeRequests.map((request) => {
              const isProcessing = processingProfileRequestId === request.request_id;

              return (
                <div className="leave-request-card" key={request.request_id}>
                  <h3>{request.personnel_name}</h3>

                  <ProfileRequestChanges request={request} />

                  {request.reason && (
                    <p>
                      <strong>Reason</strong><br />
                      {request.reason}
                    </p>
                  )}

                  <p>
                    <strong>Requested</strong><br />
                    {new Date(request.requested_at).toLocaleDateString('en-US')}
                  </p>

                  <div className="leave-card-actions">
                    <button
                      className="leave-approve-btn"
                      onClick={() => handleApproveProfileChangeRequest(request)}
                      disabled={isProcessing}
                    >
                      Approve
                    </button>
                    <button
                      className="leave-reject-btn"
                      onClick={() => handleRejectProfileChangeRequest(request)}
                      disabled={isProcessing}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <RequestSectionToggle
            expanded={expandedRequestSections.pendingProfile}
            itemCount={pendingProfileChangeRequests.length}
            label="profile requests"
            onToggle={() => toggleRequestSection('pendingProfile')}
          />
        </div>

        <div className="profile-request-card profile-history-card">
          <div className="leave-approval-header">
            <h3>Profile Change Request History</h3>
            <div className="request-history-heading-actions">
              <span>
                {visibleProfileChangeHistory.length} of {filteredProfileChangeHistory.length} shown
              </span>
              <button
                type="button"
                className="request-archive-list-button"
                onClick={() => openRequestArchive('profile')}
              >
                <FaArchive aria-hidden="true" />
                Archive List
              </button>
            </div>
          </div>

          <div className="request-history-toolbar">
            <select
              className="profile-request-status-select"
              value={profileHistoryStatusFilter}
              onChange={(event) => setProfileHistoryStatusFilter(event.target.value)}
              aria-label="Filter profile change history by status"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input
              type="text"
              className="request-history-search"
              placeholder="Search by name, field, or value"
              value={profileHistorySearch}
              onChange={(event) => setProfileHistorySearch(event.target.value)}
              aria-label="Search profile change request history"
            />
          </div>

          {profileRequestsLoading ? (
            <p className="leave-approval-empty">Loading profile change request history...</p>
          ) : filteredProfileChangeHistory.length === 0 ? (
            <p className="leave-approval-empty">No profile change request history found.</p>
          ) : (
            <div className="leave-approval-table-wrap">
              <table className="leave-approval-table">
                <thead>
                  <tr>
                    <th>Personnel</th>
                    <th>Requested Changes</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Date Requested</th>
                    <th>Date Reviewed</th>
                    <th>Reviewed By</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProfileChangeHistory.map((request) => (
                    <tr key={request.request_id}>
                      <td className="profile-request-personnel-cell">
                        <div className="profile-request-personnel">{request.personnel_name}</div>
                        <div className="profile-request-email">{request.personnel_email}</div>
                      </td>
                      <td><ProfileRequestChanges request={request} /></td>
                      <td>{request.reason || '—'}</td>
                      <td className="profile-request-status-cell">
                        <span className={`profile-request-status profile-request-status-${request.status}`}>
                          {formatRequestStatus(request.status)}
                        </span>
                      </td>
                      <td>
                        {request.requested_at
                          ? new Date(request.requested_at).toLocaleDateString('en-US')
                          : '—'}
                      </td>
                      <td>
                        {request.reviewed_at
                          ? new Date(request.reviewed_at).toLocaleDateString('en-US')
                          : '—'}
                      </td>
                      <td>{request.reviewed_by_name || '—'}</td>
                      <td>
                        {request.status !== 'pending' && (
                          <button
                            type="button"
                            className="request-row-icon-button"
                            onClick={() => requestArchiveHistoryItem('profile', request)}
                            aria-label={`Archive profile change request for ${request.personnel_name || 'personnel'}`}
                            title="Archive request"
                          >
                            <FaArchive aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="profile-history-mobile-list">
            {visibleProfileChangeHistory.map((request) => (
              <div className="leave-request-card" key={request.request_id}>
                <h3>{request.personnel_name}</h3>

                <ProfileRequestChanges request={request} />

                <p>
                  <strong>Reason</strong><br />
                  {request.reason || '—'}
                </p>

                <p>
                  <strong>Status</strong><br />
                  <span className={`profile-request-status profile-request-status-${request.status}`}>
                    {formatRequestStatus(request.status)}
                  </span>
                </p>

                <p>
                  <strong>Date Requested</strong><br />
                  {request.requested_at
                    ? new Date(request.requested_at).toLocaleDateString('en-US')
                    : '—'}
                </p>

                <p>
                  <strong>Date Reviewed</strong><br />
                  {request.reviewed_at
                    ? new Date(request.reviewed_at).toLocaleDateString('en-US')
                    : '—'}
                </p>

                <p>
                  <strong>Reviewed By</strong><br />
                  {request.reviewed_by_name || '—'}
                </p>

                {request.status !== 'pending' && (
                  <button
                    type="button"
                    className="request-mobile-archive-button"
                    onClick={() => requestArchiveHistoryItem('profile', request)}
                  >
                    <FaArchive aria-hidden="true" />
                    Archive
                  </button>
                )}
              </div>
            ))}
          </div>
          <RequestSectionToggle
            expanded={expandedRequestSections.profileHistory}
            itemCount={filteredProfileChangeHistory.length}
            label="history entries"
            onToggle={() => toggleRequestSection('profileHistory')}
          />
        </div>

        <section className="accounts-directory-section" aria-labelledby="personnel-directory-title">
          <div className="accounts-directory-header">
            <div>
              <p className="accounts-directory-eyebrow">Personnel directory</p>
              <h3 id="personnel-directory-title">Personnel List</h3>
            </div>
            <span className="accounts-directory-count">
              {filteredAccounts.length} {filteredAccounts.length === 1 ? 'account' : 'accounts'}
            </span>
          </div>

        <div className="accounts-filters">
          <div className="accounts-filter-item">
            <label>Search by Name</label>
            <input
              type="text"
              placeholder="Type a user name"
              value={personnelSearch}
              onChange={(event) => {
                setPersonnelSearch(event.target.value);
                setPersonnelPage(1);
                setAdminPage(1);
              }}
            />
          </div>

          <div className="accounts-filter-item">
            <label>Filter by Rank</label>
            <select
              value={rankFilter}
              onChange={(event) => {
                setRankFilter(event.target.value);
                setPersonnelPage(1);
                setAdminPage(1);
              }}
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
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPersonnelPage(1);
                setAdminPage(1);
              }}
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

        {loadingAccounts ? (
          <div className="account-directory-loading">Loading accounts...</div>
        ) : (
          <div className="accounts-directory-groups">
            <AccountDirectoryGroup
              title="Personnel Accounts"
              description="Operational personnel and their account status"
              accounts={paginatedPersonnelAccounts}
              totalCount={filteredPersonnelAccounts.length}
              startIndex={personnelRangeStart}
              emptyMessage="No personnel accounts match the selected filters."
              getAccountActions={getAccountActions}
              isOnLeave={isOnLeave}
              formatLeaveDate={formatLeaveDate}
              variant="personnel"
              page={safePersonnelPage}
              totalPages={personnelTotalPages}
              onPageChange={setPersonnelPage}
            />
            <AccountDirectoryGroup
              title="Admin Accounts"
              description="Administrative and management accounts"
              accounts={paginatedAdminAccounts}
              totalCount={filteredAdminAccounts.length}
              startIndex={adminRangeStart}
              emptyMessage="No admin accounts match the selected filters."
              getAccountActions={getAccountActions}
              isOnLeave={isOnLeave}
              formatLeaveDate={formatLeaveDate}
              variant="admin"
              page={safeAdminPage}
              totalPages={adminTotalPages}
              onPageChange={setAdminPage}
            />
          </div>
        )}
        </section>

        {isEditModalOpen && (
  <div className="accounts-modal-overlay" role="dialog">
    <div className="accounts-modal">
      <div className="accounts-modal-header">
        <h3>Edit Personnel</h3>
        <button onClick={() => setIsEditModalOpen(false)}>x</button>
      </div>

     <div className="accounts-modal-body">
  <div className="accounts-modal-grid">

    <div className="accounts-modal-field">
      <label>First Name</label>
      <input
        type="text"
        value={editFormData.first_name}
        onChange={(e) =>
          setEditFormData({
            ...editFormData,
            first_name: e.target.value.replace(/[^A-Za-z\s]/g, '')
          })
        }
        placeholder="Enter first name"
      />
    </div>


    <div className="accounts-modal-field">
      <label>Last Name</label>
      <input
        type="text"
        value={editFormData.last_name}
        onChange={(e) =>
          setEditFormData({
            ...editFormData,
            last_name: e.target.value.replace(/[^A-Za-z\s]/g, '')
          })
        }
        placeholder="Enter last name"
      />
    </div>


    <div className="accounts-modal-field">
      <label>Email Address</label>
      <input
        type="email"
        value={editFormData.email}
        onChange={(e) =>
          setEditFormData({
            ...editFormData,
            email: e.target.value
          })
        }
        placeholder="Enter email"
      />
    </div>


    <div className="accounts-modal-field">
      <label>Contact Number</label>
     <input
 
  type="text"
  inputMode="numeric"
  autoComplete="tel"
  placeholder="09XXXXXXXXX"
  value={editFormData.contact_number}
  onChange={(e) =>
    setEditFormData({
      ...editFormData,
      contact_number: e.target.value
        .replace(/\D/g, '') // only digits
        .slice(0, 11)      // limit to 11 digits
    })
  }
  maxLength={11}
  pattern="^09[0-9]{9}$"
  title="Must start with 09 and be exactly 11 digits"
/>
    </div>


    <div className="accounts-modal-field">
      <label>Role</label>
      <select
        value={editFormData.role}
        onChange={(e) =>
          setEditFormData({
            ...editFormData,
            role: e.target.value
          })
        }
      >
        <option value="personnel">Personnel</option>
        <option value="admin">Admin</option>
      </select>
    </div>


    <div className="accounts-modal-field">
      <label>Rank Designation</label>
      <select
        value={editFormData.rank}
        onChange={(e) =>
          setEditFormData({
            ...editFormData,
            rank: e.target.value
          })
        }
      >
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
      </select>
    </div>

  </div>
    {message.text && (
    <div className={`accounts-modal-message accounts-modal-message-${message.type}`}>
      {message.text}
    </div>
  )}
</div>

      <div className="accounts-modal-footer">
        <button className ="cancel-btn"onClick={() => setIsEditModalOpen(false)}>
          Cancel
        </button>
        <button className="save-btn" onClick={handleUpdatePersonnel}>
          Save Changes
        </button>
      </div>
    </div>
  </div>
)}

        {isAddModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-add-personnel-modal">
              <div className="accounts-modal-header">
                <h3>Add New Personnel Account</h3>
                <button
                  type="button"
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
                    <label htmlFor="personnel-first-name">
                      First Name <span className="accounts-required-mark" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="personnel-first-name"
                      type="text"
                      placeholder="First name"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      className={formErrors.first_name ? 'accounts-input-error' : ''}
                      required
                      aria-invalid={Boolean(formErrors.first_name)}
                      aria-describedby={formErrors.first_name ? 'personnel-first-name-error' : undefined}
                      pattern="[A-Za-z]+"
                      title="Use letters only"
                    />
                    {formErrors.first_name && (
                      <span id="personnel-first-name-error" className="accounts-field-error" role="alert">
                        {formErrors.first_name}
                      </span>
                    )}
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-last-name">
                      Last Name <span className="accounts-required-mark" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="personnel-last-name"
                      type="text"
                      placeholder="Last name"
                      value={formData.last_name}
                      onChange={handleInputChange}
                      className={formErrors.last_name ? 'accounts-input-error' : ''}
                      required
                      aria-invalid={Boolean(formErrors.last_name)}
                      aria-describedby={formErrors.last_name ? 'personnel-last-name-error' : undefined}
                      pattern="[A-Za-z]+"
                      title="Use letters only"
                    />
                    {formErrors.last_name && (
                      <span id="personnel-last-name-error" className="accounts-field-error" role="alert">
                        {formErrors.last_name}
                      </span>
                    )}
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-email">
                      Email Address <span className="accounts-required-mark" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="personnel-email"
                      type="email"
                      placeholder="youremail@gmail.com"
                      value={formData.email}
                      onChange={handleInputChange}
                      className={formErrors.email ? 'accounts-input-error' : ''}
                      required
                      aria-invalid={Boolean(formErrors.email)}
                      aria-describedby={formErrors.email ? 'personnel-email-error' : undefined}
                    />
                    {formErrors.email && (
                      <span id="personnel-email-error" className="accounts-field-error" role="alert">
                        {formErrors.email}
                      </span>
                    )}
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-role">
                      Role <span className="accounts-required-mark" aria-hidden="true">*</span>
                    </label>
                    <select 
                      id="personnel-role" 
                      value={formData.role}
                      onChange={handleInputChange}
                      className={formErrors.role ? 'accounts-input-error' : ''}
                      required
                      aria-invalid={Boolean(formErrors.role)}
                      aria-describedby={formErrors.role ? 'personnel-role-error' : undefined}
                    >
                      <option value="">Select a role...</option>
                      <option value="admin">Admin</option>
                      <option value="personnel">Personnel</option>
                    </select>
                    {formErrors.role && (
                      <span id="personnel-role-error" className="accounts-field-error" role="alert">
                        {formErrors.role}
                      </span>
                    )}
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-rank">
                      Rank Designation <span className="accounts-required-mark" aria-hidden="true">*</span>
                    </label>
                    <select 
                      id="personnel-rank"
                      value={formData.rank}
                      onChange={handleInputChange}
                      className={formErrors.rank ? 'accounts-input-error' : ''}
                      required
                      aria-invalid={Boolean(formErrors.rank)}
                      aria-describedby={formErrors.rank ? 'personnel-rank-error' : undefined}
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
                    {formErrors.rank && (
                      <span id="personnel-rank-error" className="accounts-field-error" role="alert">
                        {formErrors.rank}
                      </span>
                    )}
                  </div>
                  {formData.rank === 'OTHER' && (
                    <div className="accounts-modal-field">
                      <label htmlFor="personnel-rank-custom">
                        Custom Rank <span className="accounts-required-mark" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="personnel-rank-custom"
                        type="text"
                        placeholder="Enter custom rank"
                        value={formData.rank_custom}
                        onChange={handleInputChange}
                        className={formErrors.rank_custom ? 'accounts-input-error' : ''}
                        required
                        aria-invalid={Boolean(formErrors.rank_custom)}
                        aria-describedby={formErrors.rank_custom ? 'personnel-rank-custom-error' : undefined}
                      />
                      {formErrors.rank_custom && (
                        <span id="personnel-rank-custom-error" className="accounts-field-error" role="alert">
                          {formErrors.rank_custom}
                        </span>
                      )}
                    </div>
                  )}
                   <div className="accounts-modal-field">
                    <label htmlFor="personnel-contact-number">
                      Contact Number <span className="accounts-required-mark" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="personnel-contact-number"
                      type="text"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="09XXXXXXXXX"
                      value={formData.contact_number}
                      onChange={handleInputChange}
                      className={formErrors.contact_number ? 'accounts-input-error' : ''}
                      required
                      aria-invalid={Boolean(formErrors.contact_number)}
                      aria-describedby={formErrors.contact_number ? 'personnel-contact-number-error' : undefined}
                      maxLength={11}
                      pattern="^09[0-9]{9}$"
                      title="Must start with 09 and be exactly 11 digits"
                    />
                    {formErrors.contact_number && (
                      <span id="personnel-contact-number-error" className="accounts-field-error" role="alert">
                        {formErrors.contact_number}
                      </span>
                    )}
                  </div>

                  <div className="accounts-invite-notice">
                    An activation link will be sent to this email address. The personnel must set a password from that link before signing in.
                  </div>

                </div>

                {message.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${message.type}`}>
                    {message.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button type="button" className="accounts-modal-draft" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button 
                  type="button"
                  className="accounts-modal-add"
                  onClick={handleAddPersonnel}
                  disabled={isLoading || !isAddPersonnelFormValid}
                >
                  {isLoading ? 'Sending Invite...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        {hasPendingAddExit && (
          <div
            className="accounts-modal-overlay accounts-unsaved-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="accountsUnsavedTitle"
            aria-describedby="accountsUnsavedDescription"
          >
            <div className="accounts-modal accounts-unsaved-modal">
              <div className="accounts-modal-header">
                <h3 id="accountsUnsavedTitle">Discard unsaved personnel details?</h3>
                <button
                  type="button"
                  className="accounts-modal-close"
                  onClick={handleKeepEditingAddPersonnel}
                  aria-label="Keep editing personnel details"
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <p id="accountsUnsavedDescription" className="accounts-unsaved-message">
                  You have unsaved changes in the new personnel account form. Are you sure you want to discard them and leave?
                </p>
              </div>

              <div className="accounts-modal-footer">
                <button
                  type="button"
                  className="accounts-modal-draft"
                  onClick={handleKeepEditingAddPersonnel}
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  className="accounts-modal-discard"
                  onClick={handleDiscardAddPersonnel}
                >
                  Discard Changes
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
                  onClick={requestCloseShiftModal}
                  aria-label="Close shift schedule modal"
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <div className="shift-picker-setup">
                  <h4>Select a shift, then click calendar dates to toggle duty days.</h4>

                  <div className="shift-picker-controls">
                    <div className="shift-picker-tabs" role="tablist" aria-label="Shift selector">
                      <button
                        className={`shift-picker-tab shift-picker-tab-a ${activeShift === 'A' ? 'active' : ''}`}
                        onClick={() => setActiveShift('A')}
                        type="button"
                      >
                        Shift A
                      </button>
                      <button
                        className={`shift-picker-tab shift-picker-tab-b ${activeShift === 'B' ? 'active' : ''}`}
                        onClick={() => setActiveShift('B')}
                        type="button"
                      >
                        Shift B
                      </button>
                    </div>

                    <button
                      className="shift-picker-clear"
                      type="button"
                      onClick={resetActiveShiftDates}
                      title="Clear today and future dates; historical dates are preserved"
                    >
                      Clear {activeShift}
                    </button>
                  </div>

                  <div className="shift-selection-summary">
                    <p className="shift-selection-summary-a"><strong>Shift A:</strong> {formatShiftDateList(shiftSelection.shift_a_dates)}</p>
                    <p className="shift-selection-summary-b"><strong>Shift B:</strong> {formatShiftDateList(shiftSelection.shift_b_dates)}</p>
                  </div>

                  <div className="shift-selection-legend">
                    <span><i className="legend-dot legend-shift-a" /> Shift A date</span>
                    <span><i className="legend-dot legend-shift-b" /> Shift B date</span>
                    <span><i className="legend-dot legend-active" /> Active shift selection</span>
                  </div>
                </div>

                <div className="shift-calendar-editor">
                  <div className="shift-calendar-header">
                  <button
                    className="shift-calendar-nav"
                    type="button"
                    aria-label="Previous shift calendar month"
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
                    aria-label="Next shift calendar month"
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
                      const isPastDate = isoDate < shiftSummaryTodayIso;

                      return (
                        <button
                          key={isoDate}
                          type="button"
                          className={`shift-calendar-day ${selectedA ? 'shift-a' : ''} ${selectedB ? 'shift-b' : ''} ${selectedActive ? 'active' : ''} ${isPastDate ? 'is-past-date' : ''}`}
                          onClick={() => toggleCalendarDate(dayDate)}
                          disabled={isPastDate}
                          aria-label={`${isoDate}${selectedA ? ', Shift A' : ''}${selectedB ? ', Shift B' : ''}${isPastDate ? ', past date, editing disabled' : ''}`}
                          title={`${isoDate}${selectedA ? ' - Shift A' : ''}${selectedB ? ' - Shift B' : ''}${isPastDate ? ' - Past date (editing disabled)' : ''}`}
                        >
                          {dayDate.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {shiftMessage.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${shiftMessage.type}`}>
                    {shiftMessage.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={requestCloseShiftModal} disabled={isShiftSaving}>
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
          <div
            className="accounts-modal-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) requestClosePersonnelShiftModal();
            }}
          >
            <div className="accounts-modal accounts-shift-modal accounts-personnel-shift-modal">
              <div className="accounts-modal-header">
                <h3>Assign Personnel to Shifts</h3>
                <button
                  className="accounts-modal-close"
                  type="button"
                  onClick={requestClosePersonnelShiftModal}
                  aria-label="Close shift assignment"
                  disabled={isPersonnelShiftSaving}
                >
                  <FaTimes aria-hidden="true" />
                </button>
              </div>

              <div className="accounts-modal-body">
                <section className="shift-assignment-step">
                  <div className="shift-assignment-step-heading">
                    <span className="shift-assignment-step-number">1</span>
                    <div>
                      <h4>Select Shift</h4>
                      <p>Choose the shift before selecting personnel.</p>
                    </div>
                  </div>

                  <div className="shift-type-selector" role="group" aria-label="Select shift">
                    {['A', 'B'].map((shiftType) => {
                      const dateCount = shiftType === 'A'
                        ? shiftSchedule.shift_a_dates?.length || 0
                        : shiftSchedule.shift_b_dates?.length || 0;

                      return (
                        <button
                          key={shiftType}
                          type="button"
                          className={`shift-type-option shift-type-option-${shiftType.toLowerCase()} ${selectedShiftForAssignment === shiftType ? 'active' : ''}`}
                          onClick={() => handleSelectShiftForAssignment(shiftType)}
                          disabled={!dateCount}
                          aria-pressed={selectedShiftForAssignment === shiftType}
                        >
                          <span>Shift {shiftType}</span>
                          <small>
                            {dateCount
                              ? `${dateCount} ${dateCount === 1 ? 'date' : 'dates'}`
                              : 'No dates set'}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className={`shift-assignment-step ${!selectedShiftForAssignment ? 'is-disabled' : ''}`}>
                  <div className="shift-assignment-step-heading">
                    <span className="shift-assignment-step-number">2</span>
                    <div>
                      <h4>Select Personnel</h4>
                      <p>
                        {selectedShiftForAssignment
                          ? `Assigning personnel to Shift ${selectedShiftForAssignment}.`
                          : 'Select Shift A or Shift B to continue.'}
                      </p>
                    </div>
                  </div>

                  <div className="shift-personnel-workspace">
                    <div className={`shift-personnel-selector shift-personnel-selector-${selectedShiftForAssignment.toLowerCase()}`}>
                      <div className="shift-personnel-toolbar">
                        <label className="shift-personnel-search" htmlFor="personnel-shift-search">
                          <FaSearch aria-hidden="true" />
                          <input
                            id="personnel-shift-search"
                            type="search"
                            value={personnelShiftSearch}
                            onChange={(event) => setPersonnelShiftSearch(event.target.value)}
                            placeholder="Search name, rank, or email"
                            disabled={!selectedShiftForAssignment}
                          />
                        </label>
                        <div className="shift-personnel-toolbar-actions">
                          <button
                            type="button"
                            onClick={handleToggleVisiblePersonnel}
                            disabled={!selectedShiftForAssignment || !visibleAssignablePersonnelIds.length}
                          >
                            {allVisiblePersonnelSelected ? 'Deselect Results' : 'Select Results'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedShiftPersonnelIds([])}
                            disabled={!selectedShiftPersonnelIds.length}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="shift-personnel-list-meta">
                        <span>{personnelShiftCandidates.length} personnel</span>
                        <strong>{selectedShiftPersonnelIds.length} selected</strong>
                      </div>

                      <div className="shift-personnel-checkbox-list">
                        {!selectedShiftForAssignment ? (
                          <div className="shift-personnel-empty">Select a shift to open the personnel list.</div>
                        ) : personnelShiftCandidates.length === 0 ? (
                          <div className="shift-personnel-empty">No personnel match your search.</div>
                        ) : personnelShiftCandidates.map((account) => {
                          const existingAssignment = periodAssignments.find(
                            (assignment) => assignment.personnel_id === account.admin_id
                          );
                          const assignedShift = String(existingAssignment?.shift_type || '').toUpperCase();
                          const isUnavailable = Boolean(existingAssignment);

                          return (
                            <label
                              key={account.admin_id}
                              className={`shift-personnel-checkbox-item ${isUnavailable ? 'is-unavailable' : ''}`}
                            >
                              <input
                                type="checkbox"
                                className="shift-personnel-checkbox-input"
                                checked={selectedShiftPersonnelIds.includes(account.admin_id)}
                                disabled={isUnavailable}
                                onChange={(event) => {
                                  handleTogglePersonnelForShift(account, event.target.checked);
                                }}
                              />
                              <span className="shift-personnel-checkbox-info">
                                <span className="shift-personnel-checkbox-name">
                                  {formatPersonnelName(account)}
                                </span>
                                <span className="shift-personnel-checkbox-rank">
                                  {account.rank || 'N/A'}
                                </span>
                              </span>
                              {assignedShift && (
                                <span className={`shift-personnel-assigned-tag shift-personnel-assigned-tag-${assignedShift.toLowerCase()}`}>
                                  Shift {assignedShift}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <aside className={`shift-selected-review shift-selected-review-${selectedShiftForAssignment.toLowerCase()}`}>
                      <div className="shift-selected-review-header">
                        <h5>Selected for Shift {selectedShiftForAssignment || '-'}</h5>
                        <span>{selectedShiftPersonnelRows.length}</span>
                      </div>
                      <div className="shift-selected-review-list">
                        {selectedShiftPersonnelRows.length ? (
                          selectedShiftPersonnelRows.map((personnel) => (
                            <div key={personnel.admin_id} className="shift-selected-review-item">
                              <span>
                                <strong>{formatPersonnelName(personnel)}</strong>
                                <small>{personnel.rank || 'N/A'}</small>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleTogglePersonnelForShift(personnel, false)}
                                aria-label={`Remove ${formatPersonnelName(personnel)} from selection`}
                                title="Remove from selection"
                              >
                                <FaTimes aria-hidden="true" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="shift-personnel-empty">No personnel selected.</div>
                        )}
                      </div>
                    </aside>
                  </div>
                </section>

                <section className="shift-current-assignments">
                  <div className="shift-current-assignments-heading">
                    <h4>Current Schedule Assignments</h4>
                    <span>{periodAssignments.length} assignment{periodAssignments.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="shift-overview-grid">
                  <div className="shift-overview-col shift-overview-col-a">
                    <div className="shift-overview-header shift-overview-header-a">Shift A</div>
                    <div className="shift-overview-list">
                      {(() => {
                        const ids = Array.from(new Set(periodAssignments
                          .filter(a => String(a.shift_type || '').toUpperCase() === 'A')
                          .map(a => a.personnel_id)
                        ));
                        return ids.length ? (
                          <>
                            <div className="shift-overview-count">{ids.length} personnel assigned</div>
                            {ids.map((personnelId) => {
                              const assignment = periodAssignments.find((row) =>
                                row.personnel_id === personnelId
                                  && String(row.shift_type || '').toUpperCase() === 'A'
                              );

                              return (
                                <div key={personnelId} className="shift-overview-item">
                                  <span>{getPersonnelNameById(personnelId)}</span>
                                  {assignment?.assignment_id && (
                                    <button
                                      className="shift-overview-remove"
                                      type="button"
                                      onClick={() => handleRemoveShiftAssignment(assignment.assignment_id)}
                                      aria-label={`Remove ${getPersonnelNameById(personnelId)} from Shift A`}
                                      title="Remove assignment"
                                    >
                                      <FaTimes aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <div className="shift-overview-empty">No personnel assigned</div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="shift-overview-col shift-overview-col-b">
                    <div className="shift-overview-header shift-overview-header-b">Shift B</div>
                    <div className="shift-overview-list">
                      {(() => {
                        const ids = Array.from(new Set(periodAssignments
                          .filter(a => String(a.shift_type || '').toUpperCase() === 'B')
                          .map(a => a.personnel_id)
                        ));
                        return ids.length ? (
                          <>
                            <div className="shift-overview-count">{ids.length} personnel assigned</div>
                            {ids.map((personnelId) => {
                              const assignment = periodAssignments.find((row) =>
                                row.personnel_id === personnelId
                                  && String(row.shift_type || '').toUpperCase() === 'B'
                              );

                              return (
                                <div key={personnelId} className="shift-overview-item">
                                  <span>{getPersonnelNameById(personnelId)}</span>
                                  {assignment?.assignment_id && (
                                    <button
                                      className="shift-overview-remove"
                                      type="button"
                                      onClick={() => handleRemoveShiftAssignment(assignment.assignment_id)}
                                      aria-label={`Remove ${getPersonnelNameById(personnelId)} from Shift B`}
                                      title="Remove assignment"
                                    >
                                      <FaTimes aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <div className="shift-overview-empty">No personnel assigned</div>
                        );
                      })()}
                    </div>
                  </div>
                  </div>
                </section>

                {personnelShiftMessage.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${personnelShiftMessage.type}`}>
                    {personnelShiftMessage.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button
                  className="accounts-modal-add"
                  type="button"
                  onClick={isPersonnelShiftReviewSaved ? closePersonnelShiftModal : openShiftConfirmModal}
                  disabled={
                    isPersonnelShiftSaving
                    || (!isPersonnelShiftReviewSaved
                      && (!selectedShiftForAssignment || !selectedShiftPersonnelIds.length))
                  }
                >
                  {isPersonnelShiftSaving
                    ? 'Assigning...'
                    : isPersonnelShiftReviewSaved
                      ? 'Save'
                      : `Review ${selectedShiftPersonnelIds.length} ${selectedShiftPersonnelIds.length === 1 ? 'Assignment' : 'Assignments'}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {isShiftConfirmModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-shift-confirm-modal">
              <div className="accounts-modal-header">
                <h3>Confirm Shift Assignments</h3>
              </div>

              <div className="accounts-modal-body">
                <div className="shift-overview-grid">
                  <div className="shift-overview-col shift-overview-col-a">
                    <div className="shift-overview-header shift-overview-header-a">Shift A</div>
                    <div className="shift-overview-list">
                      {shiftConfirmPreview.shiftA.length ? (
                        shiftConfirmPreview.shiftA.map((person) => (
                          <div key={person.id} className="shift-overview-item">
                            <span>
                              <span className="shift-overview-item-name">{person.name}</span>
                              <span className="shift-overview-item-rank">{person.rank}</span>
                            </span>
                            {person.pending && <span className="shift-pending-tag">Pending</span>}
                          </div>
                        ))
                      ) : (
                        <div className="shift-overview-empty">No personnel assigned</div>
                      )}
                    </div>
                  </div>

                  <div className="shift-overview-col shift-overview-col-b">
                    <div className="shift-overview-header shift-overview-header-b">Shift B</div>
                    <div className="shift-overview-list">
                      {shiftConfirmPreview.shiftB.length ? (
                        shiftConfirmPreview.shiftB.map((person) => (
                          <div key={person.id} className="shift-overview-item">
                            <span>
                              <span className="shift-overview-item-name">{person.name}</span>
                              <span className="shift-overview-item-rank">{person.rank}</span>
                            </span>
                            {person.pending && <span className="shift-pending-tag">Pending</span>}
                          </div>
                        ))
                      ) : (
                        <div className="shift-overview-empty">No personnel assigned</div>
                      )}
                    </div>
                  </div>
                </div>

                {shiftConfirmPreview.skippedCount > 0 && (
                  <p className="shift-confirm-warning">
                    {shiftConfirmPreview.skippedCount} selected personnel will be skipped &mdash; already assigned to the opposite shift this period.
                  </p>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={closeShiftConfirmModal} disabled={isPersonnelShiftSaving}>
                  Back to Edit
                </button>
                <button className="accounts-modal-add" onClick={handleConfirmShiftAssignment} disabled={isPersonnelShiftSaving}>
                  {isPersonnelShiftSaving ? 'Saving...' : 'Save Assignments'}
                </button>
              </div>
            </div>
          </div>
        )}

        {hasPendingShiftScheduleExit && (
          <div
            className="accounts-modal-overlay accounts-unsaved-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="shiftScheduleUnsavedTitle"
            aria-describedby="shiftScheduleUnsavedDescription"
          >
            <div className="accounts-modal accounts-unsaved-modal">
              <div className="accounts-modal-header">
                <h3 id="shiftScheduleUnsavedTitle">Discard unsaved shift dates?</h3>
              </div>

              <div className="accounts-modal-body">
                <p id="shiftScheduleUnsavedDescription" className="accounts-unsaved-message">
                  Your shift date changes have not been saved. Are you sure you want to discard them and leave?
                </p>
              </div>

              <div className="accounts-modal-footer">
                <button
                  type="button"
                  className="accounts-modal-draft"
                  onClick={handleKeepEditingShiftSchedule}
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  className="accounts-modal-discard"
                  onClick={handleDiscardShiftSchedule}
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {hasPendingPersonnelShiftExit && (
          <div
            className="accounts-modal-overlay accounts-unsaved-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="personnelShiftUnsavedTitle"
            aria-describedby="personnelShiftUnsavedDescription"
          >
            <div className="accounts-modal accounts-unsaved-modal">
              <div className="accounts-modal-header">
                <h3 id="personnelShiftUnsavedTitle">Discard pending shift changes?</h3>
              </div>

              <div className="accounts-modal-body">
                <p id="personnelShiftUnsavedDescription" className="accounts-unsaved-message">
                  Your personnel selection and shift choice have not been assigned yet. Are you sure you want to discard them and leave?
                </p>
              </div>

              <div className="accounts-modal-footer">
                <button
                  type="button"
                  className="accounts-modal-draft"
                  onClick={handleKeepEditingPersonnelShift}
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  className="accounts-modal-discard"
                  onClick={handleDiscardPersonnelShift}
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {requestArchiveType && (
          <div
            className="accounts-modal-overlay request-archive-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="requestArchiveTitle"
          >
            <div className="accounts-modal request-archive-modal">
              <div className="accounts-modal-header">
                <div>
                  <span className="request-archive-eyebrow">Archived history</span>
                  <h3 id="requestArchiveTitle">
                    {requestArchiveType === 'leave'
                      ? 'Leave Request Archive'
                      : 'Profile Change Request Archive'}
                  </h3>
                </div>
                <button
                  type="button"
                  className="accounts-modal-close"
                  onClick={closeRequestArchive}
                  aria-label="Close request archive"
                  disabled={Boolean(processingArchiveRequestId)}
                >
                  <FaTimes aria-hidden="true" />
                </button>
              </div>

              <div className="accounts-modal-body request-archive-body">
                {requestArchiveMessage && (
                  <div className="accounts-modal-message accounts-modal-message-error">
                    {requestArchiveMessage}
                  </div>
                )}

                {requestArchiveLoading ? (
                  <p className="leave-approval-empty">Loading archived requests...</p>
                ) : (
                  (requestArchiveType === 'leave'
                    ? archivedLeaveRequests
                    : archivedProfileChangeRequests
                  ).length === 0 ? (
                    <p className="leave-approval-empty">No archived requests.</p>
                  ) : (
                    <div className="request-archive-list">
                      {(requestArchiveType === 'leave'
                        ? archivedLeaveRequests
                        : archivedProfileChangeRequests
                      ).map((request) => (
                        <article className="request-archive-item" key={request.request_id}>
                          <div className="request-archive-item-main">
                            <div className="request-archive-item-heading">
                              <strong>{request.personnel_name || request.personnel_id}</strong>
                              <span className={`profile-request-status profile-request-status-${request.status}`}>
                                {formatRequestStatus(request.status)}
                              </span>
                            </div>

                            {requestArchiveType === 'leave' ? (
                              <p>
                                {formatLeaveDate(request.start_date)} to {formatLeaveDate(request.end_date)}
                                {request.reason ? ` · ${request.reason}` : ''}
                              </p>
                            ) : (
                              <ProfileRequestChanges request={request} />
                            )}

                            <small>
                              Archived {request.archived_at
                                ? new Date(request.archived_at).toLocaleDateString('en-US')
                                : '—'}
                              {request.archived_by_name ? ` by ${request.archived_by_name}` : ''}
                            </small>
                          </div>

                          <button
                            type="button"
                            className="request-restore-button"
                            onClick={() => handleRestoreHistoryItem(requestArchiveType, request)}
                            disabled={Boolean(processingArchiveRequestId)}
                            aria-label={`Restore request for ${request.personnel_name || 'personnel'}`}
                          >
                            <FaUndo aria-hidden="true" />
                            {processingArchiveRequestId === request.request_id ? 'Restoring...' : 'Restore'}
                          </button>
                        </article>
                      ))}
                    </div>
                  )
                )}
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

        {isDayDetailModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal accounts-day-detail-modal">
              <div className="accounts-modal-header">
                <h3>{dayDetailDate ? formatLeaveDate(dayDetailDate) : 'Personnel for Date'}</h3>
                <button
                  className="accounts-modal-close"
                  onClick={closeDayDetailModal}
                  aria-label="Close personnel detail modal"
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                {dayDetailLoading ? (
                  <p className="leave-approval-empty">Loading personnel for this date...</p>
                ) : dayDetailError ? (
                  <div className="accounts-modal-message accounts-modal-message-error">
                    Unable to load personnel for this date: {dayDetailError}
                  </div>
                ) : (
                  <>
                    <div className="day-detail-section">
                      <h4>On Duty ({dayDetailData.onDuty.length})</h4>
                      {dayDetailData.onDuty.length === 0 ? (
                        <p className="leave-approval-empty">No personnel on duty for this date.</p>
                      ) : (
                        <div className="leave-approval-table-wrap">
                          <table className="leave-approval-table">
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Rank</th>
                                <th>Time In</th>
                                <th>Time Out</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dayDetailData.onDuty.map((person) => (
                                <tr key={person.admin_id}>
                                  <td>{person.name}</td>
                                  <td>{person.rank}</td>
                                  <td>{person.time_in || '-'}</td>
                                  <td>{person.time_out || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="day-detail-section">
                      <h4>On Leave ({dayDetailData.onLeave.length})</h4>
                      {dayDetailData.onLeave.length === 0 ? (
                        <p className="leave-approval-empty">No personnel on leave for this date.</p>
                      ) : (
                        <div className="leave-approval-table-wrap">
                          <table className="leave-approval-table">
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Rank</th>
                                <th>Leave Start</th>
                                <th>Leave End</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dayDetailData.onLeave.map((person) => (
                                <tr key={person.admin_id}>
                                  <td>{person.name}</td>
                                  <td>{person.rank}</td>
                                  <td>{formatLeaveDate(person.leave_start_date)}</td>
                                  <td>{formatLeaveDate(person.leave_end_date)}</td>
                                  <td>{person.approval_status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
