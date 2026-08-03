import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useUser } from '../context/UserContext';
import {
  getPersonnelLeaveRequest,
  submitPersonnelLeaveRequest,
  getPersonnelShiftSchedule,
  getPersonnelForDate,
  getPersonnelShiftAssignments,
  resolveCurrentShiftType
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
  const [leaveForm, setLeaveForm] = useState({
    startDate: '',
    endDate: ''
  });
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

const [leaveRes, scheduleRes, myAssignmentsRes] = await Promise.all([
  getPersonnelLeaveRequest(currentUser.admin_id),
  getPersonnelShiftSchedule({
    startDate: firstDay,
    endDate: lastDay,
    viewerPersonnelId: currentUser.admin_id
  }),
  getPersonnelShiftAssignments(currentUser.admin_id)
]);

    if (leaveRes.error) {
      setMessage({ type: 'error', text: `Failed to load leave request: ${leaveRes.error}` });
    } else if (leaveRes.data) {
      setLeaveRequest(leaveRes.data);
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

  const handleLeaveInput = (event) => {
    const { name, value } = event.target;
    setLeaveForm((prev) => {
      const next = { ...prev, [name]: value };
      // Start Date moving past the current End Date makes it invalid, so
      // clear it rather than silently submitting an out-of-range value.
      if (name === 'startDate' && next.endDate && next.endDate < value) {
        next.endDate = '';
      }
      return next;
    });
  };

  const handleClearLeaveDates = () => {
    setLeaveForm((prev) => ({ ...prev, startDate: '', endDate: '' }));
  };

  const handleSubmitLeave = async () => {
    setMessage({ type: '', text: '' });

    if (!currentUser?.admin_id) {
      setMessage({ type: 'error', text: 'No personnel account found in the current session.' });
      return;
    }

    if (!leaveForm.startDate || !leaveForm.endDate) {
      setMessage({ type: 'error', text: 'Please provide both leave start and end dates.' });
      return;
    }

    if (leaveForm.startDate < todayIso || leaveForm.endDate < todayIso) {
      setMessage({ type: 'error', text: 'You cannot submit a leave request for a past date.' });
      return;
    }

    if (leaveForm.endDate < leaveForm.startDate) {
      setMessage({ type: 'error', text: 'Leave end date must be on or after the start date.' });
      return;
    }

    try {
      setLeaveSaving(true);
      const { data, error } = await submitPersonnelLeaveRequest(currentUser.admin_id, leaveForm);

      if (error) {
        if (String(error).toLowerCase().includes('leave_start_date') || String(error).toLowerCase().includes('leave_end_date')) {
          setMessage({
            type: 'error',
            text: 'Leave columns are missing in the database. Run leave_dates_setup.sql first, then try again.'
          });
        } else if (String(error).toLowerCase().includes('leave_requests')) {
          setMessage({
            type: 'error',
            text: 'Leave request table is missing. Run leave_requests_setup.sql first, then try again.'
          });
        } else {
          setMessage({ type: 'error', text: error });
        }
        return;
      }

      setLeaveRequest((prev) => ({
        ...prev,
        latest_request: data,
        history: [data, ...(prev.history || [])]
      }));
      setLeaveForm({ startDate: '', endDate: '' });
      setMessage({ type: 'success', text: 'Leave request submitted. Waiting for admin approval.' });

      void logPersonnelActivity({
        personnelId: currentUser.admin_id,
        activityType: 'leave_request',
        action: 'Leave Request Submitted',
        details: `Requested leave from ${formatDate(data.start_date)} to ${formatDate(data.end_date)}.`
      });
    } catch (err) {
      console.error('Unexpected error submitting leave request:', err);
      setMessage({ type: 'error', text: String(err?.message || err) });
    } finally {
      setLeaveSaving(false);
    }
  };

  const requestStatus = String(leaveRequest.latest_request?.status || '').toLowerCase();
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
                          ? `${row?.displayDate || isoDate}: ${row?.shift}. No Shift Scheduled. View details.`
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
                          <div className="shift-calendar-day-body shift-calendar-day-restricted">
                            <span className="schedule-empty-inline">No Shift Scheduled</span>
                          </div>
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

            <p className="ops-caption">Set your leave period and submit your request for admin approval.</p>

            <div className="leave-current-range">
              <p><strong>Current Start:</strong> {formatDate(leaveRequest.leave_start_date)}</p>
              <p><strong>Current End:</strong> {formatDate(leaveRequest.leave_end_date)}</p>
            </div>

            <div className="leave-form-toolbar">
              <button
                type="button"
                className="leave-clear-dates-btn"
                onClick={handleClearLeaveDates}
                disabled={!leaveForm.startDate && !leaveForm.endDate}
              >
                Clear Dates
              </button>
            </div>

            <div className="leave-form-grid">
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
                />
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
                />
              </div>
            </div>

            <button className="ops-primary-btn" type="button" onClick={handleSubmitLeave} disabled={leaveSaving || loading}>
              {leaveSaving ? 'Submitting...' : 'Submit Leave Request'}
            </button>

            <div className="leave-history-section">
              <h3 className="leave-history-title">Leave History</h3>

              {leaveRequest.history && leaveRequest.history.length > 0 ? (
                <div className="leave-history-list">
                  {leaveRequest.history.map((item) => {
                    const itemStatus = String(item.status || '').toLowerCase();
                    return (
                      <div key={item.request_id} className="leave-history-item">
                        <div className="leave-history-item-header">
                          <span className="leave-history-dates">
                            {formatDate(item.start_date)} - {formatDate(item.end_date)}
                          </span>
                          <span className={`leave-status ${itemStatus}`}>
                            {formatStatusLabel(item.status)}
                          </span>
                        </div>

                        <div className="leave-history-item-details">
                          <p><strong>Date Requested:</strong> {formatDateTime(item.created_at)}</p>
                          {item.approved_at && (
                            <p><strong>Date Reviewed:</strong> {formatDateTime(item.approved_at)}</p>
                          )}
                          {item.reviewed_by_name && (
                            <p><strong>Reviewed By:</strong> {item.reviewed_by_name}</p>
                          )}
                          {itemStatus === 'rejected' && item.rejection_reason && (
                            <p><strong>Rejection Reason:</strong> {item.rejection_reason}</p>
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
