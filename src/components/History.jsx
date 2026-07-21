import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './History.css';
import { useUser } from '../context/UserContext';
import { getPersonnelActivityLogs } from '../utils/activityLogService';

const isSameDay = (isoValue, dateInput) => {
  if (!isoValue || !dateInput) return false;
  return new Date(isoValue).toISOString().split('T')[0] === dateInput;
};

export default function History() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [tableMessage, setTableMessage] = useState('');
  const contentRef = useRef(null);

  // The table header sticks just below the page header, so it needs the
  // page header's real rendered height (which changes with breakpoints and
  // content) rather than a guessed pixel value.
  useLayoutEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return undefined;

    const headerEl = contentEl.querySelector('.page-header');
    if (!headerEl) return undefined;

    const applyHeaderHeight = () => {
      contentEl.style.setProperty('--audit-header-height', `${headerEl.offsetHeight}px`);
    };

    applyHeaderHeight();

    const resizeObserver = new ResizeObserver(applyHeaderHeight);
    resizeObserver.observe(headerEl);
    window.addEventListener('resize', applyHeaderHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', applyHeaderHeight);
    };
  }, []);

  const loadActivities = useCallback(async () => {
    if (!currentUser?.admin_id) {
      setActivities([]);
      setLoadingActivities(false);
      return;
    }

    setLoadingActivities(true);
    setTableMessage('');

    const { data, error } = await getPersonnelActivityLogs(currentUser.admin_id);
    if (error) {
      setTableMessage(`Failed to load audit logs: ${error}`);
      setActivities([]);
    } else {
      setActivities(data || []);
    }

    setLoadingActivities(false);
  }, [currentUser?.admin_id]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        loadActivities();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [loadActivities]);

  useEffect(() => {
    const handleDataChanged = (event) => {
      const scope = event?.detail?.scope || '';
      if (!scope || scope === 'announcements') {
        loadActivities();
      }
    };

    window.addEventListener('ignis-safe:data-changed', handleDataChanged);
    return () => window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
  }, [loadActivities]);

  const totalActivities = activities.length;
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todaysActivities = useMemo(
    () => activities.filter((activity) => isSameDay(activity.performed_at, todayIso)).length,
    [activities, todayIso]
  );

  const handleClearFilters = () => {
    setFilterDate('');
    setSearchQuery('');
  };

  const filteredActivities = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return activities.filter((activity) => {
      const dateAsInput = activity.performed_at
        ? new Date(activity.performed_at).toISOString().split('T')[0]
        : '';

      const matchesSearch =
        !normalizedSearch ||
        String(activity.action || '').toLowerCase().includes(normalizedSearch) ||
        String(activity.details || '').toLowerCase().includes(normalizedSearch);
      const matchesDate = !filterDate || dateAsInput === filterDate;
      return matchesSearch && matchesDate;
    });
  }, [activities, searchQuery, filterDate]);

  const getStatusClass = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'success') return 'status-approved';
    if (normalized === 'failed' || normalized === 'error') return 'status-rejected';
    return 'status-pending';
  };

  return (
    <div className="history-container">
      <Sidebar variant="personnel" />

      <div className="history-content" ref={contentRef}>
        <PageHeader
          title="Audit Logs"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
          compact={true}
          showSearch={false}
        />

        <div className="history-main">
          <h1 className="history-title">Audit Logs</h1>

          <div className="history-filters">
            <div className="search-section">
              <label>Search Activity</label>
              <div className="search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by activity or details..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="filter-section">
              <label>Filter by Date</label>
              <div className="filter-date-row">
                <input
                  type="date"
                  className="filter-select"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
                <button className="clear-filters-btn" onClick={handleClearFilters}>
                  CLEAR FILTERS
                </button>
              </div>
            </div>
          </div>

          <div className="history-stats">
            <div className="stat-card">
              <div className="stat-label">Today's Activities</div>
              <div className="stat-value">{todaysActivities}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Activities</div>
              <div className="stat-value">{totalActivities}</div>
            </div>
          </div>

          {tableMessage && <div className="history-message">{tableMessage}</div>}

          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Activity</th>
                  <th>Date &amp; Time</th>
                  <th className="status-column">Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {loadingActivities && (
                  <tr>
                    <td colSpan="5" className="no-data">Loading audit logs...</td>
                  </tr>
                )}
                {!loadingActivities && filteredActivities.map((activity, index) => (
                  <tr key={activity.log_id}>
                    <td>{index + 1}</td>
                    <td>{activity.action}</td>
                    <td>{new Date(activity.performed_at).toLocaleString('en-US')}</td>
                    <td className="status-column">
                      <span className={`status-badge ${getStatusClass(activity.status)}`}>
                        {activity.status}
                      </span>
                    </td>
                    <td>{activity.details || '-'}</td>
                  </tr>
                ))}
                {!loadingActivities && filteredActivities.length === 0 && (
                  <tr>
                    <td colSpan="5" className="no-data">No account activity found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="history-mobile-list">
            {filteredActivities.map((activity, index) => (
              <div className="history-card" key={activity.log_id}>
                <div className="history-card-header">
                  <span className="report-number">#{index + 1}</span>
                  <span className={`status-badge ${getStatusClass(activity.status)}`}>
                    {activity.status}
                  </span>
                </div>

                <h3>{activity.action}</h3>

                <p><strong>Date &amp; Time:</strong> {new Date(activity.performed_at).toLocaleString()}</p>
                <p><strong>Details:</strong> {activity.details || '-'}</p>
              </div>
            ))}
            {!loadingActivities && filteredActivities.length === 0 && (
              <p className="no-data">No account activity found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
