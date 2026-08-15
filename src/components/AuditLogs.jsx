import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { FaSearch } from 'react-icons/fa';
import './AuditLogs.css';
import { getAdminAuditLogs } from '../utils/usersService';
import { formatStatusLabel } from '../utils/statusUtils';

const PAGE_SIZE = 10;
const DETAILS_TRUNCATE_LENGTH = 70;

const getStatusClass = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized.includes('fail')) return 'failed';
  if (normalized.includes('pending')) return 'pending';
  return 'success';
};

const escapeCsvValue = (value) => {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export default function AuditLogs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All Actions');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [dateRange, setDateRange] = useState([null, null]);
  const [rangeStart, rangeEnd] = dateRange;
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
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

    const filtered = auditLogs.filter((log) => {
      const matchesSearch =
        !normalizedSearch ||
        String(log.user || '').toLowerCase().includes(normalizedSearch) ||
        String(log.details || '').toLowerCase().includes(normalizedSearch);

      const matchesAction = actionFilter === 'All Actions' || log.action === actionFilter;

      const matchesStatus =
        statusFilter === 'All Statuses' || getStatusClass(log.status) === statusFilter.toLowerCase();

      let matchesDate = true;
      if (rangeStart) {
        const logDate = new Date(log.timestamp);
        const start = new Date(rangeStart);
        start.setHours(0, 0, 0, 0);
        const end = new Date(rangeEnd || rangeStart);
        end.setHours(23, 59, 59, 999);
        matchesDate = logDate >= start && logDate <= end;
      }

      return matchesSearch && matchesAction && matchesStatus && matchesDate;
    });

    return filtered.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [auditLogs, filterSearch, actionFilter, statusFilter, rangeStart, rangeEnd]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedLogs = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, safePage]);

  const handleSearchChange = (value) => {
    setFilterSearch(value);
    setCurrentPage(1);
  };

  const handleActionFilterChange = (value) => {
    setActionFilter(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleDateRangeChange = (update) => {
    setDateRange(update);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilterSearch('');
    setActionFilter('All Actions');
    setStatusFilter('All Statuses');
    setDateRange([null, null]);
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    const headers = ['No.', 'Timestamp', 'User', 'Action', 'Details', 'Status'];
    const rows = filteredLogs.map((log, index) => [
      index + 1,
      new Date(log.timestamp).toLocaleString('en-US'),
      log.user,
      log.action,
      log.details,
      formatStatusLabel(log.status)
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
              <label className="audit-logs-filter-label" htmlFor="audit-logs-search-input">Search User / Details</label>
              <div className="audit-logs-search-wrapper">
                <FaSearch className="audit-logs-search-icon" />
                <input
                  id="audit-logs-search-input"
                  type="text"
                  placeholder="Search by user or details"
                  value={filterSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="audit-logs-search-input"
                />
              </div>
            </div>

            <div className="audit-logs-filter-group">
              <label className="audit-logs-filter-label" htmlFor="audit-logs-action-select">Action Type</label>
              <select
                id="audit-logs-action-select"
                value={actionFilter}
                onChange={(e) => handleActionFilterChange(e.target.value)}
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
              <label className="audit-logs-filter-label" htmlFor="audit-logs-status-select">Status</label>
              <select
                id="audit-logs-status-select"
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="audit-logs-select"
              >
                <option>All Statuses</option>
                <option>Success</option>
                <option>Failed</option>
                <option>Pending</option>
              </select>
            </div>

            <div className="audit-logs-filter-group">
              <label className="audit-logs-filter-label" htmlFor="audit-logs-date-input">Date Range</label>
              <div className="audit-logs-datepicker-wrapper">
                <DatePicker
                  id="audit-logs-date-input"
                  selectsRange
                  startDate={rangeStart}
                  endDate={rangeEnd}
                  onChange={handleDateRangeChange}
                  isClearable
                  dateFormat="dd/MM/yyyy"
                  placeholderText="dd/mm/yyyy - dd/mm/yyyy"
                  className="audit-logs-datepicker"
                />
              </div>
            </div>

            <div className="audit-logs-filter-group audit-logs-filter-actions">
              <span className="audit-logs-filter-label audit-logs-filter-actions-label">&nbsp;</span>
              <div className="audit-logs-filter-actions-buttons">
                <button type="button" className="audit-logs-clear" onClick={handleClearFilters}>
                  Clear Filters
                </button>
                <button type="button" className="audit-logs-export" onClick={handleExportCsv} disabled={filteredLogs.length === 0}>
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="audit-logs-table-card">
          <table className="audit-logs-table">
            <thead>
              <tr>
                <th className="audit-logs-no-column">NO.</th>
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
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                    Loading audit logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                    No audit logs found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log, index) => (
                  <tr key={log.id}>
                    <td className="audit-logs-no-column">{(safePage - 1) * PAGE_SIZE + index + 1}</td>
                    <td>{new Date(log.timestamp).toLocaleString('en-US')}</td>
                    <td>{log.user}</td>
                    <td>
                      <span className={`audit-logs-action-badge ${log.actionType}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div className="audit-logs-details-text">{log.details}</div>
                      {String(log.details || '').length > DETAILS_TRUNCATE_LENGTH && (
                        <button
                          type="button"
                          className="audit-logs-view-details-btn"
                          onClick={() => setSelectedLog(log)}
                        >
                          View Details
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`audit-logs-status-badge ${getStatusClass(log.status)}`}>
                        {formatStatusLabel(log.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!loadingLogs && filteredLogs.length > 0 && (
            <div className="audit-logs-pagination">
              <button
                type="button"
                className="audit-logs-page-btn"
                onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
              >
                Previous
              </button>
              <span className="audit-logs-page-info">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="audit-logs-page-btn"
                onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedLog && (
        <div className="audit-logs-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="audit-logs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="audit-logs-modal-header">
              <h3>Activity Details</h3>
              <button
                type="button"
                className="audit-logs-modal-close"
                onClick={() => setSelectedLog(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="audit-logs-modal-body">
              <div className="audit-logs-modal-row">
                <span className="audit-logs-modal-row-label">Timestamp</span>
                <span>{new Date(selectedLog.timestamp).toLocaleString('en-US')}</span>
              </div>
              <div className="audit-logs-modal-row">
                <span className="audit-logs-modal-row-label">User</span>
                <span>{selectedLog.user}</span>
              </div>
              <div className="audit-logs-modal-row">
                <span className="audit-logs-modal-row-label">Action</span>
                <span className={`audit-logs-action-badge ${selectedLog.actionType}`}>
                  {selectedLog.action}
                </span>
              </div>
              <div className="audit-logs-modal-row">
                <span className="audit-logs-modal-row-label">Status</span>
                <span className={`audit-logs-status-badge ${getStatusClass(selectedLog.status)}`}>
                  {formatStatusLabel(selectedLog.status)}
                </span>
              </div>
              <div className="audit-logs-modal-details">
                <span className="audit-logs-modal-row-label">Details</span>
                <p>{selectedLog.details}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
