import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import Pagination from './Pagination';
import PageHeader from './PageHeader';
import ToastMessage from './ToastMessage';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { FaDownload, FaSearch, FaTimes, FaDesktop, FaMobileAlt, FaTabletAlt, FaEllipsisH, FaInfoCircle } from 'react-icons/fa';
import './AuditLogs.css';
import { getAdminAuditLogs } from '../utils/usersService';
import { formatStatusLabel } from '../utils/statusUtils';

const PAGE_SIZE = 10;

const getStatusClass = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized.includes('fail')) return 'failed';
  if (normalized.includes('pending')) return 'pending';
  return 'success';
};

const DEVICE_ICONS = {
  Mobile: FaMobileAlt,
  Tablet: FaTabletAlt,
  Desktop: FaDesktop
};

const DeviceBadge = ({ deviceType }) => {
  if (!deviceType) return <span className="audit-logs-device-empty">&mdash;</span>;
  const Icon = DEVICE_ICONS[deviceType] || FaDesktop;
  return (
    <span className="audit-logs-device-badge">
      <Icon aria-hidden="true" />
      {deviceType}
    </span>
  );
};

const Tip = ({ id, text }) => (
  <span className="audit-logs-tip" tabIndex={0} aria-describedby={id}>
    <FaInfoCircle aria-hidden="true" />
    <span role="tooltip" id={id} className="audit-logs-tip-bubble">{text}</span>
  </span>
);

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const formatTime = (value) =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// Rows with captured security metadata get a dedicated Device & session section
// in the details drawer.
const hasSecurityMetadata = (log) =>
  Boolean(log?.ipAddress || log?.deviceType || log?.operatingSystem || log?.browser || log?.sessionIdentifier);

