import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Reports.css';
import {
  getIntelUnitArchivedReports,
  permanentlyDeleteReport,
  restoreArchivedReport
} from '../utils/reportsService';

export default function IntelUnitArchive() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [archivedReports, setArchivedReports] = useState([]);
  const [loadingArchive, setLoadingArchive] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadArchivedReports = async () => {
      setLoadingArchive(true);
      setMessage('');

      const { data, error } = await getIntelUnitArchivedReports();
      if (error) {
        setMessage(`Failed to load archived reports: ${error}`);
        setArchivedReports([]);
      } else {
        setArchivedReports(data || []);
      }

      setLoadingArchive(false);
    };

    loadArchivedReports();
  }, []);

  const filteredReports = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return archivedReports.filter((report) => {
      const matchesSearch =
        !normalizedSearch ||
        String(report.title || '').toLowerCase().includes(normalizedSearch) ||
        String(report.created_by_name || '').toLowerCase().includes(normalizedSearch) ||
        String(report.report_no || '').toLowerCase().includes(normalizedSearch);
      const matchesCategory = filterCategory === 'All' || report.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [archivedReports, searchQuery, filterCategory]);

  const handleView = (pdfUrl) => {
    if (!pdfUrl) {
      setMessage('No PDF file found for this archived report.');
      return;
    }

    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const handleRestore = async (id) => {
    const shouldRestore = window.confirm('Are you sure you want to restore this report?');
    if (!shouldRestore) {
      return;
    }

    const { error } = await restoreArchivedReport(id);
    if (error) {
      setMessage(`Failed to restore report: ${error}`);
      return;
    }

    setArchivedReports((prev) => prev.filter((report) => report.report_id !== id));
    setMessage('Report restored successfully.');
  };

  const handlePermanentDelete = async (id) => {
    const shouldDelete = window.confirm('Are you sure you want to permanently delete this report? This action cannot be undone.');
    if (!shouldDelete) {
      return;
    }

    const { error } = await permanentlyDeleteReport(id);
    if (error) {
      setMessage(`Failed to permanently delete report: ${error}`);
      return;
    }

    setArchivedReports((prev) => prev.filter((report) => report.report_id !== id));
    setMessage('Archived report permanently deleted.');
  };

  return (
    <div className="reports-page-container">
      <Sidebar variant="intel-unit" />

      <div className="reports-main">
        <PageHeader
          title="Archive"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
          showSearch={false}
        />

        <div className="reports-content">
          <div className="create-report-header">
            <h2>Archived Reports</h2>
            <p className="create-report-description">
              View and manage archived investigation reports. Archived reports can be restored or permanently deleted.
            </p>
          </div>

          {message && (
            <div style={{ marginBottom: '1rem', color: '#1f2937', fontWeight: 600 }}>
              {message}
            </div>
          )}

          <div className="report-filters" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1f2937', display: 'block', marginBottom: '0.5rem' }}>
                  Filter by Category
                </label>
                <select 
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    fontSize: '0.95rem',
                    cursor: 'pointer'
                  }}
                >
                  <option>All</option>
                  <option>After Fire Operations</option>
                  <option>Spot Investigation</option>
                  <option>Final Investigation</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1f2937', display: 'block', marginBottom: '0.5rem' }}>
                  Total Archived: {filteredReports.length}
                </label>
              </div>
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#6b7280' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>No.</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Report No.</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Report Title</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Category</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Date Submitted</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Date Archived</th>
                  <th style={{ padding: '1rem', textAlign: 'left', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Created by</th>
                  <th style={{ padding: '1rem', textAlign: 'center', color: 'white', fontWeight: '600', fontSize: '0.9rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingArchive ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.95rem' }}>
                      Loading archived reports...
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.95rem' }}>
                      No archived reports found.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((report, index) => (
                    <tr key={report.report_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{index + 1}</td>
                      <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{report.report_no || '-'}</td>
                      <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{report.title}</td>
                      <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{report.category}</td>
                      <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>
                        {report.submitted_at ? new Date(report.submitted_at).toLocaleDateString('en-US') : '-'}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>
                        {report.updated_at ? new Date(report.updated_at).toLocaleDateString('en-US') : '-'}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.95rem', color: '#4b5563' }}>{report.created_by_name || '-'}</td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleView(report.pdf_url)}
                            style={{
                              padding: '0.4rem 0.8rem',
                              background: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.4rem',
                              fontSize: '0.85rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              transition: 'background 0.2s'
                            }}
                            onMouseOver={(e) => e.target.style.background = '#2563eb'}
                            onMouseOut={(e) => e.target.style.background = '#3b82f6'}
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleRestore(report.report_id)}
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
                            Restore
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(report.report_id)}
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
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
