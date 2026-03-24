import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Progress.css';
import { getProgressPageData } from '../utils/progressService';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US');
};

const COMPLETION_OPTIONS = ['All', '100%', '75%', '50%', '25%'];

const matchesCompletionFilter = (overallPercent, filterValue) => {
  if (filterValue === 'All') return true;

  const threshold = Number(String(filterValue).replace('%', ''));
  if (!Number.isFinite(threshold)) return true;

  if (threshold === 100) return overallPercent >= 100;
  return overallPercent >= threshold;
};

export default function Progress() {
  const [progressRows, setProgressRows] = useState([]);
  const [moduleOptions, setModuleOptions] = useState(['All']);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [completionFilter, setCompletionFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [expandedTests, setExpandedTests] = useState({});

  useEffect(() => {
    let isMounted = true;

    const loadProgress = async () => {
      setIsLoading(true);
      setErrorMessage('');

      const { data, error } = await getProgressPageData();
      if (!isMounted) return;

      if (error) {
        setErrorMessage(`Failed to load progress: ${error}`);
        setProgressRows([]);
        setModuleOptions(['All']);
      } else {
        setProgressRows(data?.users || []);
        const nextModuleOptions = ['All', ...(data?.modules || [])];
        setModuleOptions(nextModuleOptions);

        if (!nextModuleOptions.includes(moduleFilter)) {
          setModuleFilter('All');
        }
      }

      setIsLoading(false);
    };

    loadProgress();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleClearFilters = () => {
    setModuleFilter('All');
    setCompletionFilter('All');
    setSearchQuery('');
  };

  const handleViewUser = (user) => {
    setSelectedUser(user);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedUser(null);
    setExpandedTests({});
  };

  const toggleTestExpanded = (moduleName) => {
    setExpandedTests(prev => ({
      ...prev,
      [moduleName]: !prev[moduleName]
    }));
  };

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return progressRows.filter((item) => {
      const matchesSearch =
        !normalizedQuery ||
        String(item.name || '').toLowerCase().includes(normalizedQuery) ||
        String(item.email || '').toLowerCase().includes(normalizedQuery);

      const matchesModule =
        moduleFilter === 'All' ||
        item.modules.some((module) => module.name === moduleFilter && module.progress > 0);

      const matchesCompletion = matchesCompletionFilter(item.overallPercent, completionFilter);

      return matchesSearch && matchesModule && matchesCompletion;
    });
  }, [completionFilter, moduleFilter, progressRows, searchQuery]);

  const usersCompleted = progressRows.filter((row) => row.overallPercent >= 100).length;

  return (
    <div className="progress-container">
      <Sidebar />

      <div className="progress-main">
        <PageHeader
          title="Progress"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="progress-controls">
          <div className="progress-stat-card">
            <p>Users Completed</p>
            <div className="progress-stat-value">
              <span className="progress-main-value">{usersCompleted}</span>
              <span className="progress-sub-value">/{progressRows.length}</span>
            </div>
          </div>

          <div className="progress-filters">
            <div className="progress-filter">
              <label>Filter by Module</label>
              <select
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
              >
                {moduleOptions.map((moduleOption) => (
                  <option key={moduleOption} value={moduleOption}>
                    {moduleOption}
                  </option>
                ))}
              </select>
            </div>

            <div className="progress-filter">
              <label>Filter by Completion</label>
              <select
                value={completionFilter}
                onChange={(event) => setCompletionFilter(event.target.value)}
              >
                {COMPLETION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <button className="progress-clear" onClick={handleClearFilters}>
              CLEAR FILTERS
            </button>
          </div>
        </div>

        <div className="progress-table-card">
          {errorMessage && (
            <div style={{ padding: '0.8rem 1rem', color: '#991b1b', fontWeight: 600 }}>
              {errorMessage}
            </div>
          )}
          <table className="progress-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Name</th>
                <th>Module Progress</th>
                <th>Overall %</th>
                <th>Last Activity</th>
                <th>Last Accessed Module</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                    Loading progress...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                    No progress records found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.moduleProgress}</td>
                    <td>{item.overallPercent}%</td>
                    <td>{formatDate(item.lastActivityAt)}</td>
                    <td>{item.lastAccessedModule}</td>
                    <td>
                      <button
                        className="progress-view-btn"
                        onClick={() => handleViewUser(item)}
                      >
                        VIEW
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showModal && selectedUser && (
          <div className="progress-modal-overlay" onClick={handleCloseModal}>
            <div className="progress-modal" onClick={(e) => e.stopPropagation()}>
              <div className="progress-modal-header">
                <div className="progress-modal-user-info">
                  <h2>{selectedUser.name}</h2>
                  <p>{selectedUser.email}</p>
                </div>
                <div className="progress-modal-activity">
                  Last Activity: <span className="progress-activity-badge">{formatDate(selectedUser.lastActivityAt)}</span>
                </div>
                <button className="progress-modal-close" onClick={handleCloseModal}>
                  ×
                </button>
              </div>

              <div className="progress-modal-content">
                <div className="progress-modal-grid">
                  <div className="progress-modal-section">
                    <h4>Basic Info</h4>
                    <div className="progress-modal-info">
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">ACCOUNT STATUS</span>
                        <span className={`progress-modal-status ${selectedUser.accessStatus === 'ACTIVE' ? 'active' : 'inactive'}`}>
                          {selectedUser.accessStatus}
                        </span>
                      </div>
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">DATE CREATED</span>
                        <span className="progress-modal-value">{formatDate(selectedUser.dateCreated)}</span>
                      </div>
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">LAST ACTIVITY</span>
                        <span className="progress-modal-value">{formatDate(selectedUser.lastActivityAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="progress-modal-section">
                    <h4>Learning Progress</h4>
                    <div className="progress-modal-info">
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">MODULES COMPLETED</span>
                        <span className="progress-modal-value">{selectedUser.modulesCompleted}</span>
                      </div>
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">OVERALL PROGRESS</span>
                        <span className="progress-modal-value">{selectedUser.overallPercent}%</span>
                      </div>
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">LAST MODULE ACCESSED</span>
                        <span className="progress-modal-value">{selectedUser.lastAccessedModule}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="progress-modal-full">
                  <h4>Modules Progress</h4>
                  <div className="progress-modal-modules">
                    {selectedUser.modules.map((module) => (
                      <div key={module.name} className="progress-modal-module-card">
                        <div className="progress-modal-module-header">
                          <span className="progress-modal-module-name">{module.name}</span>
                          <span className={`progress-modal-module-badge ${module.status === 'In Progress' ? 'in-progress' : module.status === 'Completed' ? 'completed' : 'not-started'}`}>
                            {module.status === 'In Progress' ? `${module.progress}%` : module.status}
                          </span>
                        </div>
                        {module.status === 'In Progress' && (
                          <div className="progress-modal-bar">
                            <div className="progress-modal-bar-fill" style={{ width: `${module.progress}%` }}></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="progress-modal-full">
                  <h4>Test Tracking</h4>
                  <div className="progress-modal-tests">
                    {selectedUser.modules.map((module) => (
                      <div key={module.name}>
                        <div 
                          className="progress-modal-test-item" 
                          onClick={() => toggleTestExpanded(module.name)}
                        >
                          <span className="progress-modal-test-name">
                            <span className={`progress-modal-test-dropdown ${expandedTests[module.name] ? 'open' : ''}`}>
                              ▼
                            </span>
                            {module.name}
                          </span>
                          <span className="progress-modal-test-status">
                            {module.tests.length > 0 ? `${module.tests.length} tests` : 'No tests yet'}
                          </span>
                        </div>
                        {expandedTests[module.name] && module.tests.length > 0 && (
                          <div className="progress-modal-test-details">
                            <div>
                              {module.tests.map((test, idx) => (
                                <div key={idx} style={{ marginBottom: idx < module.tests.length - 1 ? '0.8rem' : '0' }}>
                                  <div style={{ fontWeight: '600', color: '#1f2937' }}>{test.name}</div>
                                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                    Score: {test.score} | Date: {formatDate(test.date)}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <span style={{ 
                              background: '#10b981', 
                              color: 'white', 
                              padding: '0.4rem 0.8rem', 
                              borderRadius: '4px', 
                              fontSize: '0.75rem', 
                              fontWeight: '700',
                              whiteSpace: 'nowrap'
                            }}>
                              {module.tests[0]?.status || 'PASSED'}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
