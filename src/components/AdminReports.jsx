import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiCheckCircle, FiEye, FiMoreHorizontal, FiXCircle } from 'react-icons/fi';
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

const REPORT_ACTIONS = [
  { value: 'under_review', label: 'Review', icon: FiEye, tone: 'review' },
  { value: 'approved', label: 'Approve', icon: FiCheckCircle, tone: 'approve' },
  { value: 'rejected', label: 'Reject', icon: FiXCircle, tone: 'reject' }
];

const REPORT_ACTION_MENU_WIDTH = 190;

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

function ClampedText({ children }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef(null);

  useLayoutEffect(() => {
    if (expanded) return undefined;

    const el = textRef.current;
    if (!el) return undefined;

    const checkClamped = () => setIsClamped(el.scrollHeight > el.clientHeight + 1);
    checkClamped();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(checkClamped)
      : null;
    if (observer) observer.observe(el);

    window.addEventListener('resize', checkClamped);
    return () => {
      window.removeEventListener('resize', checkClamped);
      if (observer) observer.disconnect();
    };
  }, [children, expanded]);

  return (
    <div className="admin-reports-cell-content">
      <span ref={textRef} className={`admin-reports-clamped-text${expanded ? ' expanded' : ''}`}>
        {children}
      </span>
      {isClamped && (
        <button
          type="button"
          className="admin-reports-see-more"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}

function ReportActionsMenu({ report, isBusy, onStatusChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuPosition(null);
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current || !isOpen) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.getBoundingClientRect().height || 144;
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
      Math.max(triggerRect.right - REPORT_ACTION_MENU_WIDTH, viewportPadding),
      Math.max(viewportPadding, window.innerWidth - REPORT_ACTION_MENU_WIDTH - viewportPadding)
    );

    setMenuPosition({ top, left });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    updateMenuPosition();

    const handleOutsidePointer = (event) => {
      if (
        !triggerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        closeMenu();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
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
  }, [closeMenu, isOpen, updateMenuPosition]);

  useEffect(() => {
    if (isOpen && menuPosition) {
      menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    }
  }, [isOpen, menuPosition]);

  const handleMenuKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const menuItems = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);
    if (menuItems.length === 0) return;

    event.preventDefault();
    const currentIndex = menuItems.indexOf(document.activeElement);
    let nextIndex = currentIndex;

    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = menuItems.length - 1;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % menuItems.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;

    menuItems[nextIndex]?.focus();
  };

  return (
    <div className="admin-reports-actions">
      <button
        ref={triggerRef}
        type="button"
        className="admin-report-action-trigger"
        aria-label={`Open actions for ${report.title || 'report'}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Report actions"
        disabled={isBusy}
        onClick={() => {
          setMenuPosition(null);
          setIsOpen((open) => !open);
        }}
      >
        <FiMoreHorizontal aria-hidden="true" />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="admin-report-action-menu"
          role="menu"
          aria-label={`Actions for ${report.title || 'report'}`}
          onKeyDown={handleMenuKeyDown}
          style={{
            top: menuPosition?.top ?? 0,
            left: menuPosition?.left ?? 0,
            visibility: menuPosition ? 'visible' : 'hidden'
          }}
        >
          {REPORT_ACTIONS.map((action) => {
            const ActionIcon = action.icon;

            return (
              <button
                key={action.value}
                type="button"
                role="menuitem"
                className={`admin-report-action-menu-item action-${action.tone}`}
                onClick={() => {
                  closeMenu();
                  onStatusChange(report, action.value);
                }}
              >
                <ActionIcon aria-hidden="true" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

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

  const renderReportActions = (report, isBusy) => (
    <ReportActionsMenu
      report={report}
      isBusy={isBusy}
      onStatusChange={handleStatusChange}
    />
  );

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
            <>
              <div className="admin-reports-table-wrap">
                <table className="admin-reports-table">
                  <thead>
                    <tr>
                      <th className="col-title">Title</th>
                      <th className="col-submitted-by">Submitted By</th>
                      <th className="col-submitted-at">Submitted At</th>
                      <th className="col-category">Category</th>
                      <th className="col-status">Status</th>
                      <th className="col-file">File</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map((report) => {
                      const isBusy = processingId === report.report_id;
                      return (
                        <tr key={report.report_id}>
                          <td className="col-title">
                            <ClampedText>{report.title || '-'}</ClampedText>
                          </td>
                          <td className="col-submitted-by">
                            <ClampedText>{report.created_by_name || '-'}</ClampedText>
                          </td>
                          <td className="col-submitted-at">
                            <span className="admin-reports-date">{formatDateTime(report.submitted_at)}</span>
                          </td>
                          <td className="col-category">
                            <ClampedText>{report.category || '-'}</ClampedText>
                          </td>
                          <td className="col-status">
                            <span className={`report-status-pill status-${String(report.status || '').toLowerCase().replace(/_/g, '-')}`}>
                              {String(report.status || '-').replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="col-file">
                            {report.pdf_url ? (
                              <a className="action-open-file" href={report.pdf_url} target="_blank" rel="noreferrer">Open File</a>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="col-actions">
                            {renderReportActions(report, isBusy)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="admin-reports-mobile-list">
                {filteredReports.map((report) => {
                  const isBusy = processingId === report.report_id;

                  return (
                    <div className="admin-report-card" key={report.report_id}>
                      <div className="admin-report-card-header">
                        <h3>
                          <ClampedText>{report.title || '-'}</ClampedText>
                        </h3>

                        <span
                          className={`report-status-pill status-${String(report.status || '')
                            .toLowerCase()
                            .replace(/_/g, '-')}`}
                        >
                          {String(report.status || '-').replace('_', ' ').toUpperCase()}
                        </span>
                      </div>

                      <div className="admin-report-card-body">
                        <div className="admin-report-card-field">
                          <strong>Submitted By</strong>
                          <ClampedText>{report.created_by_name || '-'}</ClampedText>
                        </div>

                        <div className="admin-report-card-field">
                          <strong>Submitted At</strong>
                          <span>{formatDateTime(report.submitted_at)}</span>
                        </div>

                        <div className="admin-report-card-field">
                          <strong>Category</strong>
                          <ClampedText>{report.category || '-'}</ClampedText>
                        </div>

                        <div className="admin-report-card-field">
                          <strong>PDF</strong>
                          {report.pdf_url ? (
                            <a
                              className="action-open-file"
                              href={report.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open File
                            </a>
                          ) : (
                            <span>-</span>
                          )}
                        </div>
                      </div>

                      <div className="admin-report-card-actions">
                        {renderReportActions(report, isBusy)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
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
