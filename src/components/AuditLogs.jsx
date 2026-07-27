import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { FaSearch } from 'react-icons/fa';
import './AuditLogs.css';
import { getAdminAuditLogs } from '../utils/usersService';
import { formatStatusLabel } from '../utils/statusUtils';

export default function AuditLogs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All Actions');
  const [selectedDate, setSelectedDate] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [tableMessage, setTableMessage] = useState('');

  useEffect(() => {
    const loadAuditLogs = async () => {
      setLoadingLogs(true);
      setTableMessage('');

      const { data, error } = await getAdminAuditLogs();
      if (error) {
        setTableMessage(`Failed to load audit logs: ${error}`);
        setAuditLogs([]);
      } else {
        setAuditLogs(data || []);
      }

      setLoadingLogs(false);
    };

    loadAuditLogs();
  }, []);

  const totalActivities = auditLogs.length;
  const todaysActivities = useMemo(() => {
    const todayStr = new Date().toDateString();
    return auditLogs.filter((log) => new Date(log.timestamp).toDateString() === todayStr).length;
  }, [auditLogs]);

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
      <Sidebar />

      <div className="audit-logs-main">
        <PageHeader
          title="Audit Logs"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showSearch={false}
        />

        {tableMessage && (
          <div style={{ marginBottom: '0.9rem', color: '#991b1b', fontWeight: 600 }}>
            {tableMessage}
          </div>
        )}

        <div className="audit-logs-stats">
          <div className="audit-logs-stat-card">
            <div className="audit-logs-stat-label">Today's Activities</div>
            <div className="audit-logs-stat-value">{todaysActivities}</div>
          </div>
          <div className="audit-logs-stat-card">
            <div className="audit-logs-stat-label">Total Activities</div>
            <div className="audit-logs-stat-value">{totalActivities}</div>
          </div>
        </div>

        <div className="audit-logs-filters">
          <div className="audit-logs-filter-row">
            <div className="audit-logs-filter-group audit-logs-filter-search">
              <label className="audit-logs-filter-label" htmlFor="audit-logs-search-input">Search Activity</label>
              <div className="audit-logs-search-wrapper">
                <FaSearch className="audit-logs-search-icon" />
                <input
                  id="audit-logs-search-input"
                  type="text"
                  placeholder="Search by user or action"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="audit-logs-search-input"
                />
              </div>
            </div>

            <div className="audit-logs-filter-group">
              <label className="audit-logs-filter-label" htmlFor="audit-logs-action-select">Filter by Action</label>
              <select
                id="audit-logs-action-select"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="audit-logs-select"
              >
                <option>All Actions</option>
                <option>Account Created</option>
                <option>Account Updated</option>
                <option>Account Deleted</option>
                <option>User Login</option>
                <option>Organizational Chart Updated</option>
                <option>Attendance Export CSV</option>
                <option>Attendance Export PDF</option>
              </select>
            </div>

            <div className="audit-logs-filter-group">
              <label className="audit-logs-filter-label" htmlFor="audit-logs-date-input">Filter by Date</label>
              <div className="audit-logs-datepicker-wrapper">
                <DatePicker
                  id="audit-logs-date-input"
                  selected={selectedDate}
                  onChange={(date) => setSelectedDate(date)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="dd/mm/yyyy"
                  className="audit-logs-datepicker"
                />
              </div>
            </div>

            <div className="audit-logs-filter-group audit-logs-filter-clear-group">
              <button type="button" className="audit-logs-clear" onClick={handleClearFilters}>
                Clear Filters
              </button>
            </div>
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
                        {formatStatusLabel(log.status)}
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
  );
}
