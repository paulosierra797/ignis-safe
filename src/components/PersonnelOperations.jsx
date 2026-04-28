import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useUser } from '../context/UserContext';
import {
  getPersonnelLeaveRequest,
  submitPersonnelLeaveRequest,
  getPersonnelShiftSchedule
} from '../utils/personnelOperationsService';
import './PersonnelOperations.css';

const REPORT_TYPES = [
  {
    id: 'fireOperations',
    title: 'Fire Operations Report',
    description: 'Document operational actions, deployments, and response details.'
  },
  {
    id: 'spotInvestigation',
    title: 'Spot Investigation Report',
    description: 'Quick on-site fact-gathering report for immediate field findings.'
  },
  {
    id: 'finalInvestigation',
    title: 'Final Investigation Report',
    description: 'Comprehensive report with analysis, causes, and recommendations.'
  }
];

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

  useEffect(() => {
    const loadPageData = async () => {
      if (!currentUser?.admin_id) {
        setLoading(false);
        setScheduleLoading(false);
        return;
      }

      setLoading(true);
      setScheduleLoading(true);

      const [leaveRes, scheduleRes] = await Promise.all([
        getPersonnelLeaveRequest(currentUser.admin_id),
        getPersonnelShiftSchedule({ days: 21 })
      ]);

      if (leaveRes.error) {
        setMessage({ type: 'error', text: `Failed to load leave request: ${leaveRes.error}` });
      } else if (leaveRes.data) {
        setLeaveRequest(leaveRes.data);
        const request = leaveRes.data.latest_request;
        setLeaveForm({
          startDate: request?.start_date || leaveRes.data.leave_start_date || '',
          endDate: request?.end_date || leaveRes.data.leave_end_date || ''
        });
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
    };

    loadPageData();
  }, [currentUser?.admin_id]);

  const todaySchedule = useMemo(() => {
    if (!shiftRows.length) {
      return 'No shift schedule available today';
    }

    return shiftRows[0].shift;
  }, [shiftRows]);

  const handleLeaveInput = (event) => {
    const { name, value } = event.target;
    setLeaveForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitLeave = async () => {
    setMessage({ type: '', text: '' });

    if (!currentUser?.admin_id) {
      setMessage({ type: 'error', text: 'No personnel account found in the current session.' });
      return;
    }

    setLeaveSaving(true);
    const { data, error } = await submitPersonnelLeaveRequest(currentUser.admin_id, leaveForm);
    setLeaveSaving(false);

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
    setLeaveForm({
      startDate: data.start_date || '',
      endDate: data.end_date || ''
    });
    setMessage({ type: 'success', text: 'Leave request submitted. Waiting for admin approval.' });
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

  const openReportType = (reportType) => {
    navigate('/reports', {
      state: {
        startReportType: reportType
      }
    });
  };

  return (
    <div className="personnel-ops-container">
      <Sidebar variant="personnel" />

      <div className="personnel-ops-content">
        <PageHeader
          title="Personnel Workspace"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
          showSearch={false}
        />

        <div className="personnel-ops-grid">
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

            <div className="leave-form-grid">
              <label htmlFor="leave-start-date">Leave Start Date</label>
              <input
                id="leave-start-date"
                type="date"
                name="startDate"
                value={leaveForm.startDate}
                onChange={handleLeaveInput}
              />

              <label htmlFor="leave-end-date">Leave End Date</label>
              <input
                id="leave-end-date"
                type="date"
                name="endDate"
                min={leaveForm.startDate || undefined}
                value={leaveForm.endDate}
                onChange={handleLeaveInput}
              />
            </div>

            <button className="ops-primary-btn" type="button" onClick={handleSubmitLeave} disabled={leaveSaving || loading}>
              {leaveSaving ? 'Submitting...' : 'Submit Leave Request'}
            </button>
          </section>

          <section className="ops-card schedule-card">
            <div className="ops-card-header">
              <h2>Shift Schedule</h2>
              <span className="shift-chip">Today: {todaySchedule}</span>
            </div>

            <p className="ops-caption">Upcoming duty schedule for the next 21 days.</p>

            <div className="shift-summary-line">
              <span>Shift A dates configured: {shiftTotals.shiftA}</span>
              <span>Shift B dates configured: {shiftTotals.shiftB}</span>
            </div>

            <div className="shift-table-wrap">
              <table className="shift-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Scheduled Shift</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleLoading && (
                    <tr>
                      <td colSpan="3" className="shift-empty">Loading shift schedule...</td>
                    </tr>
                  )}
                  {!scheduleLoading && shiftRows.map((row) => (
                    <tr key={row.date}>
                      <td>{row.displayDate}</td>
                      <td>{row.dayLabel}</td>
                      <td>
                        <span className={`shift-tag ${row.shift.toLowerCase().replace(/\s+/g, '-')}`}>
                          {row.shift}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!scheduleLoading && shiftRows.length === 0 && (
                    <tr>
                      <td colSpan="3" className="shift-empty">No schedule data available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ops-card report-card-ops">
            <div className="ops-card-header">
              <h2>File Reports</h2>
            </div>

            <p className="ops-caption">Create a new file report and submit it through your personnel workflow.</p>

            <div className="report-type-grid">
              {REPORT_TYPES.map((report) => (
                <article key={report.id} className="report-type-item">
                  <h3>{report.title}</h3>
                  <p>{report.description}</p>
                  <button type="button" className="ops-secondary-btn" onClick={() => openReportType(report.id)}>
                    Create This Report
                  </button>
                </article>
              ))}
            </div>

            <div className="report-actions-inline">
              <button className="ops-link-btn" type="button" onClick={() => navigate('/reports')}>
                Open Reports Page
              </button>
              <button className="ops-link-btn" type="button" onClick={() => navigate('/personnel/history')}>
                View Draft and Submitted History
              </button>
            </div>
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
