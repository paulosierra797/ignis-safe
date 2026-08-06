import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './Reports.css';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { FaTimes } from 'react-icons/fa';
import UnsavedChangesPrompt from './UnsavedChangesPrompt';
import { useUser } from '../context/UserContext';
import {
  submitInvestigationReport,
  getPersonnelReportHistory,
  getReportAttachments,
  isAllowedReportAttachment,
  REPORT_ATTACHMENT_ACCEPT,
  REPORT_ATTACHMENT_FORMATS_LABEL
} from '../utils/reportsService';
import { logPersonnelActivity } from '../utils/activityLogService';
import { formatStatusLabel } from '../utils/statusUtils';

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

const getFileType = (fileName) => {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName || '');
  return match ? match[1].toUpperCase() : 'FILE';
};

const MAX_REPORT_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_REPORT_ATTACHMENTS = 5;
const EMPTY_HISTORY_FILTERS = {
  title: '',
  fileName: '',
  date: '',
  status: 'all'
};

const formatDateFilterValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!size || size <= 0) return '';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${unitIndex === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
};

function ReportAttachmentCount({ report }) {
  const attachments = getReportAttachments(report);
  if (attachments.length === 0) return <span>-</span>;
  return <span>{attachments.length} {attachments.length === 1 ? 'File' : 'Files'}</span>;
}

function ReportFileAction({ report, onViewFiles }) {
  const attachments = getReportAttachments(report);
  if (attachments.length === 0) return <span>-</span>;

  if (attachments.length === 1) {
    return (
      <a
        className="view-btn"
        href={attachments[0].file_url}
        target="_blank"
        rel="noreferrer"
        title={attachments[0].file_name}
      >
        Open File
      </a>
    );
  }

  return (
    <button type="button" className="view-btn" onClick={() => onViewFiles(report)}>
      View Files ({attachments.length})
    </button>
  );
}

