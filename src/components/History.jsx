import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './History.css';
import { useUser } from '../context/UserContext';
import { getPersonnelReportHistory } from '../utils/reportsService';

export default function History() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('All Category');
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [tableMessage, setTableMessage] = useState('');

  useEffect(() => {
    const loadHistory = async () => {
      if (!currentUser?.admin_id) {
        setReports([]);
        setLoadingReports(false);
        return;
      }

      setLoadingReports(true);
      setTableMessage('');

      const { data, error } = await getPersonnelReportHistory(currentUser.admin_id);
      if (error) {
        setTableMessage(`Failed to load report history: ${error}`);
        setReports([]);
      } else {
        setReports(data || []);
      }

      setLoadingReports(false);
    };

    loadHistory();
  }, [currentUser?.admin_id]);

  // Calculate statistics
  const totalReports = reports.length;
  const draftReports = reports.filter((r) => r.status === 'draft').length;
  const submittedReports = reports.filter((r) => r.status !== 'draft').length;

  const handleClearFilters = () => {
    setFilterDate('');
    setFilterCategory('All Category');
    setSearchQuery('');
  };

  const filteredReports = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return reports.filter((report) => {
      const effectiveDate = report.submitted_at || report.updated_at || report.created_at;
      const dateAsInput = effectiveDate
        ? new Date(effectiveDate).toISOString().split('T')[0]
        : '';

      const matchesSearch =
        !normalizedSearch ||
        String(report.title || '').toLowerCase().includes(normalizedSearch) ||
        String(report.created_by_name || '').toLowerCase().includes(normalizedSearch) ||
        String(report.report_no || '').toLowerCase().includes(normalizedSearch);
      const matchesCategory = filterCategory === 'All Category' || report.category === filterCategory;
      const matchesDate = !filterDate || dateAsInput === filterDate;
      return matchesSearch && matchesCategory && matchesDate;
    });
  }, [reports, searchQuery, filterCategory, filterDate]);

  const getStatusClass = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'draft') return 'status-draft';
    if (normalized === 'submitted') return 'status-submitted';
    if (normalized === 'under_review') return 'status-under-review';
    if (normalized === 'approved') return 'status-approved';
    if (normalized === 'rejected') return 'status-rejected';
    return '';
  };

  const handleView = (report) => {
    if (!report?.pdf_url) {
      setTableMessage('This draft has no generated PDF yet. Submit it first to generate the file.');
      return;
    }

    window.open(report.pdf_url, '_blank', 'noopener,noreferrer');
  };

  const handleContinueDraft = (report) => {
    navigate('/reports', {
      state: {
        continueDraft: {
          reportId: report.report_id,
          reportType: report.report_type,
          formValues: report.report_payload || {}
        }
      }
    });
  };

  return (
    <div className="history-container">
      <Sidebar variant="personnel" />

      <div className="history-content">
        <PageHeader
          title="History"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
          showSearch={false}
        />

        <div className="history-main">
          <h1 className="history-title">Report Management</h1>

          <div className="history-filters">
            <div className="search-section">
              <label>Search Report</label>
              <div className="search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by report..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="filter-section">
              <label>Filter by Date</label>
              <input
                type="date"
                className="filter-select"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>

            <div className="filter-section">
              <label>Filter by Category</label>
              <select
                className="filter-select"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="All Category">All Category</option>
                <option value="After Fire Operations">After Fire Operations</option>
                <option value="Spot Investigation">Spot Investigation</option>
                <option value="Final Investigation">Final Investigation</option>
              </select>
            </div>

            <button className="clear-filters-btn" onClick={handleClearFilters}>
              CLEAR FILTERS
            </button>
          </div>

          <div className="history-stats">
            <div className="stat-card">
              <div className="stat-label">Total Reports</div>
              <div className="stat-value">{totalReports}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Draft Reports</div>
              <div className="stat-value">{draftReports}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Submitted Reports</div>
              <div className="stat-value">{submittedReports}</div>
            </div>
          </div>

          {tableMessage && <div className="history-message">{tableMessage}</div>}

          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Report No.</th>
                  <th>Report Title</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Created by</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingReports && (
                  <tr>
                    <td colSpan="8" className="no-data">Loading report history...</td>
                  </tr>
                )}
                {!loadingReports && filteredReports.map((report, index) => (
                  <tr key={report.report_id}>
                    <td>{index + 1}</td>
                    <td>{report.report_no || '-'}</td>
                    <td>{report.title}</td>
                    <td>{report.category}</td>
                    <td>{new Date(report.submitted_at || report.updated_at || report.created_at).toLocaleDateString('en-US')}</td>
                    <td>{report.created_by_name || 'Personnel'}</td>
                    <td>
                      <span className={`status-badge ${getStatusClass(report.status)}`}>
                        {String(report.status || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {report.status === 'draft' ? (
                        <button className="continue-btn" onClick={() => handleContinueDraft(report)}>
                          Continue Draft
                        </button>
                      ) : (
                        <button className="view-btn" onClick={() => handleView(report)}>View</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!loadingReports && filteredReports.length === 0 && (
                  <tr>
                    <td colSpan="8" className="no-data">No draft/submitted reports found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
