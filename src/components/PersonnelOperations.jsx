import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import ExpandableText from './ExpandableText';
import { useUser } from '../context/UserContext';
import {
  getPersonnelLeaveRequest,
  submitPersonnelLeaveRequest,
  getPersonnelShiftSchedule,
  getPersonnelForDate,
  getPersonnelShiftAssignments,
  resolveCurrentShiftType,
  getReliefCandidates,
  calculateLeaveDays,
  isValidLeaveContactNumber,
  isAllowedLeaveDocument,
  LEAVE_TYPES,
  LEAVE_TYPES_REQUIRING_DOCUMENT,
  LEAVE_DOCUMENT_ACCEPT,
  LEAVE_DOCUMENT_MAX_SIZE_BYTES,
  RELIEVER_ADMIN_ASSIGN_VALUE
} from '../utils/personnelOperationsService';
import { getManilaToday } from '../utils/dateUtils';
import { logPersonnelActivity } from '../utils/activityLogService';
import { formatStatusLabel } from '../utils/statusUtils';
import './PersonnelOperations.css';

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


const formatDate = (value) => {
  if (!value) return '-';

  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return value;
  }
};

// Timestamp columns (created_at, approved_at) already include a time
// component, unlike the date-only columns formatDate above handles.
const formatDateTime = (value) => {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return value;
  }
};

const laterIso = (a, b) => (a > b ? a : b);

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const EMPTY_LEAVE_FORM = {
  leaveType: '',
  otherLeaveType: '',
  startDate: '',
  endDate: '',
  reason: '',
  contactNumber: '',
  relieverValue: '',
  documentFile: null
};

const computeLeaveFormErrors = (form, todayIso) => {
  const errors = {};

  if (!form.leaveType) {
    errors.leaveType = 'Please select a leave type.';
  }

  if (form.leaveType === 'Other' && !form.otherLeaveType.trim()) {
    errors.otherLeaveType = 'Please specify the leave type.';
  }

  if (!form.startDate) {
    errors.startDate = 'Leave start date is required.';
  } else if (form.startDate < todayIso) {
    errors.startDate = 'Leave start date cannot be in the past.';
  }

  if (!form.endDate) {
    errors.endDate = 'Leave end date is required.';
  } else if (form.endDate < todayIso) {
    errors.endDate = 'Leave end date cannot be in the past.';
  } else if (form.startDate && form.endDate < form.startDate) {
    errors.endDate = 'Leave end date must be on or after the start date.';
  }

  if (!form.reason.trim()) {
    errors.reason = 'Please provide a reason for leave.';
  }

  if (form.contactNumber && !isValidLeaveContactNumber(form.contactNumber)) {
    errors.contactNumber = 'Please enter a valid contact number.';
  }

  if (LEAVE_TYPES_REQUIRING_DOCUMENT.has(form.leaveType) && !form.documentFile) {
    errors.documentFile = `A supporting document is required for ${form.leaveType}.`;
  }

  return errors;
};

const formatRelieverLabel = (item) => {
  if (!item || !item.reliever_type) return null;
  if (item.reliever_type === 'admin_assign') return 'To be assigned by Admin';
  if (item.reliever_type === 'personnel') return item.reliever_name || 'Personnel';
  return null;
};

