import React, { useEffect, useState } from 'react';
import './Reports.css';
import InvestigationReport from './InvestigationReport';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Reports() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showReportForm, setShowReportForm] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState('');
  const [draftReportId, setDraftReportId] = useState(null);
  const [draftFormValues, setDraftFormValues] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const continueDraft = location.state?.continueDraft;
    if (!continueDraft) {
      return;
    }

    setSelectedReportType(continueDraft.reportType || 'finalInvestigation');
    setDraftReportId(continueDraft.reportId || null);
    setDraftFormValues(continueDraft.formValues || null);
    setShowReportForm(true);

    navigate('/reports', { replace: true, state: {} });
  }, [location.state, navigate]);

  const handleCreateReport = (reportType) => {
    setSelectedReportType(reportType);
    setDraftReportId(null);
    setDraftFormValues(null);
    setShowReportForm(true);
  };

  if (showReportForm) {
    return (
      <InvestigationReport
        reportType={selectedReportType}
        initialDraftReportId={draftReportId}
        initialFormValues={draftFormValues}
        onClose={() => {
          setShowReportForm(false);
          setSelectedReportType('');
          setDraftReportId(null);
          setDraftFormValues(null);
        }}
      />
    );
  }

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

        {/* Create New Report Section */}
        <div className="reports-content">
          <div className="create-report-header">
            <h2>Create New Report</h2>
            <p className="create-report-description">
              You can create and submit investigations reports. Select a report type below to begin.
            </p>
            <p className="create-report-hint">
              Select any type of investigation report to create and submit.
            </p>
          </div>

          <div className="report-cards-grid">
            {/* Fire Operations Report */}
            <div className="report-card">
              <h3>Fire Operations Report</h3>
              <p>Document operational actions, resource allocations, and response details for fire incidents.</p>
              <button 
                className="create-report-btn"
                onClick={() => handleCreateReport('fireOperations')}
              >
                Create Report
              </button>
            </div>

            {/* Spot Investigation Report */}
            <div className="report-card">
              <h3>Spot Investigation Report</h3>
              <p>Quick on-site assessment documenting investigation findings.</p>
              <button 
                className="create-report-btn"
                onClick={() => handleCreateReport('spotInvestigation')}
              >
                Create Report
              </button>
            </div>

            {/* Final Investigation Report */}
            <div className="report-card">
              <h3>Final Investigation Report</h3>
              <p>Comprehensive investigation detailing findings, analysis, and recommendations.</p>
              <button 
                className="create-report-btn"
                onClick={() => handleCreateReport('finalInvestigation')}
              >
                Create Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
