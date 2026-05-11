import React, { useState } from 'react';
import './Reports.css';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useUser } from '../context/UserContext';
import { submitInvestigationReport } from '../utils/reportsService';

export default function Reports() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
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
    const isPdf = fileName.toLowerCase().endsWith('.pdf') || String(selectedFile.type || '').toLowerCase().includes('pdf');
    if (!isPdf) {
      setMessage({ type: 'error', text: 'Only PDF files are supported.' });
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
            <h2>Submit Report File</h2>
            <h4>All reports are for administrative use only</h4>
            <p className="create-report-description">
              Upload a completed report file and submit it directly to admin.
            </p>
            <p className="create-report-hint">
              No templates are required.
            </p>
          </div>

          <div className="report-upload-card">
            <label htmlFor="report-title" className="report-upload-label">Report Title (optional)</label>
            <input
              id="report-title"
              type="text"
              className="report-upload-input"
              value={reportTitle}
              onChange={(event) => setReportTitle(event.target.value)}
              placeholder="Enter report title"
            />

            <label htmlFor="report-file" className="report-upload-label">Upload PDF File</label>
            <input
              id="report-file"
              type="file"
              className="report-upload-input"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
            />

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
        </div>
      </div>
    </div>
  );
}
