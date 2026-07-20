import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useUser } from '../context/UserContext';
import {
  getPersonnelLeaveRequest,
  submitPersonnelLeaveRequest,
  getPersonnelShiftSchedule
} from '../utils/personnelOperationsService';
import { getManilaToday } from '../utils/dateUtils';
import { logPersonnelActivity } from '../utils/activityLogService';
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

const laterIso = (a, b) => (a > b ? a : b);

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
  const navigate = useNavigate();
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
    latest_request: null
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

const [leaveRes, scheduleRes] = await Promise.all([
  getPersonnelLeaveRequest(currentUser.admin_id),
  getPersonnelShiftSchedule({
    startDate: firstDay,
    endDate: lastDay
  })
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

  const todaySchedule = useMemo(() => {
    if (!shiftRows.length) {
      return 'No shift schedule available today';
    }

    return shiftRows[0].shift;
  }, [shiftRows]);

  const shiftRowsByDate = useMemo(
    () => new Map(shiftRows.map((row) => [row.date, row])),
    [shiftRows]
  );

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

  const todayDutySummary = useMemo(() => {
    if (!shiftRows.length) {
      return null;
    }

    const [todayRow] = shiftRows;
    return {
      onDutyCount: todayRow?.onDutyCount || 0,
      onLeaveCount: todayRow?.onLeaveCount || 0
    };
  }, [shiftRows]);

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
        latest_request: data
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
            <div className="ops-card-header">
              <h2>Shift Schedule</h2>
              <span className="shift-chip">
                Today: {todaySchedule}
                {todayDutySummary && (
                  <span className="schedule-count-inline">
                    {' '}
                    · Duty {todayDutySummary.onDutyCount} · Leave {todayDutySummary.onLeaveCount}
                  </span>
                )}
              </span>
            </div>

            <p className="ops-caption">Duty schedule calendar. Use the arrows to browse other months.</p>

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
                  const onDuty = row?.onDutyCount || 0;
                  const onLeave = row?.onLeaveCount || 0;
                  const hasData = Boolean(row);
                  const isMineOnDuty = Boolean(row?.onDutyPersonnel?.some((p) => p.admin_id === currentUser?.admin_id));
                  // Display-only: past dates are visually disabled here but the
                  // underlying schedule data is never modified.
                  const isPastDate = isoDate < todayIso;
                  const isToday = isoDate === todayIso;
                  const shiftTagClass = row ? row.shift.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';

                  return (
                    <div
                      key={isoDate}
                      className={`shift-calendar-day-card ${hasData ? 'has-data' : ''} ${isMineOnDuty ? 'mine' : ''} ${isPastDate ? 'is-past-date' : ''} ${isToday ? 'today' : ''}`}
                      aria-disabled={isPastDate}
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
                        <div className="shift-calendar-day-body">
                          <div className="calendar-stats">
                            <span className="calendar-stat calendar-stat-duty">On Duty: {onDuty}</span>
                            <span className="calendar-stat calendar-stat-leave">On Leave: {onLeave}</span>
                          </div>
                        </div>
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

            {leaveRequest.latest_request && (
              <div className="leave-request-meta">
                <p><strong>Last Request:</strong> {formatDate(leaveRequest.latest_request.start_date)} to {formatDate(leaveRequest.latest_request.end_date)}</p>
                <p><strong>Status:</strong> {String(leaveRequest.latest_request.status || '').toUpperCase()}</p>
                {leaveRequest.latest_request.rejection_reason && (
                  <p><strong>Rejection Reason:</strong> {leaveRequest.latest_request.rejection_reason}</p>
                )}
              </div>
            )}

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
          </section>
        </div>

        {message.text && (
          <div className={`ops-page-message ops-page-message-${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
