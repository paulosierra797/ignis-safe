import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './Reports.css';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { FaSearch, FaTimes } from 'react-icons/fa';
import { useBlocker } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { submitInvestigationReport, getPersonnelReportHistory } from '../utils/reportsService';
import { logPersonnelActivity } from '../utils/activityLogService';

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
  return match ? match[1].toUpperCase() : 'PDF';
};

const MAX_REPORT_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

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
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [reportHistory, setReportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyMessage, setHistoryMessage] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const hasUnsavedReport = Boolean(reportTitle.trim() || selectedFile);
  const navigationBlocker = useBlocker(hasUnsavedReport);

  useEffect(() => {
    if (!hasUnsavedReport) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedReport]);

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
    const normalizedQuery = historySearchQuery.trim().toLowerCase();
    if (!normalizedQuery) return reportHistory;

    return reportHistory.filter((report) => {
      const haystack = [
        report.title,
        report.pdf_file_name,
        formatDateTime(report.submitted_at || report.created_at),
        report.status,
        String(report.status || '').replace('_', ' '),
        report.internal_notes
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [reportHistory, historySearchQuery]);

  const handleClearHistorySearch = () => setHistorySearchQuery('');

  const stayOnReports = () => {
    navigationBlocker.reset?.();
  };

  const leaveReports = () => {
    navigationBlocker.proceed?.();
  };

  const isPdfFile = (file) => {
    if (!file) return false;
    const fileName = file.name || '';
    return fileName.toLowerCase().endsWith('.pdf') || String(file.type || '').toLowerCase().includes('pdf');
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;

    if (file && !isPdfFile(file)) {
      setSelectedFile(null);
      event.target.value = '';
      setMessage({ type: 'error', text: 'Only PDF files are accepted. Please upload a file in PDF format.' });
      return;
    }

    if (file && file.size > MAX_REPORT_FILE_SIZE_BYTES) {
      setSelectedFile(null);
      event.target.value = '';
      setMessage({ type: 'error', text: 'File size exceeds 20MB. Please upload a smaller PDF.' });
      return;
    }

    setSelectedFile(file);
    setMessage({ type: '', text: '' });
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

    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please choose a file to upload.' });
      return;
    }

    const fileName = selectedFile.name || 'uploaded-report.pdf';
    if (!isPdfFile(selectedFile)) {
      setMessage({ type: 'error', text: 'Only PDF files are accepted. Please upload a file in PDF format.' });
      return;
    }

    if (selectedFile.size > MAX_REPORT_FILE_SIZE_BYTES) {
      setMessage({ type: 'error', text: 'File size exceeds 20MB. Please upload a smaller PDF.' });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await submitInvestigationReport({
        reportType: 'finalInvestigation',
        title: reportTitle.trim() || fileName,
        category: 'Uploaded Report',
        reportPayload: {
          source: 'file_upload',
          original_file_name: fileName
        },
        pdfBlob: selectedFile,
        pdfFileName: fileName,
        createdBy: currentUser.admin_id,
        createdByName: currentUser?.name || currentUser?.email || 'Personnel'
      });

      if (error) {
        setMessage({ type: 'error', text: `Failed to submit report: ${error}` });
        return;
      }

      setReportTitle('');
      setSelectedFile(null);
      setMessage({ type: 'success', text: 'Report file submitted successfully for admin review.' });

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
              Only PDF files related to administrative reporting are accepted. Other file types or unrelated
              documents must not be allowed.
            </p>
          </div>

          <div className="report-upload-card">
            <div className="report-upload-field">
              <label htmlFor="report-title" className="report-upload-label">Report Title</label>
              <input
                id="report-title"
                type="text"
                className="report-upload-input"
                value={reportTitle}
                onChange={(event) => setReportTitle(event.target.value)}
                placeholder="Enter report title"
              />
            </div>

            <div className="report-upload-field">
              <label htmlFor="report-file" className="report-upload-label">Upload PDF File</label>
              <input
                id="report-file"
                type="file"
                className="report-upload-input"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
              />
              <p className="report-upload-hint">PDF format only. Maximum one file per submission.</p>
            </div>

            {selectedFile && (
              <p className="report-upload-selected">Selected: {selectedFile.name}</p>
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

            <div className="report-history-search-bar">
              <div className="report-history-search-wrapper">
                <FaSearch className="report-history-search-icon" />
                <input
                  type="text"
                  className="report-history-search-input"
                  placeholder="Search by title, file name, date, status, or admin remarks"
                  value={historySearchQuery}
                  onChange={(event) => setHistorySearchQuery(event.target.value)}
                  aria-label="Search report history"
                />
              </div>
              <button
                type="button"
                className="report-history-search-clear"
                onClick={handleClearHistorySearch}
                disabled={!historySearchQuery}
              >
                <FaTimes /> Clear Search
              </button>
            </div>

            <div className="report-history-table-container">
              <table className="report-history-table">
                <thead>
                  <tr>
                    <th>Report Title</th>
                    <th>File</th>
                    <th>Date Submitted</th>
                    <th>Status</th>
                    <th>Admin Remarks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory && (
                    <tr>
                      <td colSpan="6" className="no-data">Loading report history...</td>
                    </tr>
                  )}
                  {!loadingHistory && filteredReportHistory.map((report) => (
                    <tr key={report.report_id}>
                      <td>
                        {report.title ? <ClampedText>{report.title}</ClampedText> : '-'}
                      </td>
                      <td>
                        {report.pdf_file_name ? (
                          <ClampedText>
                            {report.pdf_file_name}
                            <span className="report-history-file-type"> ({getFileType(report.pdf_file_name)})</span>
                          </ClampedText>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>{formatDateTime(report.submitted_at || report.created_at)}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(report.status)}`}>
                          {String(report.status || '').replace('_', ' ')}
                        </span>
                      </td>
                      <td>{report.internal_notes || '-'}</td>
                      <td>
                        {report.pdf_url ? (
                          <a className="view-btn" href={report.pdf_url} target="_blank" rel="noreferrer">View</a>
                        ) : (
                          '-'
                        )}
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
                      {String(report.status || '').replace('_', ' ')}
                    </span>
                  </div>
                  <div className="report-history-card-row">
                    <strong>File:</strong>
                    {report.pdf_file_name ? (
                      <ClampedText>
                        {report.pdf_file_name}
                        <span className="report-history-file-type"> ({getFileType(report.pdf_file_name)})</span>
                      </ClampedText>
                    ) : (
                      <span> -</span>
                    )}
                  </div>
                  <p><strong>Date Submitted:</strong> {formatDateTime(report.submitted_at || report.created_at)}</p>
                  <p><strong>Admin Remarks:</strong> {report.internal_notes || '-'}</p>
                  {report.pdf_url && (
                    <a className="view-btn" href={report.pdf_url} target="_blank" rel="noreferrer">View</a>
                  )}
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

      {navigationBlocker.state === 'blocked' && (
        <div
          className="report-unsaved-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reportUnsavedTitle"
          aria-describedby="reportUnsavedDescription"
        >
          <div className="report-unsaved-modal">
            <div className="report-unsaved-icon" aria-hidden="true">!</div>
            <h2 id="reportUnsavedTitle">Leave without submitting?</h2>
            <p id="reportUnsavedDescription">
              Your report title or attached PDF has not been submitted. Are you sure you want to leave this page?
            </p>
            <div className="report-unsaved-actions">
              <button type="button" className="report-unsaved-stay" onClick={stayOnReports}>
                Stay on Reports
              </button>
              <button type="button" className="report-unsaved-leave" onClick={leaveReports}>
                Leave Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
