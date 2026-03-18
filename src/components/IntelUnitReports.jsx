import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Reports.css';
import { FaSearch } from 'react-icons/fa';
import { getIntelUnitSubmittedReports, updateReportStatus } from '../utils/reportsService';

export default function IntelUnitReports() {
  const [searchQuery, setSearchQuery] = useState('');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('All Category');
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [tableMessage, setTableMessage] = useState('');

  useEffect(() => {
    const loadReports = async () => {
      setLoadingReports(true);
      setTableMessage('');

      const { data, error } = await getIntelUnitSubmittedReports();

      if (error) {
        setTableMessage(`Failed to load reports: ${error}`);
        setReports([]);
      } else {
        setReports(data || []);
      }

      setLoadingReports(false);
    };

    loadReports();
  }, []);

  const filteredReports = useMemo(() => {
    const normalizedSearch = reportSearchQuery.trim().toLowerCase();

    return reports.filter((report) => {
      const submittedDate = report.submitted_at ? new Date(report.submitted_at) : null;
      const dateAsInput = submittedDate ? submittedDate.toISOString().split('T')[0] : '';

      const matchesSearch =
        !normalizedSearch ||
        String(report.title || '').toLowerCase().includes(normalizedSearch) ||
        String(report.created_by_name || '').toLowerCase().includes(normalizedSearch) ||
        String(report.report_no || '').toLowerCase().includes(normalizedSearch);

      const matchesCategory = filterCategory === 'All Category' || report.category === filterCategory;
      const matchesDate = !filterDate || dateAsInput === filterDate;

      return matchesSearch && matchesCategory && matchesDate;
    });
  }, [reports, reportSearchQuery, filterCategory, filterDate]);

  const handleClearFilters = () => {
    setReportSearchQuery('');
    setFilterDate('');
    setFilterCategory('All Category');
  };

  const handleUpdate = async (id) => {
    const { error } = await updateReportStatus(id, 'under_review');
    if (error) {
      setTableMessage(`Failed to update report: ${error}`);
      return;
    }

    setReports((prev) =>
      prev.map((item) =>
        item.report_id === id ? { ...item, status: 'under_review' } : item
      )
    );
  };

  const handleView = (pdfUrl) => {
    if (!pdfUrl) {
      setTableMessage('No PDF file found for this report.');
      return;
    }

    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const handleArchive = async (id) => {
    const { error } = await updateReportStatus(id, 'archived');
    if (error) {
      setTableMessage(`Failed to archive report: ${error}`);
      return;
    }

    setReports((prev) => prev.filter((item) => item.report_id !== id));
  };

  // Calculate stats
  const totalReports = reports.length;
  const afterFireActivity = reports.filter((r) => r.category === 'After Fire Operations').length;
  const underReviewCount = reports.filter((r) => r.status === 'under_review').length;

  return (
    <div className="reports-page-container">
      <Sidebar variant="intel-unit" />

      <div className="reports-main">
        <PageHeader
          title="Reports"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
          showSearch={false}
        />

        <div className="reports-content">
          <div className="create-report-header">
            <h2>Report Management</h2>
          </div>

          {/* Filters Row */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '2fr 1fr 1fr auto', 
            gap: '1rem', 
            marginBottom: '2rem',
            alignItems: 'end'
          }}>
            <div>
              <label style={{ 
                fontSize: '0.85rem', 
                fontWeight: '500', 
                color: '#6b7280', 
                display: 'block', 
                marginBottom: '0.5rem' 
              }}>
                Search Report
              </label>
              <div style={{ position: 'relative' }}>
                <FaSearch style={{ 
                  position: 'absolute', 
                  left: '1rem', 
                  top: '50%', 
                  transform: 'translateY(-50%)',
                  color: '#9ca3af',
                  fontSize: '0.9rem'
                }} />
                <input
                  type="text"
                  placeholder="Search for report"
                  value={reportSearchQuery}
                  onChange={(e) => setReportSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ 
                fontSize: '0.85rem', 
                fontWeight: '500', 
                color: '#6b7280', 
                display: 'block', 
                marginBottom: '0.5rem' 
              }}>
                Filter by Date
              </label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              />
            </div>

            <div>
              <label style={{ 
                fontSize: '0.85rem', 
                fontWeight: '500', 
                color: '#6b7280', 
                display: 'block', 
                marginBottom: '0.5rem' 
              }}>
                Filter by Category
              </label>
              <select 
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option>All Category</option>
                <option>After Fire Operations</option>
                <option>Spot Investigation</option>
                <option>Final Investigation</option>
              </select>
            </div>

            <button 
              onClick={handleClearFilters}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.target.style.background = '#d97706'}
              onMouseOut={(e) => e.target.style.background = '#f59e0b'}
            >
              CLEAR FILTERS
            </button>
          </div>

          {/* Stats Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '1.5rem', 
            marginBottom: '2rem' 
          }}>
            <div style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Total Reports
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                {totalReports}
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                After Fire Activity
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                {afterFireActivity}
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                After Activity
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                {underReviewCount}
              </div>
            </div>
          </div>

          {tableMessage && (
            <div style={{ marginBottom: '1rem', color: '#991b1b', fontWeight: 600 }}>
              {tableMessage}
            </div>
          )}

          {/* Table */}
          <div style={{ background: 'white', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f59e0b' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>No.</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Report No.</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Report Title</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Category</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Date Submitted</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Created by</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Status</th>
                  <th style={{ padding: '1rem', textAlign: 'center', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingReports && (
                  <tr>
                    <td colSpan={8} style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>Loading reports...</td>
                  </tr>
                )}
                {!loadingReports && filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>No submitted reports found.</td>
                  </tr>
                )}
                {!loadingReports && filteredReports.map((report, index) => (
                  <tr key={report.report_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{index + 1}</td>
                    <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{report.report_no || '-'}</td>
                    <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{report.title}</td>
                    <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{report.category}</td>
                    <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>
                      {report.submitted_at
                        ? new Date(report.submitted_at).toLocaleDateString('en-US')
                        : '-'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{report.created_by_name || '-'}</td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#4b5563', textTransform: 'capitalize' }}>
                      {String(report.status || '-').replace('_', ' ')}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleUpdate(report.report_id)}
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.4rem',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={(e) => e.target.style.background = '#d97706'}
                          onMouseOut={(e) => e.target.style.background = '#f59e0b'}
                        >
                          Update
                        </button>
                        <button
                          onClick={() => handleView(report.pdf_url)}
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: '#22c55e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.4rem',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={(e) => e.target.style.background = '#16a34a'}
                          onMouseOut={(e) => e.target.style.background = '#22c55e'}
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleArchive(report.report_id)}
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.4rem',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={(e) => e.target.style.background = '#b91c1c'}
                          onMouseOut={(e) => e.target.style.background = '#dc2626'}
                        >
                          Archive
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
