import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { FaSearch } from 'react-icons/fa';
import './AuditLogs.css';
import { getIntelUnitAuditLogs } from '../utils/reportsService';

export default function IntelUnitAuditLogs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All Actions');
  const [selectedDate, setSelectedDate] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadAuditLogs = async () => {
      setLoadingLogs(true);
      setMessage('');

      const { data, error } = await getIntelUnitAuditLogs();
      if (error) {
        setMessage(`Failed to load audit logs: ${error}`);
        setAuditLogs([]);
      } else {
        setAuditLogs(data || []);
      }

      setLoadingLogs(false);
    };

    loadAuditLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const normalizedSearch = filterSearch.trim().toLowerCase();

    return auditLogs.filter((log) => {
      const matchesSearch =
        !normalizedSearch ||
        String(log.user || '').toLowerCase().includes(normalizedSearch) ||
        String(log.action || '').toLowerCase().includes(normalizedSearch) ||
        String(log.details || '').toLowerCase().includes(normalizedSearch);

      const matchesAction = actionFilter === 'All Actions' || log.action === actionFilter;

      const matchesDate =
        !selectedDate ||
        new Date(log.timestamp).toDateString() === selectedDate.toDateString();

      return matchesSearch && matchesAction && matchesDate;
    });
  }, [auditLogs, filterSearch, actionFilter, selectedDate]);

  const handleClearFilters = () => {
    setFilterSearch('');
    setActionFilter('All Actions');
    setSelectedDate(null);
  };

  return (
    <div className="audit-logs-container">
      <Sidebar variant="intel-unit" />

      <div className="audit-logs-main">
        <PageHeader
          title="Audit Logs"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
          showSearch={false}
        />

        <div className="audit-logs-content">
          <div className="audit-logs-header">
            <h2>Intel Unit Activity Logs</h2>
            <p className="audit-logs-description">
              Track personnel report submissions, profile updates, and archive management activities.
            </p>
          </div>

          {message && (
            <div style={{ marginBottom: '0.9rem', color: '#991b1b', fontWeight: 600 }}>
              {message}
            </div>
          )}

          <div className="audit-logs-filters">
            <div className="audit-logs-filter-row">
              <div className="audit-logs-search-wrapper">
                <FaSearch className="audit-logs-search-icon" />
                <input
                  type="text"
                  placeholder="Search by user, action or details"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="audit-logs-search-input"
                />
              </div>

              <div className="audit-logs-filter">
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="audit-logs-select"
                >
                  <option>All Actions</option>
                  <option>Report Submitted</option>
                  <option>Under Review</option>
                  <option>Report Approved</option>
                  <option>Report Rejected</option>
                  <option>Report Archived</option>
                  <option>Report Restored</option>
                  <option>Report Updated</option>
                </select>
              </div>

              <div className="audit-logs-datepicker-wrapper">
                <DatePicker
                  selected={selectedDate}
                  onChange={(date) => setSelectedDate(date)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="dd/mm/yyyy"
                  className="audit-logs-datepicker"
                />
              </div>

              <button className="audit-logs-clear" onClick={handleClearFilters}>
                CLEAR
              </button>
            </div>
          </div>

          <div className="audit-logs-table-card">
            <table className="audit-logs-table">
              <thead>
                <tr>
                  <th>TIMESTAMP</th>
                  <th>USER</th>
                  <th>ACTION</th>
                  <th>DETAILS</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {loadingLogs ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                      Loading audit logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                      No audit logs found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.timestamp).toLocaleString('en-US')}</td>
                      <td>{log.user}</td>
                      <td>
                        <span className={`audit-logs-action-badge ${log.actionType}`}>
                          {log.action}
                        </span>
                      </td>
                      <td>{log.details}</td>
                      <td>
                        <span className="audit-logs-status-badge success">
                          {log.status}
                        </span>
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