function AttachedFilesModal({ report, onClose }) {
  const attachments = getReportAttachments(report);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="attached-files-modal-overlay" onClick={onClose}>
      <div
        className="attached-files-modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attached-files-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="attached-files-modal-header">
          <h3 id="attached-files-modal-title">Attached Files</h3>
          <button
            type="button"
            className="attached-files-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="attached-files-modal-body">
          {attachments.length === 0 ? (
            <p className="attached-files-modal-empty">No attachments found.</p>
          ) : (
            <ul className="attached-files-modal-list">
              {attachments.map((attachment, index) => {
                const fileSize = formatFileSize(attachment.size_bytes);
                return (
                  <li key={`${attachment.file_url}-${index}`} className="attached-files-modal-item">
                    <div className="attached-files-modal-item-info">
                      <span className="attached-files-modal-item-name" title={attachment.file_name}>
                        {attachment.file_name}
                      </span>
                      <span className="attached-files-modal-item-meta">
                        {getFileType(attachment.file_name)}
                        {fileSize ? ` • ${fileSize}` : ''}
                      </span>
                    </div>
                    <a
                      className="view-btn"
                      href={attachment.file_url}
                      target="_blank"
                      rel="noreferrer"
                      title={attachment.file_name}
                    >
                      View
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

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

    window.addEventListener('resize', checkClamped);
    return () => window.removeEventListener('resize', checkClamped);
  }, [children, expanded]);

  return (
    <div className="report-history-cell-content">
      <span ref={textRef} className={`clamped-text${expanded ? ' expanded' : ''}`}>
        {children}
      </span>
      {isClamped && (
        <button
          type="button"
          className="see-more-btn"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}

const getStatusClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'submitted') return 'status-submitted';
  if (normalized === 'under_review') return 'status-under-review';
  if (normalized === 'approved') return 'status-approved';
  if (normalized === 'rejected') return 'status-rejected';
  return '';
};

export default function Reports() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [reportHistory, setReportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyMessage, setHistoryMessage] = useState('');
  const [historyFilters, setHistoryFilters] = useState({ ...EMPTY_HISTORY_FILTERS });
  const [filesModalReport, setFilesModalReport] = useState(null);
  const hasUnsavedReport = Boolean(reportTitle.trim() || selectedFiles.length > 0);

  const loadReportHistory = useCallback(async () => {
    if (!currentUser?.admin_id) {
      setReportHistory([]);
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    setHistoryMessage('');

    const { data, error } = await getPersonnelReportHistory(currentUser.admin_id);
    if (error) {
      setHistoryMessage(`Failed to load report history: ${error}`);
      setReportHistory([]);
    } else {
      setReportHistory((data || []).filter((report) => report.status !== 'draft'));
    }

    setLoadingHistory(false);
  }, [currentUser?.admin_id]);

  useEffect(() => {
    loadReportHistory();
  }, [loadReportHistory]);

  const filteredReportHistory = useMemo(() => {
    return reportHistory.filter((report) => {
      const attachmentNames = getReportAttachments(report)
        .map((attachment) => attachment.file_name)
        .join(' ')
        .toLowerCase();
      const reportStatus = String(report.status || '').toLowerCase();

      return (
        (!historyFilters.title.trim() ||
          String(report.title || '').toLowerCase().includes(historyFilters.title.trim().toLowerCase())) &&
        (!historyFilters.fileName.trim() ||
          attachmentNames.includes(historyFilters.fileName.trim().toLowerCase())) &&
        (!historyFilters.date ||
          formatDateFilterValue(report.submitted_at || report.created_at) === historyFilters.date) &&
        (historyFilters.status === 'all' || reportStatus === historyFilters.status)
      );
    });
  }, [reportHistory, historyFilters]);

  const hasHistoryFilters = Object.entries(historyFilters).some(([key, value]) =>
    key === 'status' ? value !== 'all' : Boolean(value)
  );

  const updateHistoryFilter = (field, value) => {
    setHistoryFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleClearHistoryFilters = () => setHistoryFilters({ ...EMPTY_HISTORY_FILTERS });

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (files.some((file) => !isAllowedReportAttachment(file))) {
      setMessage({
        type: 'error',
        text: `Unsupported file format. Accepted formats: ${REPORT_ATTACHMENT_FORMATS_LABEL}.`
      });
      return;
    }

    if (files.some((file) => file.size > MAX_REPORT_FILE_SIZE_BYTES)) {
      setMessage({ type: 'error', text: 'Each attachment must be 20MB or smaller.' });
      return;
    }

    const uniqueFiles = [...selectedFiles];
    files.forEach((file) => {
      const alreadySelected = uniqueFiles.some((selected) =>
        selected.name === file.name &&
        selected.size === file.size &&
        selected.lastModified === file.lastModified
      );
      if (!alreadySelected) uniqueFiles.push(file);
    });

    if (uniqueFiles.length > MAX_REPORT_ATTACHMENTS) {
      setMessage({ type: 'error', text: `You can attach up to ${MAX_REPORT_ATTACHMENTS} files.` });
      return;
    }

    setSelectedFiles(uniqueFiles);
    setMessage({ type: '', text: '' });
  };

  const handleRemoveFile = (indexToRemove) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setMessage({ type: '', text: '' });

    if (!currentUser?.admin_id) {
      setMessage({ type: 'error', text: 'No personnel account found in the current session.' });
      return;
    }

    if (selectedFiles.length === 0) {
      setMessage({ type: 'error', text: 'Please choose at least one file to upload.' });
      return;
    }

    if (selectedFiles.length > MAX_REPORT_ATTACHMENTS) {
      setMessage({ type: 'error', text: `You can attach up to ${MAX_REPORT_ATTACHMENTS} files.` });
      return;
    }

    if (selectedFiles.some((file) => !isAllowedReportAttachment(file))) {
      setMessage({
        type: 'error',
        text: `Unsupported file format. Accepted formats: ${REPORT_ATTACHMENT_FORMATS_LABEL}.`
      });
      return;
    }

    if (selectedFiles.some((file) => file.size > MAX_REPORT_FILE_SIZE_BYTES)) {
      setMessage({ type: 'error', text: 'Each attachment must be 20MB or smaller.' });
      return;
    }

    const fileName = selectedFiles[0].name || 'uploaded-report.pdf';
    setIsSubmitting(true);

    try {
      const { error } = await submitInvestigationReport({
        reportType: 'finalInvestigation',
        title: reportTitle.trim() || fileName,
        category: 'Uploaded Report',
        reportPayload: {
          source: 'file_upload',
          original_file_names: selectedFiles.map((file) => file.name)
        },
        attachmentFiles: selectedFiles,
        createdBy: currentUser.admin_id,
        createdByName: currentUser?.name || currentUser?.email || 'Personnel'
      });

      if (error) {
        setMessage({ type: 'error', text: `Failed to submit report: ${error}` });
        return;
      }

      setReportTitle('');
      setSelectedFiles([]);
      setMessage({
        type: 'success',
        text: `${selectedFiles.length} report ${selectedFiles.length === 1 ? 'file was' : 'files were'} submitted successfully for admin review.`
      });

      void logPersonnelActivity({
        personnelId: currentUser.admin_id,
        activityType: 'report_submission',
        action: 'Administrative Report Submitted',
        details: `Submitted "${reportTitle.trim() || fileName}".`
      });

      loadReportHistory();
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to submit report: ${String(error?.message || error)}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="reports-page-container">
      <Sidebar variant="personnel" />

      {/* Main Content */}
      <div className="reports-main">
        <PageHeader
          title="Reports"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
        />

        <div className="reports-content">
          <div className="create-report-header">
            <h2>Submit Administrative Report</h2>
            <p className="create-report-description">
              Submit completed official reports directly to the administrator for review and recordkeeping.
              Attach up to five relevant administrative report files using the supported document, spreadsheet,
              presentation, text, or image formats.
            </p>
          </div>

          <div className="report-upload-card">
            <div className="report-upload-field">
              <label htmlFor="report-title" className="report-upload-label">Report Title</label>
              <textarea
                id="report-title"
                className="report-upload-input report-upload-title-input"
                value={reportTitle}
                onChange={(event) => setReportTitle(event.target.value)}
                placeholder="Enter report title"
                rows={5}
                maxLength={200}
              />
            </div>

            <div className="report-upload-field">
              <label htmlFor="report-file" className="report-upload-label">Upload Files</label>
              <input
                id="report-file"
                type="file"
                className="report-upload-input"
                accept={REPORT_ATTACHMENT_ACCEPT}
                multiple
                onChange={handleFileChange}
              />
              <p className="report-upload-hint">
                {REPORT_ATTACHMENT_FORMATS_LABEL}. Up to {MAX_REPORT_ATTACHMENTS} files, maximum 20MB each.
              </p>
            </div>

            {selectedFiles.length > 0 && (
              <ul className="report-upload-selected-list">
                {selectedFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      aria-label={`Remove ${file.name}`}
                      title="Remove file"
                    >
                      <FaTimes aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="report-upload-actions">
              <button
                className="create-report-btn"
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>

            {message.text && (
              <div className={`report-upload-message report-upload-message-${message.type}`}>
                {message.text}
              </div>
            )}
          </div>

          <div className="report-history-section">
            <div className="create-report-header">
              <h2>Administrative Report History</h2>
              <p className="create-report-description">
                Reports you have submitted, along with their current review status and any admin remarks.
              </p>
            </div>

            {historyMessage && (
              <div className="report-upload-message report-upload-message-error">{historyMessage}</div>
            )}

            <div className="report-history-filters">
              <label className="report-history-filter">
                <span>Report Title</span>
                <input
                  type="text"
                  className="report-history-search-input"
                  placeholder="Enter title"
                  value={historyFilters.title}
                  onChange={(event) => updateHistoryFilter('title', event.target.value)}
                />
              </label>

              <label className="report-history-filter">
                <span>File Name</span>
                <input
                  type="text"
                  className="report-history-search-input"
                  placeholder="Example: report.pdf"
                  value={historyFilters.fileName}
                  onChange={(event) => updateHistoryFilter('fileName', event.target.value)}
                />
              </label>

              <label className="report-history-filter">
                <span>Date Submitted</span>
                <input
                  type="date"
                  className="report-history-search-input"
                  value={historyFilters.date}
                  onChange={(event) => updateHistoryFilter('date', event.target.value)}
                />
              </label>

              <label className="report-history-filter">
                <span>Status</span>
                <select
                  className="report-history-search-input"
                  value={historyFilters.status}
                  onChange={(event) => updateHistoryFilter('status', event.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="submitted">Submitted</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>

              <button
                type="button"
                className="report-history-search-clear"
                onClick={handleClearHistoryFilters}
                disabled={!hasHistoryFilters}
              >
                <FaTimes aria-hidden="true" /> Clear Filters
              </button>
            </div>

            <div className="report-history-table-container">
              <table className="report-history-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Report Title</th>
                    <th>Attachments</th>
                    <th>Date Submitted</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory && (
                    <tr>
                      <td colSpan="6" className="no-data">Loading report history...</td>
                    </tr>
                  )}
                  {!loadingHistory && filteredReportHistory.map((report, index) => (
                    <tr key={report.report_id}>
                      <td className="report-history-no-cell">{index + 1}</td>
                      <td>
                        {report.title ? <ClampedText>{report.title}</ClampedText> : '-'}
                      </td>
                      <td>
                        <ReportAttachmentCount report={report} />
                      </td>
                      <td>{formatDateTime(report.submitted_at || report.created_at)}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(report.status)}`}>
                          {formatStatusLabel(report.status)}
                        </span>
                      </td>
                      <td>
                        <ReportFileAction report={report} onViewFiles={setFilesModalReport} />
                      </td>
                    </tr>
                  ))}
                  {!loadingHistory && reportHistory.length === 0 && (
                    <tr>
                      <td colSpan="6" className="no-data">You have not submitted any reports yet.</td>
                    </tr>
                  )}
                  {!loadingHistory && reportHistory.length > 0 && filteredReportHistory.length === 0 && (
                    <tr>
                      <td colSpan="6" className="no-data">No reports match your search.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="report-history-mobile-list">
              {filteredReportHistory.map((report) => (
                <div className="report-history-card" key={report.report_id}>
                  <div className="report-history-card-header">
                    <h3>{report.title || '-'}</h3>
                    <span className={`status-badge ${getStatusClass(report.status)}`}>
                      {formatStatusLabel(report.status)}
                    </span>
                  </div>
                  <div className="report-history-card-row">
                    <strong>Attachments:</strong>
                    <ReportAttachmentCount report={report} />
                  </div>
                  <p><strong>Date Submitted:</strong> {formatDateTime(report.submitted_at || report.created_at)}</p>
                  <ReportFileAction report={report} onViewFiles={setFilesModalReport} />
                </div>
              ))}
              {!loadingHistory && reportHistory.length === 0 && (
                <p className="no-data">You have not submitted any reports yet.</p>
              )}
              {!loadingHistory && reportHistory.length > 0 && filteredReportHistory.length === 0 && (
                <p className="no-data">No reports match your search.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <UnsavedChangesPrompt
        when={hasUnsavedReport}
        title="Leave without submitting?"
        message="Your report title or attached files have not been submitted. Are you sure you want to leave this page?"
        stayLabel="Stay on Reports"
      />

      {filesModalReport && (
        <AttachedFilesModal
          report={filesModalReport}
          onClose={() => setFilesModalReport(null)}
        />
      )}
    </div>
  );
}