const formatLocation = (location) => {
  if (!location || location.available !== true) return 'Location not available';
  const { latitude, longitude, source } = location;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return 'Location not available';
  const sourceLabel = source ? ` (${source})` : '';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}${sourceLabel}`;
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

  useEffect(() => {
    if (!selectedLog) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedLog(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedLog]);

  const hasActiveFilters =
    Boolean(filterSearch) || actionFilter !== 'All Actions' || statusFilter !== 'All Statuses' || Boolean(rangeStart);

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

        <ToastMessage message={tableMessage} type="error" />

        <div className="audit-logs-stats">
          <div className="audit-logs-stat">
            <span className="audit-logs-stat-label">Today</span>
            <span className="audit-logs-stat-value">{todaysActivities}</span>
            <span className="audit-logs-stat-hint">activities</span>
          </div>
          <div className="audit-logs-stat">
            <span className="audit-logs-stat-label">
              Total
              <Tip id="audit-tip-total" text="All recorded activities, regardless of the filters below." />
            </span>
            <span className="audit-logs-stat-value">{totalActivities}</span>
            <span className="audit-logs-stat-hint">activities</span>
          </div>
          <div className="audit-logs-stat">
            <span className="audit-logs-stat-label">Showing</span>
            <span className="audit-logs-stat-value">{filteredLogs.length}</span>
            <span className="audit-logs-stat-hint">matching filters</span>
          </div>
        </div>

        <div className="audit-logs-toolbar">
          <div className="audit-logs-search-wrapper">
            <FaSearch className="audit-logs-search-icon" aria-hidden="true" />
            <label className="audit-logs-sr-only" htmlFor="audit-logs-search-input">Search user or details</label>
            <input
              id="audit-logs-search-input"
              type="text"
              placeholder="Search user or details"
              value={filterSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="audit-logs-search-input"
            />
          </div>

          <label className="audit-logs-sr-only" htmlFor="audit-logs-action-select">Action type</label>
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
            <option>Account Moved to Trash</option>
            <option>Super Admin Granted</option>
            <option>Super Admin Revoked</option>
            <option>Protected Account Deletion Blocked</option>
            <option>User Login</option>
            <option>Failed Login Attempt</option>
            <option>Organizational Chart Updated</option>
            <option>Attendance Export CSV</option>
            <option>Attendance Export PDF</option>
            <option>Reassessment Round Opened</option>
          </select>

          <label className="audit-logs-sr-only" htmlFor="audit-logs-status-select">Status</label>
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

          <div className="audit-logs-datepicker-wrapper">
            <label className="audit-logs-sr-only" htmlFor="audit-logs-date-input">Date range</label>
            <DatePicker
              id="audit-logs-date-input"
              selectsRange
              startDate={rangeStart}
              endDate={rangeEnd}
              onChange={handleDateRangeChange}
              isClearable
              dateFormat="dd/MM/yyyy"
              placeholderText="Date range"
              className="audit-logs-datepicker"
            />
          </div>

          <div className="audit-logs-toolbar-actions">
            <button
              type="button"
              className="audit-logs-clear"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
            >
              <FaTimes aria-hidden="true" /> Clear
            </button>
            <button type="button" className="audit-logs-export" onClick={handleExportCsv} disabled={filteredLogs.length === 0}>
              <FaDownload aria-hidden="true" /> Export CSV
            </button>
          </div>
        </div>

        <div className="audit-logs-table-card">
          <table className="audit-logs-table">
            <thead>
              <tr>
                <th className="audit-logs-no-column">No.</th>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th className="audit-logs-device-column">
                  Device
                  <Tip id="audit-tip-device" text="Device type the action was performed from, when captured." />
                </th>
                <th>Details</th>
                <th>Status</th>
                <th className="audit-logs-menu-column"><span className="audit-logs-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {loadingLogs ? (
                <tr>
                  <td colSpan="8" className="audit-logs-empty">
                    Loading audit logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="audit-logs-empty">
                    No audit logs found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log, index) => (
                  <tr key={log.id}>
                    <td className="audit-logs-no-column">{(safePage - 1) * PAGE_SIZE + index + 1}</td>
                    <td className="audit-logs-time">
                      <span className="audit-logs-time-date">{formatDate(log.timestamp)}</span>
                      <span className="audit-logs-time-clock">{formatTime(log.timestamp)}</span>
                    </td>
                    <td className="audit-logs-user">{log.user}</td>
                    <td>
                      <span className={`audit-logs-action-badge ${log.actionType}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="audit-logs-device-column">
                      <DeviceBadge deviceType={log.deviceType} />
                    </td>
                    <td>
                      <div className="audit-logs-details-text">{log.details}</div>
                    </td>
                    <td>
                      <span className={`audit-logs-status-badge ${getStatusClass(log.status)}`}>
                        {formatStatusLabel(log.status)}
                      </span>
                    </td>
                    <td className="audit-logs-menu-column">
                      <button
                        type="button"
                        className="audit-logs-more-btn"
                        onClick={() => setSelectedLog(log)}
                        aria-label={`View details for ${log.action} by ${log.user}`}
                        aria-haspopup="dialog"
                      >
                        <FaEllipsisH aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!loadingLogs && <Pagination page={safePage} totalItems={filteredLogs.length} onPageChange={setCurrentPage} label="Audit log pages" />}
        </div>
      </div>

      {selectedLog && (
        <div className="audit-logs-modal-overlay" onClick={() => setSelectedLog(null)}>
          <aside
            className="audit-logs-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-logs-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="audit-logs-modal-header">
              <div>
                <h3 id="audit-logs-drawer-title">Activity details</h3>
                <p className="audit-logs-modal-sub">
                  {formatDate(selectedLog.timestamp)} &middot; {formatTime(selectedLog.timestamp)}
                </p>
              </div>
              <button
                type="button"
                className="audit-logs-modal-close"
                onClick={() => setSelectedLog(null)}
                aria-label="Close"
                autoFocus
              >
                <FaTimes aria-hidden="true" />
              </button>
            </div>
            <div className="audit-logs-modal-body">
              <div className="audit-logs-modal-badges">
                <span className={`audit-logs-action-badge ${selectedLog.actionType}`}>{selectedLog.action}</span>
                <span className={`audit-logs-status-badge ${getStatusClass(selectedLog.status)}`}>
                  {formatStatusLabel(selectedLog.status)}
                </span>
              </div>

              <dl className="audit-logs-modal-list">
                <div className="audit-logs-modal-row">
                  <dt>User</dt>
                  <dd>{selectedLog.user}</dd>
                </div>
                <div className="audit-logs-modal-row">
                  <dt>Timestamp</dt>
                  <dd>{new Date(selectedLog.timestamp).toLocaleString('en-US')}</dd>
                </div>
              </dl>

              <div className="audit-logs-modal-details">
                <span className="audit-logs-modal-row-label">Details</span>
                <p>{selectedLog.details}</p>
              </div>

              {hasSecurityMetadata(selectedLog) && (
                <div className="audit-logs-modal-section">
                  <div className="audit-logs-modal-section-title">Device &amp; session</div>
                  <dl className="audit-logs-modal-list">
                    <div className="audit-logs-modal-row">
                      <dt>Device</dt>
                      <dd>{selectedLog.deviceType || 'Not available'}</dd>
                    </div>
                    <div className="audit-logs-modal-row">
                      <dt>OS</dt>
                      <dd>{selectedLog.operatingSystem || 'Not available'}</dd>
                    </div>
                    <div className="audit-logs-modal-row">
                      <dt>Browser</dt>
                      <dd>
                        {selectedLog.browser
                          ? `${selectedLog.browser}${selectedLog.browserVersion ? ` ${selectedLog.browserVersion}` : ''}`
                          : 'Not available'}
                      </dd>
                    </div>
                    <div className="audit-logs-modal-row">
                      <dt>IP address</dt>
                      <dd>{selectedLog.ipAddress || 'Not available'}</dd>
                    </div>
                    {selectedLog.sessionIdentifier && (
                      <div className="audit-logs-modal-row">
                        <dt>Session ID</dt>
                        <dd className="audit-logs-modal-session-id">{selectedLog.sessionIdentifier}</dd>
                      </div>
                    )}
                    <div className="audit-logs-modal-row">
                      <dt>Location</dt>
                      <dd>{formatLocation(selectedLog.location)}</dd>
                    </div>
                  </dl>
                  <p className="audit-logs-modal-security-note">
                    Device/IP/session data is supporting metadata only and does not by itself prove who
                    physically operated this device. The authenticated account above remains the
                    primary identity for this event.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
