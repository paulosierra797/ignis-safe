import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import {
  getIntelUnitSubmittedReports,
  updateReportStatus
} from '../utils/reportsService';
import './AdminReports.css';

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' }
];

const formatDateTime = (value) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return value;
  }
};

export default function AdminReports() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [processingId, setProcessingId] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
const [rejectNotes, setRejectNotes] = useState('');
const [selectedReport, setSelectedReport] = useState(null);

  const loadReports = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });

    const { data, error } = await getIntelUnitSubmittedReports();
    if (error) {
      setReports([]);
      setMessage({ type: 'error', text: `Failed to load reports: ${error}` });
      setLoading(false);
      return;
    }

    setReports(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleStatusChange = async (report, nextStatus) => {
  if (!report?.report_id || !nextStatus) return;

  // 🔥 NEW: reject modal flow
  if (nextStatus === 'rejected') {
    setSelectedReport(report);
    setRejectModalOpen(true);
    return;
  }

  let notes = '';

  setProcessingId(report.report_id);

  const { error } = await updateReportStatus(
    report.report_id,
    nextStatus,
    notes
  );

  if (error) {
    setMessage({ type: 'error', text: `Failed to update status: ${error}` });
    setProcessingId('');
    return;
  }

  setReports((prev) =>
    prev.map((row) =>
      row.report_id === report.report_id
        ? { ...row, status: nextStatus }
        : row
    )
  );

  setMessage({
    type: 'success',
    text: `Report marked as ${nextStatus.replace('_', ' ')}.`
  });

  setProcessingId('');
};

const confirmReject = async () => {
  if (!selectedReport) return;

  setProcessingId(selectedReport.report_id);

  const { error } = await updateReportStatus(
    selectedReport.report_id,
    'rejected',
    rejectNotes
  );

  if (error) {
    setMessage({ type: 'error', text: `Failed to reject report: ${error}` });
  } else {
    setReports((prev) =>
      prev.map((row) =>
        row.report_id === selectedReport.report_id
          ? { ...row, status: 'rejected' }
          : row
      )
    );

    setMessage({ type: 'success', text: 'Report rejected.' });
  }

  setProcessingId('');
  setRejectModalOpen(false);
  setRejectNotes('');
  setSelectedReport(null);
};

  const filteredReports = reports.filter((report) => {
    const statusOk = statusFilter === 'all' || String(report.status || '').toLowerCase() === statusFilter;
    const text = `${report.title || ''} ${report.created_by_name || ''} ${report.category || ''}`.toLowerCase();
    const searchOk = !searchQuery.trim() || text.includes(searchQuery.toLowerCase());
    return statusOk && searchOk;
  });

  const submittedCount = reports.filter((report) => String(report.status || '').toLowerCase() === 'submitted').length;
  const reviewCount = reports.filter((report) => String(report.status || '').toLowerCase() === 'under_review').length;
  const approvedCount = reports.filter((report) => String(report.status || '').toLowerCase() === 'approved').length;
  const rejectedCount = reports.filter((report) => String(report.status || '').toLowerCase() === 'rejected').length;

  return (
    <div className="admin-reports-container">
      <Sidebar />

      <div className="admin-reports-main">
        <PageHeader
          title="Reports Management"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="admin-reports-card">
          <div className="admin-reports-toolbar">
            <div className="admin-reports-toolbar-left">
              <h2>Submitted Reports</h2>
              <span>{filteredReports.length} records</span>
            </div>
            <div className="admin-reports-toolbar-right">
              <button type="button" onClick={loadReports}>Refresh</button>
            </div>
          </div>

          <div className="admin-reports-stats">
            <span className="report-stat-chip chip-all">All {reports.length}</span>
            <span className="report-stat-chip chip-submitted">Submitted {submittedCount}</span>
            <span className="report-stat-chip chip-review">Under Review {reviewCount}</span>
            <span className="report-stat-chip chip-approved">Approved {approvedCount}</span>
            <span className="report-stat-chip chip-rejected">Rejected {rejectedCount}</span>
          </div>

          <div className="admin-reports-filterbar">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, submitted by, or category"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button type="button" className="admin-reports-clear" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
              Clear
            </button>
          </div>

          {message.text && (
            <div className={`admin-reports-message admin-reports-message-${message.type}`}>
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="admin-reports-empty">Loading reports...</div>
          ) : filteredReports.length === 0 ? (
            <div className="admin-reports-empty">No submitted reports found.</div>
          ) : (
            <div className="admin-reports-table-wrap">
              <table className="admin-reports-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Submitted By</th>
                    <th>Submitted At</th>
                    <th>Status</th>
                    <th>File</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((report) => {
                    const isBusy = processingId === report.report_id;
                    return (
                      <tr key={report.report_id}>
                        <td>{report.title || '-'}</td>
                        <td>{report.created_by_name || '-'}</td>
                        <td>{formatDateTime(report.submitted_at)}</td>
                        <td>
                          <span className={`report-status-pill status-${String(report.status || '').toLowerCase().replace(/_/g, '-')}`}>
                            {String(report.status || '-').replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {report.pdf_url ? (
                            <a href={report.pdf_url} target="_blank" rel="noreferrer">Open File</a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>
                          <div className="admin-reports-actions">
                            <button type="button" className="action-review" onClick={() => handleStatusChange(report, 'under_review')} disabled={isBusy}>Review</button>
                            <button type="button" className="action-approve" onClick={() => handleStatusChange(report, 'approved')} disabled={isBusy}>Approve</button>
                            <button type="button" className="action-reject" onClick={() => handleStatusChange(report, 'rejected')} disabled={isBusy}>Reject</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
          )}
          {rejectModalOpen && (
  <div className="modal-overlay">
    <div className="modal-box">
      <h3>Reject Report</h3>

      <p>Optional reason for rejection:</p>

      <textarea
        value={rejectNotes}
        onChange={(e) => setRejectNotes(e.target.value)}
        placeholder="Enter reason..."
        rows={4}
      />

      <div className="modal-actions">
  <button
    className="modal-btn cancel-btn"
    onClick={() => {
      setRejectModalOpen(false);
      setRejectNotes('');
      setSelectedReport(null);
    }}
  >
    Cancel
  </button>

  <button
    className="modal-btn confirm-btn"
    onClick={confirmReject}
    disabled={processingId}
  >
    Confirm Reject
  </button>
</div>
    </div>
  </div>
)}
        </div>
      </div>
    </div>
  );
}