const formatFileSize = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function PersonnelOperations() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [leaveRequest, setLeaveRequest] = useState({
    current_status: 'Active',
    leave_start_date: null,
    leave_end_date: null,
    latest_request: null,
    history: []
  });
  const [leaveForm, setLeaveForm] = useState(EMPTY_LEAVE_FORM);
  const [leaveFieldTouched, setLeaveFieldTouched] = useState({});
  const [hasAttemptedLeaveSubmit, setHasAttemptedLeaveSubmit] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [leaveSubmitError, setLeaveSubmitError] = useState('');
  const [relieverOptions, setRelieverOptions] = useState([]);
  const leaveDocumentInputRef = useRef(null);
  const [shiftRows, setShiftRows] = useState([]);
  const [shiftTotals, setShiftTotals] = useState({ shiftA: 0, shiftB: 0 });
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [myShiftAssignments, setMyShiftAssignments] = useState([]);
  const [selectedDayIso, setSelectedDayIso] = useState(null);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const [dayDetailError, setDayDetailError] = useState('');
  const [dayDetailData, setDayDetailData] = useState({ onDuty: [], onLeave: [], viewerStatus: 'Off Duty', restricted: false });
  const dayDetailRequestIdRef = useRef(0);

  const loadPageData = useCallback(async () => {
    if (!currentUser?.admin_id) {
      setLoading(false);
      setScheduleLoading(false);
      return;
    }

    setLoading(true);
    setScheduleLoading(true);

    const firstDay = new Date(
  calendarMonth.getFullYear(),
  calendarMonth.getMonth(),
  1
);

const lastDay = new Date(
  calendarMonth.getFullYear(),
  calendarMonth.getMonth() + 1,
  0
);

const [leaveRes, scheduleRes, myAssignmentsRes, relieverRes] = await Promise.all([
  getPersonnelLeaveRequest(currentUser.admin_id),
  getPersonnelShiftSchedule({
    startDate: firstDay,
    endDate: lastDay,
    viewerPersonnelId: currentUser.admin_id
  }),
  getPersonnelShiftAssignments(currentUser.admin_id),
  getReliefCandidates(currentUser.admin_id)
]);

    if (leaveRes.error) {
      setMessage({ type: 'error', text: `Failed to load leave request: ${leaveRes.error}` });
    } else if (leaveRes.data) {
      setLeaveRequest(leaveRes.data);
    }

    if (!relieverRes.error) {
      setRelieverOptions(relieverRes.data || []);
    }

    if (scheduleRes.error) {
      setMessage((prev) => ({
        type: 'error',
        text: prev.text
          ? `${prev.text} Failed to load shift schedule: ${scheduleRes.error}`
          : `Failed to load shift schedule: ${scheduleRes.error}`
      }));
    } else {
      setShiftRows(scheduleRes.data?.rows || []);
      setShiftTotals({
        shiftA: scheduleRes.data?.totalShiftADates || 0,
        shiftB: scheduleRes.data?.totalShiftBDates || 0
      });
    }

    if (!myAssignmentsRes.error) {
      setMyShiftAssignments(myAssignmentsRes.data || []);
    }

    setLoading(false);
    setScheduleLoading(false);
  }, [currentUser?.admin_id, calendarMonth]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  // Prefill the optional contact number from the personnel's own profile the
  // first time it becomes available, without overwriting anything the user
  // has already typed into the form.
  useEffect(() => {
    if (currentUser?.contact_number) {
      setLeaveForm((prev) => (prev.contactNumber ? prev : { ...prev, contactNumber: currentUser.contact_number }));
    }
  }, [currentUser?.contact_number]);

  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        loadPageData();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [loadPageData]);

  const shiftRowsByDate = useMemo(
    () => new Map(shiftRows.map((row) => [row.date, row])),
    [shiftRows]
  );

  const myShiftType = useMemo(
    () => resolveCurrentShiftType(myShiftAssignments),
    [myShiftAssignments]
  );

  const myShiftLabel = myShiftType === 'A' ? 'Shift A' : myShiftType === 'B' ? 'Shift B' : 'Not Yet Assigned';

  const calendarLabel = useMemo(
    () =>
      calendarMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      }),
    [calendarMonth]
  );

  const calendarCells = useMemo(() => getCalendarCells(calendarMonth), [calendarMonth]);

  const handleCalendarMonthShift = (offset) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const openDayDetail = useCallback(async (isoDate) => {
    const requestId = dayDetailRequestIdRef.current + 1;
    dayDetailRequestIdRef.current = requestId;

    setSelectedDayIso(isoDate);
    setDayDetailLoading(true);
    setDayDetailError('');
    setDayDetailData({ onDuty: [], onLeave: [], viewerStatus: 'Off Duty', restricted: false });

    const { data, error } = await getPersonnelForDate(isoDate, currentUser?.admin_id);
    if (requestId !== dayDetailRequestIdRef.current) {
      return;
    }

    if (error) {
      setDayDetailError(error);
    } else {
      setDayDetailData({
        onDuty: data?.onDuty || [],
        onLeave: data?.onLeave || [],
        viewerStatus: data?.viewerStatus || 'Off Duty',
        restricted: Boolean(data?.restricted)
      });
    }

    setDayDetailLoading(false);
  }, [currentUser?.admin_id]);

  const closeDayDetail = useCallback(() => {
    dayDetailRequestIdRef.current += 1;
    setSelectedDayIso(null);
    setDayDetailError('');
    setDayDetailData({ onDuty: [], onLeave: [], viewerStatus: 'Off Duty', restricted: false });
  }, []);

  useEffect(() => {
    if (!selectedDayIso) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeDayDetail();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDayIso, closeDayDetail]);

  const todayIso = getManilaToday();
  const minEndDate = leaveForm.startDate ? laterIso(todayIso, leaveForm.startDate) : todayIso;
  const isDocumentRequired = LEAVE_TYPES_REQUIRING_DOCUMENT.has(leaveForm.leaveType);
  const numberOfLeaveDays = calculateLeaveDays(leaveForm.startDate, leaveForm.endDate);

  const leaveFormErrors = useMemo(
    () => computeLeaveFormErrors(leaveForm, todayIso),
    [leaveForm, todayIso]
  );
  const isLeaveFormValid = Object.keys(leaveFormErrors).length === 0;
  const hasLeaveFormEntries = Boolean(
    leaveForm.leaveType || leaveForm.otherLeaveType || leaveForm.startDate || leaveForm.endDate
    || leaveForm.reason || leaveForm.contactNumber || leaveForm.relieverValue || leaveForm.documentFile
  );
  const visibleLeaveFieldErrors = useMemo(() => {
    const visible = {};
    Object.keys(leaveFormErrors).forEach((field) => {
      if (hasAttemptedLeaveSubmit || leaveFieldTouched[field]) {
        visible[field] = leaveFormErrors[field];
      }
    });
    return visible;
  }, [leaveFormErrors, leaveFieldTouched, hasAttemptedLeaveSubmit]);

  const selectedRelieverLabel = useMemo(() => {
    if (leaveForm.relieverValue === RELIEVER_ADMIN_ASSIGN_VALUE) return 'To be assigned by Admin';
    if (leaveForm.relieverValue) {
      const match = relieverOptions.find((option) => option.admin_id === leaveForm.relieverValue);
      return match?.name || 'Selected colleague';
    }
    return null;
  }, [leaveForm.relieverValue, relieverOptions]);

  const markLeaveFieldTouched = (name) => {
    setLeaveFieldTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
  };

  const handleLeaveInput = (event) => {
    const { name, value } = event.target;
    setLeaveForm((prev) => {
      const next = { ...prev, [name]: value };
      // Start Date moving past the current End Date makes it invalid, so
      // clear it rather than silently submitting an out-of-range value.
      if (name === 'startDate' && next.endDate && next.endDate < value) {
        next.endDate = '';
      }
      // Switching away from Other clears the now-irrelevant specify field;
      // switching to a type that no longer requires a document drops any
      // previously attached (and now-optional) file's required-ness only,
      // the file itself is left alone so the user doesn't lose a selection.
      if (name === 'leaveType' && value !== 'Other') {
        next.otherLeaveType = '';
      }
      return next;
    });
  };

  const handleLeaveBlur = (event) => {
    markLeaveFieldTouched(event.target.name);
  };

  const handleLeaveDocumentChange = (event) => {
    const file = event.target.files?.[0] || null;
    markLeaveFieldTouched('documentFile');

    if (!file) {
      setLeaveForm((prev) => ({ ...prev, documentFile: null }));
      return;
    }

    if (!isAllowedLeaveDocument(file)) {
      setLeaveSubmitError('Unsupported file type. Please upload a PDF, JPG, JPEG, or PNG file.');
      event.target.value = '';
      return;
    }

    if (file.size > LEAVE_DOCUMENT_MAX_SIZE_BYTES) {
      setLeaveSubmitError('Supporting document exceeds the 5MB size limit.');
      event.target.value = '';
      return;
    }

    setLeaveSubmitError('');
    setLeaveForm((prev) => ({ ...prev, documentFile: file }));
  };

  const handleRemoveLeaveDocument = () => {
    setLeaveForm((prev) => ({ ...prev, documentFile: null }));
    if (leaveDocumentInputRef.current) {
      leaveDocumentInputRef.current.value = '';
    }
  };

  const handleClearLeaveForm = () => {
    setLeaveForm(EMPTY_LEAVE_FORM);
    setLeaveFieldTouched({});
    setHasAttemptedLeaveSubmit(false);
    setLeaveSubmitError('');
    if (leaveDocumentInputRef.current) {
      leaveDocumentInputRef.current.value = '';
    }
  };

  const handleOpenLeaveConfirm = () => {
    setHasAttemptedLeaveSubmit(true);
    setMessage({ type: '', text: '' });

    if (!currentUser?.admin_id) {
      setMessage({ type: 'error', text: 'No personnel account found in the current session.' });
      return;
    }

    if (!isLeaveFormValid) {
      return;
    }

    setLeaveSubmitError('');
    setIsLeaveConfirmOpen(true);
  };

  const closeLeaveConfirm = () => {
    if (leaveSaving) return;
    setIsLeaveConfirmOpen(false);
  };

  const handleConfirmLeaveSubmit = async () => {
    setLeaveSubmitError('');

    const relieverType = leaveForm.relieverValue === RELIEVER_ADMIN_ASSIGN_VALUE
      ? 'admin_assign'
      : leaveForm.relieverValue
        ? 'personnel'
        : '';
    const relieverId = relieverType === 'personnel' ? leaveForm.relieverValue : null;

    try {
      setLeaveSaving(true);
      const { data, error } = await submitPersonnelLeaveRequest(currentUser.admin_id, {
        leaveType: leaveForm.leaveType,
        otherLeaveType: leaveForm.otherLeaveType,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        reason: leaveForm.reason,
        contactNumber: leaveForm.contactNumber,
        relieverType,
        relieverId,
        documentFile: leaveForm.documentFile
      });

      if (error) {
        if (String(error).toLowerCase().includes('leave_requests')) {
          setLeaveSubmitError('Leave request services are temporarily unavailable. Please try again later or contact the administrator.');
        } else {
          setLeaveSubmitError(error);
        }
        return;
      }

      setLeaveRequest((prev) => ({
        ...prev,
        latest_request: data,
        history: [data, ...(prev.history || [])]
      }));
      handleClearLeaveForm();
      setIsLeaveConfirmOpen(false);
      setMessage({ type: 'success', text: 'Your leave request has been submitted and is awaiting admin review.' });

      void logPersonnelActivity({
        personnelId: currentUser.admin_id,
        activityType: 'leave_request',
        action: 'Leave Request Submitted',
        details: `Requested ${data.leave_type || 'leave'} from ${formatDate(data.start_date)} to ${formatDate(data.end_date)}.`
      });
    } catch (err) {
      console.error('Unexpected error submitting leave request:', err);
      setLeaveSubmitError(String(err?.message || err));
    } finally {
      setLeaveSaving(false);
    }
  };

  const requestStatus = String(leaveRequest.latest_request?.status || '').toLowerCase();
  const hasPendingLeaveRequest = requestStatus === 'pending';
  const badgeLabel = requestStatus
    ? requestStatus === 'pending'
      ? 'Pending Approval'
      : requestStatus === 'approved'
        ? 'Approved'
        : 'Rejected'
    : leaveRequest.current_status || 'Active';
  const badgeClass = requestStatus || String(leaveRequest.current_status || 'active').toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="personnel-ops-container">
      <Sidebar variant="personnel" />

      <div className="personnel-ops-content">
        <PageHeader
          title="Shift Schedule"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
          showSearch={false}
        />

        <div className="personnel-ops-grid">
          <section className="ops-card schedule-card">
            <div className="my-shift-card">
              <span className="my-shift-card-label">Your Assigned Shift: </span>
              <span className={`my-shift-card-value my-shift-${myShiftType ? myShiftType.toLowerCase() : 'none'}`}>
                {myShiftLabel}
              </span>
            </div>

            <p className="ops-caption">Duty schedule calendar. Click any date to see who else is scheduled with you.</p>

            <div className="shift-summary-line">
              <span>Shift A dates configured: {shiftTotals.shiftA}</span>
              <span>Shift B dates configured: {shiftTotals.shiftB}</span>
            </div>

            <div className="shift-calendar-panel">
              <div className="shift-calendar-header">
                <button
                  className="shift-calendar-nav"
                  type="button"
                  onClick={() => handleCalendarMonthShift(-1)}
                >
                  {'<'}
                </button>
                <div className="shift-calendar-title">{calendarLabel}</div>
                <button
                  className="shift-calendar-nav"
                  type="button"
                  onClick={() => handleCalendarMonthShift(1)}
                >
                  {'>'}
                </button>
              </div>

              <div className="shift-calendar-legend">
                <span className="shift-calendar-legend-item">
                  <i className="shift-calendar-legend-dot legend-shift-a" />
                  Shift A
                </span>
                <span className="shift-calendar-legend-item">
                  <i className="shift-calendar-legend-dot legend-shift-b" />
                  Shift B
                </span>
                <span className="shift-calendar-legend-item">
                  <i className="shift-calendar-legend-dot legend-on-duty" />
                  On Duty
                </span>
                <span className="shift-calendar-legend-item">
                  <i className="shift-calendar-legend-dot legend-off-duty" />
                  Off Duty
                </span>
                <span className="shift-calendar-legend-item">
                  <i className="shift-calendar-legend-dot legend-on-leave" />
                  On Leave
                </span>
              </div>

              <div className="shift-calendar-grid shift-calendar-weekdays">
                {CALENDAR_WEEKDAYS.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>

              <div className="shift-calendar-grid shift-calendar-days">
                {scheduleLoading && (
                  <div className="shift-calendar-loading">Loading shift schedule...</div>
                )}

                {!scheduleLoading && calendarCells.map((dayDate, index) => {
                  if (!dayDate) {
                    return <span key={`empty-${index}`} className="shift-calendar-empty" />;
                  }

                  const isoDate = toIsoDate(dayDate);
                  const row = shiftRowsByDate.get(isoDate);
                  const isRestricted = Boolean(row?.restricted);
                  const hasShift = Boolean(row && row.shift !== 'Off Duty');
                  const onDutyPersonnel = isRestricted ? [] : (row?.onDutyPersonnel || []);
                  const onLeavePersonnel = isRestricted ? [] : (row?.onLeavePersonnel || []);
                  const hasData = Boolean(row);
                  const isMineOnDuty = Boolean(onDutyPersonnel.some((p) => p.admin_id === currentUser?.admin_id));
                  const isMineOnLeave = Boolean(onLeavePersonnel.some((p) => p.admin_id === currentUser?.admin_id));
                  const myDayStatus = isMineOnDuty ? 'On Duty' : isMineOnLeave ? 'On Leave' : 'Off Duty';
                  // Past dates are visually muted here but remain clickable so
                  // personnel can still look back at who they were scheduled with.
                  const isPastDate = isoDate < todayIso;
                  const isToday = isoDate === todayIso;
                  const shiftTagClass = row ? row.shift.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
                  const visibleOnDutyPersonnel = onDutyPersonnel.slice(0, 3);
                  const remainingOnDutyCount = onDutyPersonnel.length - visibleOnDutyPersonnel.length;
                  const visibleOnLeavePersonnel = onLeavePersonnel.slice(0, 3);
                  const remainingOnLeaveCount = onLeavePersonnel.length - visibleOnLeavePersonnel.length;

                  return (
                    <div
                      key={isoDate}
                      className={`shift-calendar-day-card ${hasData ? 'has-data' : ''} ${isMineOnDuty ? 'mine' : ''} ${isPastDate ? 'is-past-date' : ''} ${isToday ? 'today' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={
                        isRestricted
                          ? hasShift
                            ? `${row?.displayDate || isoDate}: ${row?.shift}. View details.`
                            : `${row?.displayDate || isoDate}: No Shift Scheduled. View details.`
                          : `${row?.displayDate || isoDate}: ${row?.shift || 'Off Duty'}. You: ${myDayStatus}. View details.`
                      }
                      onClick={() => openDayDetail(isoDate)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openDayDetail(isoDate);
                        }
                      }}
                    >
                      <div className="shift-calendar-day-top">
                        <span className="shift-calendar-day-number">{dayDate.getDate()}</span>
                        {row && (
                          <span className={`shift-tag ${shiftTagClass}`}>
                            {row.shift}
                          </span>
                        )}
                      </div>

                      {row ? (
                        isRestricted ? (
                          hasShift ? (
                            <div className="shift-calendar-day-body shift-calendar-day-other-shift">
                              <span className="schedule-other-shift-label">{row.shift}</span>
                            </div>
                          ) : (
                            <div className="shift-calendar-day-body shift-calendar-day-restricted">
                              <span className="schedule-empty-inline">No Shift Scheduled</span>
                            </div>
                          )
                        ) : (
                          <div className="shift-calendar-day-body">
                            {onDutyPersonnel.length > 0 && (
                              <div className="shift-calendar-personnel-block">
                                <strong>On Duty</strong>
                                <div className="schedule-personnel-list">
                                  {visibleOnDutyPersonnel.map((person) => {
                                    const isSelf = person.admin_id === currentUser?.admin_id;
                                    return (
                                      <span
                                        key={person.admin_id}
                                        className={`personnel-badge ${isSelf ? 'personnel-badge-mine' : 'personnel-badge-duty'}`}
                                        title={person.name}
                                      >
                                        {isSelf ? 'You' : person.name}
                                      </span>
                                    );
                                  })}
                                  {remainingOnDutyCount > 0 && (
                                    <span className="personnel-badge personnel-badge-duty">+{remainingOnDutyCount} more</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {onLeavePersonnel.length > 0 && (
                              <div className="shift-calendar-personnel-block">
                                <strong>On Leave</strong>
                                <div className="schedule-personnel-list">
                                  {visibleOnLeavePersonnel.map((person) => {
                                    const isSelf = person.admin_id === currentUser?.admin_id;
                                    return (
                                      <span
                                        key={person.admin_id}
                                        className={`personnel-badge ${isSelf ? 'personnel-badge-mine' : 'personnel-badge-leave'}`}
                                        title={person.name}
                                      >
                                        {isSelf ? 'You' : person.name}
                                      </span>
                                    );
                                  })}
                                  {remainingOnLeaveCount > 0 && (
                                    <span className="personnel-badge personnel-badge-leave">+{remainingOnLeaveCount} more</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      ) : (
                        <div className="shift-calendar-no-data">No shift data</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="ops-card leave-card">
            <div className="ops-card-header">
              <h2>Leave Request</h2>
              <span className={`leave-status ${badgeClass}`}>
                {badgeLabel}
              </span>
            </div>

            {hasPendingLeaveRequest ? (
              <div className="leave-pending-summary">
                <h3 className="leave-section-heading">Pending Leave Request</h3>
                <div className="leave-summary-grid">
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Leave Type</span>
                    <span className="leave-summary-value">{leaveRequest.latest_request?.leave_type || 'Not specified'}</span>
                  </div>
                  {leaveRequest.latest_request?.leave_type === 'Other' && leaveRequest.latest_request?.other_leave_type && (
                    <div className="leave-summary-field">
                      <span className="leave-summary-label">Specific Leave Type</span>
                      <span className="leave-summary-value">{leaveRequest.latest_request.other_leave_type}</span>
                    </div>
                  )}
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Leave Start</span>
                    <span className="leave-summary-value">{formatDate(leaveRequest.latest_request?.start_date)}</span>
                  </div>
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Leave End</span>
                    <span className="leave-summary-value">{formatDate(leaveRequest.latest_request?.end_date)}</span>
                  </div>
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Number of Leave Days</span>
                    <span className="leave-summary-value">
                      {calculateLeaveDays(leaveRequest.latest_request?.start_date, leaveRequest.latest_request?.end_date)}
                    </span>
                  </div>
                  <div className="leave-summary-field leave-summary-field-full">
                    <span className="leave-summary-label">Reason for Leave</span>
                    <ExpandableText
                      as="span"
                      className="leave-summary-value"
                      text={leaveRequest.latest_request?.reason}
                      emptyFallback={<span className="leave-summary-value">-</span>}
                    />
                  </div>
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Date Submitted</span>
                    <span className="leave-summary-value">{formatDateTime(leaveRequest.latest_request?.created_at)}</span>
                  </div>
                  {leaveRequest.latest_request?.contact_number && (
                    <div className="leave-summary-field">
                      <span className="leave-summary-label">Contact Number</span>
                      <span className="leave-summary-value">{leaveRequest.latest_request.contact_number}</span>
                    </div>
                  )}
                  {leaveRequest.latest_request?.document_url && (
                    <div className="leave-summary-field">
                      <span className="leave-summary-label">Supporting Document</span>
                      <a
                        className="leave-summary-value leave-document-link"
                        href={leaveRequest.latest_request.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {leaveRequest.latest_request.document_name || 'View document'}
                      </a>
                    </div>
                  )}
                  {formatRelieverLabel(leaveRequest.latest_request) && (
                    <div className="leave-summary-field">
                      <span className="leave-summary-label">Reliever / Shift Coverage</span>
                      <span className="leave-summary-value">{formatRelieverLabel(leaveRequest.latest_request)}</span>
                    </div>
                  )}
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Status</span>
                    <span className="leave-summary-value">{formatStatusLabel(leaveRequest.latest_request?.status)}</span>
                  </div>
                </div>

                <p className="leave-pending-notice">
                  Your leave request is currently awaiting admin review. You may submit another request after the current request has been reviewed.
                </p>
              </div>
            ) : (
              <>
                <p className="ops-caption">Complete the form below and submit your request for admin approval.</p>

                <div className="leave-form-grid">
                  <div className="leave-field">
                    <label htmlFor="leave-type">Leave Type</label>
                    <select
                      id="leave-type"
                      name="leaveType"
                      className="leave-select-input"
                      value={leaveForm.leaveType}
                      onChange={handleLeaveInput}
                      onBlur={handleLeaveBlur}
                    >
                      <option value="">Select leave type</option>
                      {LEAVE_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    {visibleLeaveFieldErrors.leaveType && (
                      <span className="leave-field-error">{visibleLeaveFieldErrors.leaveType}</span>
                    )}
                  </div>

                  {leaveForm.leaveType === 'Other' && (
                    <div className="leave-field">
                      <label htmlFor="leave-other-type">Specify Leave Type</label>
                      <input
                        id="leave-other-type"
                        type="text"
                        name="otherLeaveType"
                        className="leave-text-input"
                        value={leaveForm.otherLeaveType}
                        onChange={handleLeaveInput}
                        onBlur={handleLeaveBlur}
                        maxLength={100}
                      />
                      {visibleLeaveFieldErrors.otherLeaveType && (
                        <span className="leave-field-error">{visibleLeaveFieldErrors.otherLeaveType}</span>
                      )}
                    </div>
                  )}

                  <div className="leave-field">
                    <label htmlFor="leave-start-date">Leave Start Date</label>
                    <input
                      id="leave-start-date"
                      type="date"
                      name="startDate"
                      className="leave-date-input"
                      min={todayIso}
                      value={leaveForm.startDate}
                      onChange={handleLeaveInput}
                      onBlur={handleLeaveBlur}
                    />
                    {visibleLeaveFieldErrors.startDate && (
                      <span className="leave-field-error">{visibleLeaveFieldErrors.startDate}</span>
                    )}
                  </div>

                  <div className="leave-field">
                    <label htmlFor="leave-end-date">Leave End Date</label>
                    <input
                      id="leave-end-date"
                      type="date"
                      name="endDate"
                      className="leave-date-input"
                      min={minEndDate}
                      value={leaveForm.endDate}
                      onChange={handleLeaveInput}
                      onBlur={handleLeaveBlur}
                    />
                    {visibleLeaveFieldErrors.endDate && (
                      <span className="leave-field-error">{visibleLeaveFieldErrors.endDate}</span>
                    )}
                  </div>

                  <div className="leave-field">
                    <label htmlFor="leave-days-readonly">Number of Leave Days</label>
                    <input
                      id="leave-days-readonly"
                      type="text"
                      className="leave-text-input"
                      value={numberOfLeaveDays || ''}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="leave-field">
                    <label htmlFor="leave-contact-number">Contact Number During Leave</label>
                    <input
                      id="leave-contact-number"
                      type="text"
                      name="contactNumber"
                      className="leave-text-input"
                      placeholder="Optional"
                      value={leaveForm.contactNumber}
                      onChange={handleLeaveInput}
                      onBlur={handleLeaveBlur}
                      maxLength={20}
                    />
                    {visibleLeaveFieldErrors.contactNumber && (
                      <span className="leave-field-error">{visibleLeaveFieldErrors.contactNumber}</span>
                    )}
                  </div>

                  <div className="leave-field leave-field-full">
                    <label htmlFor="leave-reason">Reason for Leave</label>
                    <textarea
                      id="leave-reason"
                      name="reason"
                      className="leave-textarea-input"
                      rows={3}
                      value={leaveForm.reason}
                      onChange={handleLeaveInput}
                      onBlur={handleLeaveBlur}
                      maxLength={500}
                    />
                    {visibleLeaveFieldErrors.reason && (
                      <span className="leave-field-error">{visibleLeaveFieldErrors.reason}</span>
                    )}
                  </div>

                  <div className="leave-field">
                    <label htmlFor="leave-document">
                      Supporting Document{isDocumentRequired ? ' (Required)' : ' (Optional)'}
                    </label>
                    <div className="leave-document-input-row">
                      <label className="leave-document-choose-btn" htmlFor="leave-document">
                        Choose File
                      </label>
                      <input
                        id="leave-document"
                        ref={leaveDocumentInputRef}
                        type="file"
                        accept={LEAVE_DOCUMENT_ACCEPT}
                        className="leave-document-input"
                        onChange={handleLeaveDocumentChange}
                      />
                      <span className="leave-document-filename">
                        {leaveForm.documentFile
                          ? `${leaveForm.documentFile.name} (${formatFileSize(leaveForm.documentFile.size)})`
                          : 'No file selected'}
                      </span>
                      {leaveForm.documentFile && (
                        <button type="button" className="leave-document-remove-btn" onClick={handleRemoveLeaveDocument}>
                          Remove
                        </button>
                      )}
                    </div>
                    <span className="leave-field-hint">Accepted formats: PDF, JPG, JPEG, PNG (max 5MB).</span>
                    {visibleLeaveFieldErrors.documentFile && (
                      <span className="leave-field-error">{visibleLeaveFieldErrors.documentFile}</span>
                    )}
                  </div>

                  <div className="leave-field">
                    <label htmlFor="leave-reliever">Reliever / Shift Coverage</label>
                    <select
                      id="leave-reliever"
                      name="relieverValue"
                      className="leave-select-input"
                      value={leaveForm.relieverValue}
                      onChange={handleLeaveInput}
                      onBlur={handleLeaveBlur}
                    >
                      <option value="">Optional - no reliever selected</option>
                      <option value={RELIEVER_ADMIN_ASSIGN_VALUE}>To be assigned by Admin</option>
                      {relieverOptions.map((option) => (
                        <option key={option.admin_id} value={option.admin_id}>{option.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="leave-form-actions">
                  {hasLeaveFormEntries && (
                    <button
                      type="button"
                      className="leave-clear-form-btn"
                      onClick={handleClearLeaveForm}
                      disabled={leaveSaving}
                    >
                      Clear Form
                    </button>
                  )}

                  <button
                    className="ops-primary-btn"
                    type="button"
                    onClick={handleOpenLeaveConfirm}
                    disabled={leaveSaving || loading || !isLeaveFormValid}
                  >
                    Submit Leave Request
                  </button>
                </div>
              </>
            )}

            <div className="leave-history-section">
              <h3 className="leave-history-title">Leave History</h3>

              {leaveRequest.history && leaveRequest.history.length > 0 ? (
                <div className="leave-history-list">
                  {leaveRequest.history.map((item) => {
                    const itemStatus = String(item.status || '').toLowerCase();
                    const relieverLabel = formatRelieverLabel(item);
                    return (
                      <div key={item.request_id} className="leave-history-item">
                        <div className="leave-history-item-header">
                          <div className="leave-history-dates">
                            <p><strong>Leave Type:</strong> {item.leave_type || 'Not specified'}</p>
                            {item.leave_type === 'Other' && item.other_leave_type && (
                              <p><strong>Specific Leave Type:</strong> {item.other_leave_type}</p>
                            )}
                            <p><strong>Leave Start:</strong> {formatDate(item.start_date)}</p>
                            <p><strong>Leave End:</strong> {formatDate(item.end_date)}</p>
                            <p><strong>Number of Leave Days:</strong> {calculateLeaveDays(item.start_date, item.end_date)}</p>
                          </div>
                          <span className={`leave-status ${itemStatus}`}>
                            {formatStatusLabel(item.status)}
                          </span>
                        </div>

                        <div className="leave-history-item-details">
                          {item.reason && (
                            <div className="leave-history-reason">
                              <p><strong>Reason for Leave:</strong></p>
                              <ExpandableText as="p" text={item.reason} />
                            </div>
                          )}
                          {item.contact_number && (
                            <p><strong>Contact Number:</strong> {item.contact_number}</p>
                          )}
                          {item.document_url && (
                            <p>
                              <strong>Supporting Document:</strong>{' '}
                              <a className="leave-document-link" href={item.document_url} target="_blank" rel="noopener noreferrer">
                                {item.document_name || 'View document'}
                              </a>
                            </p>
                          )}
                          {relieverLabel && (
                            <p><strong>Reliever / Shift Coverage:</strong> {relieverLabel}</p>
                          )}
                          <p><strong>Date Submitted:</strong> {formatDateTime(item.created_at)}</p>
                          {item.approved_at && (
                            <p><strong>Date Reviewed:</strong> {formatDateTime(item.approved_at)}</p>
                          )}
                          {item.approved_at && item.reviewed_by_name && (
                            <p><strong>Reviewed By:</strong> {item.reviewed_by_name}</p>
                          )}
                          {itemStatus === 'rejected' && (
                            <div className="leave-history-reason">
                              <p><strong>Rejection Reason:</strong></p>
                              <ExpandableText as="p" text={item.rejection_reason || 'No reason provided.'} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="leave-history-empty">No leave requests yet.</p>
              )}
            </div>
          </section>
        </div>

        {message.text && (
          <div className={`ops-page-message ops-page-message-${message.type}`}>
            {message.text}
          </div>
        )}

        {isLeaveConfirmOpen && (
          <div
            className="personnel-modal-overlay"
            role="presentation"
            onClick={closeLeaveConfirm}
          >
            <div
              className="personnel-modal leave-confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm leave request"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="personnel-modal-header">
                <h3>Confirm Leave Request</h3>
                <button
                  type="button"
                  className="personnel-modal-close"
                  onClick={closeLeaveConfirm}
                  aria-label="Close confirmation"
                  disabled={leaveSaving}
                >
                  &times;
                </button>
              </div>

              <div className="personnel-modal-body">
                <div className="leave-confirm-summary">
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Leave Type</span>
                    <span className="leave-summary-value">{leaveForm.leaveType}</span>
                  </div>
                  {leaveForm.leaveType === 'Other' && (
                    <div className="leave-summary-field">
                      <span className="leave-summary-label">Specific Leave Type</span>
                      <span className="leave-summary-value">{leaveForm.otherLeaveType}</span>
                    </div>
                  )}
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Leave Start</span>
                    <span className="leave-summary-value">{formatDate(leaveForm.startDate)}</span>
                  </div>
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Leave End</span>
                    <span className="leave-summary-value">{formatDate(leaveForm.endDate)}</span>
                  </div>
                  <div className="leave-summary-field">
                    <span className="leave-summary-label">Number of Leave Days</span>
                    <span className="leave-summary-value">{numberOfLeaveDays}</span>
                  </div>
                  <div className="leave-summary-field leave-summary-field-full">
                    <span className="leave-summary-label">Reason for Leave</span>
                    <span className="leave-summary-value">{leaveForm.reason}</span>
                  </div>
                  {leaveForm.contactNumber && (
                    <div className="leave-summary-field">
                      <span className="leave-summary-label">Contact Number</span>
                      <span className="leave-summary-value">{leaveForm.contactNumber}</span>
                    </div>
                  )}
                  {leaveForm.documentFile && (
                    <div className="leave-summary-field">
                      <span className="leave-summary-label">Supporting Document</span>
                      <span className="leave-summary-value">{leaveForm.documentFile.name}</span>
                    </div>
                  )}
                  {selectedRelieverLabel && (
                    <div className="leave-summary-field">
                      <span className="leave-summary-label">Reliever / Shift Coverage</span>
                      <span className="leave-summary-value">{selectedRelieverLabel}</span>
                    </div>
                  )}
                </div>

                {leaveSubmitError && (
                  <div className="ops-page-message ops-page-message-error leave-confirm-error">
                    {leaveSubmitError}
                  </div>
                )}
              </div>

              <div className="personnel-modal-footer">
                <button
                  type="button"
                  className="leave-modal-cancel-btn"
                  onClick={closeLeaveConfirm}
                  disabled={leaveSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ops-primary-btn"
                  onClick={handleConfirmLeaveSubmit}
                  disabled={leaveSaving}
                >
                  {leaveSaving ? 'Submitting...' : 'Confirm and Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedDayIso && (
          <div
            className="personnel-modal-overlay"
            role="presentation"
            onClick={closeDayDetail}
          >
            <div
              className="personnel-modal personnel-day-detail-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Shift details for ${formatDate(selectedDayIso)}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="personnel-modal-header">
                <h3>{formatDate(selectedDayIso)}</h3>
                <button
                  type="button"
                  className="personnel-modal-close"
                  onClick={closeDayDetail}
                  aria-label="Close day detail"
                >
                  &times;
                </button>
              </div>

              <div className="personnel-modal-body">
                {dayDetailLoading ? (
                  <p className="schedule-empty-inline">Loading details for this date...</p>
                ) : dayDetailError ? (
                  <div className="ops-page-message ops-page-message-error">
                    Unable to load details for this date: {dayDetailError}
                  </div>
                ) : (
                  <>
                    <div className="day-detail-summary">
                      <p>
                        <strong>Shift:</strong> {shiftRowsByDate.get(selectedDayIso)?.shift || 'Off Duty'}
                      </p>
                      {!dayDetailData.restricted && (
                        <p>
                          <strong>Your Status:</strong> {dayDetailData.viewerStatus || 'Off Duty'}
                        </p>
                      )}
                    </div>

                    {dayDetailData.restricted ? (
                      <p className="schedule-empty-inline">This date belongs to a different shift. Personnel details are only visible for your own shift.</p>
                    ) : (
                      <>
                        <div className="day-detail-section">
                          <h4>On Duty ({dayDetailData.onDuty.length})</h4>
                          {dayDetailData.onDuty.length === 0 ? (
                            <p className="schedule-empty-inline">No personnel on duty for this date.</p>
                          ) : (
                            <ul className="day-detail-personnel-list">
                              {dayDetailData.onDuty.map((person) => {
                                const isSelf = person.admin_id === currentUser?.admin_id;
                                return (
                                  <li key={person.admin_id} className={isSelf ? 'is-self' : ''}>
                                    <span>
                                      {person.name}
                                      {isSelf && <span className="personnel-badge personnel-badge-mine">You</span>}
                                    </span>
                                    <span className="day-detail-personnel-meta">
                                      {[
                                        person.rank && person.rank !== '-' ? person.rank : null,
                                        person.time_in ? `In ${person.time_in}` : null,
                                        person.time_out ? `Out ${person.time_out}` : null
                                      ].filter(Boolean).join(' · ') || '-'}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        <div className="day-detail-section">
                          <h4>On Leave ({dayDetailData.onLeave.length})</h4>
                          {dayDetailData.onLeave.length === 0 ? (
                            <p className="schedule-empty-inline">No personnel on leave for this date.</p>
                          ) : (
                            <ul className="day-detail-personnel-list">
                              {dayDetailData.onLeave.map((person) => {
                                const isSelf = person.admin_id === currentUser?.admin_id;
                                return (
                                  <li key={person.admin_id} className={isSelf ? 'is-self' : ''}>
                                    <span>
                                      {person.name}
                                      {isSelf && <span className="personnel-badge personnel-badge-mine">You</span>}
                                    </span>
                                    <span className="day-detail-personnel-meta">
                                      {formatDate(person.leave_start_date)} - {formatDate(person.leave_end_date)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </>
                    )}
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
