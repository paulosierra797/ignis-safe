import React, { useEffect, useMemo, useRef, useState } from 'react';
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

const COMPLETION_RANGES = [
  { label: 'All', min: null, max: null },
  { label: '0%', min: 0, max: 0 },
  { label: '1%–10%', min: 1, max: 10 },
  { label: '11%–20%', min: 11, max: 20 },
  { label: '21%–30%', min: 21, max: 30 },
  { label: '31%–40%', min: 31, max: 40 },
  { label: '41%–50%', min: 41, max: 50 },
  { label: '51%–60%', min: 51, max: 60 },
  { label: '61%–70%', min: 61, max: 70 },
  { label: '71%–80%', min: 71, max: 80 },
  { label: '81%–90%', min: 81, max: 90 },
  { label: '91%–99%', min: 91, max: 99 },
  { label: '100%', min: 100, max: 100 },
];

const COMPLETION_OPTIONS = COMPLETION_RANGES.map((range) => range.label);

const matchesCompletionFilter = (overallPercent, filterValue) => {
  if (filterValue === 'All') return true;

  const range = COMPLETION_RANGES.find((option) => option.label === filterValue);
  if (!range) return true;

  return overallPercent >= range.min && overallPercent <= range.max;
};

export default function Progress() {
  const [progressRows, setProgressRows] = useState([]);
  const [moduleOptions, setModuleOptions] = useState(['All']);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [completionFilter, setCompletionFilter] = useState('All');
  const [completionSearchText, setCompletionSearchText] = useState('All');
  const [isCompletionDropdownOpen, setIsCompletionDropdownOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [expandedTests, setExpandedTests] = useState({});
  const completionBlurTimeoutRef = useRef(null);

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
    setCompletionSearchText('All');
    setSearchQuery('');
  };

  const completionDropdownOptions = useMemo(() => {
    const normalizedQuery = completionSearchText.trim().toLowerCase();
    if (!normalizedQuery || normalizedQuery === completionFilter.toLowerCase()) {
      return COMPLETION_OPTIONS;
    }
    return COMPLETION_OPTIONS.filter((option) =>
      option.toLowerCase().includes(normalizedQuery)
    );
  }, [completionSearchText, completionFilter]);

  const handleCompletionInputFocus = () => {
    if (completionBlurTimeoutRef.current) {
      clearTimeout(completionBlurTimeoutRef.current);
    }
    setCompletionSearchText('');
    setIsCompletionDropdownOpen(true);
  };

  const handleCompletionInputChange = (event) => {
    setCompletionSearchText(event.target.value);
    setIsCompletionDropdownOpen(true);
  };

  const handleCompletionInputBlur = () => {
    completionBlurTimeoutRef.current = setTimeout(() => {
      setCompletionSearchText(completionFilter);
      setIsCompletionDropdownOpen(false);
    }, 150);
  };

  const handleSelectCompletionOption = (option) => {
    if (completionBlurTimeoutRef.current) {
      clearTimeout(completionBlurTimeoutRef.current);
    }
    setCompletionFilter(option);
    setCompletionSearchText(option);
    setIsCompletionDropdownOpen(false);
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
          title="Users"
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

            <div className="progress-filter progress-filter-searchable">
              <label>Filter by Completion</label>
              <div className="progress-searchable-select">
                <input
                  type="text"
                  className="progress-searchable-input"
                  value={isCompletionDropdownOpen ? completionSearchText : completionFilter}
                  onFocus={handleCompletionInputFocus}
                  onChange={handleCompletionInputChange}
                  onBlur={handleCompletionInputBlur}
                  placeholder="Search completion..."
                  autoComplete="off"
                />
                {isCompletionDropdownOpen && (
                  <ul className="progress-searchable-options">
                    {completionDropdownOptions.length === 0 ? (
                      <li className="progress-searchable-option-empty">No matches</li>
                    ) : (
                      completionDropdownOptions.map((option) => (
                        <li
                          key={option}
                          className={`progress-searchable-option ${option === completionFilter ? 'selected' : ''}`}
                          onMouseDown={() => handleSelectCompletionOption(option)}
                        >
                          {option}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
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
         <div className="progress-desktop-table">
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
          <div className="progress-mobile-cards">

  {isLoading ? (
    <div className="progress-card-empty">
      Loading progress...
    </div>
  ) : filteredRows.length === 0 ? (
    <div className="progress-card-empty">
      No progress records found.
    </div>
  ) : (
    filteredRows.map((item, index) => (
      <div className="progress-user-card" key={item.id}>

        <div className="progress-card-header">
          <div>
            <h3>{item.name}</h3>
            <p>{item.email}</p>
          </div>

          <span className="progress-percent">
            {item.overallPercent}%
          </span>
        </div>


        <div className="progress-card-row">
          <span>Last Activity</span>
          <strong>
            {formatDate(item.lastActivityAt)}
          </strong>
        </div>


        <div className="progress-card-row">
          <span>Last Module</span>
          <strong>
            {item.lastAccessedModule}
          </strong>
        </div>


        <div className="progress-card-row">
          <span>Modules</span>
          <strong>
            {item.moduleProgress}
          </strong>
        </div>


        <button
          className="progress-view-btn"
          onClick={() => handleViewUser(item)}
        >
          VIEW DETAILS
        </button>

      </div>
    ))
  )}

</div>
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
