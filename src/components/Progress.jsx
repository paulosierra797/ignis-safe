import React, { useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Progress.css';

const progressData = [
  {
    id: 1,
    name: 'Maria Santos',
    email: 'maria.santos@gmail.com',
    moduleProgress: '1/3 Modules',
    overallPercent: '8%',
    lastActivity: '02-04-2026',
    lastAccessedModule: 'Kitchen Fires',
    accessStatus: 'ACTIVE',
    dateCreated: '1-15-2025',
    lastActivityDate: '2-1-2026',
    modules: [
      { 
        name: 'Kitchen Fires', 
        status: 'In Progress', 
        progress: 70,
        tests: [
          { name: 'PRE TEST', score: 80, date: '2-1-2026', status: 'PASSED' },
          { name: 'POST TEST', score: 75, date: '2-2-2026', status: 'PASSED' }
        ]
      },
      { 
        name: 'Electric Fires', 
        status: 'Not yet Started', 
        progress: 0,
        tests: []
      },
      { 
        name: 'Fire Extinguisher', 
        status: 'Not yet Started', 
        progress: 0,
        tests: []
      }
    ]
  },
  {
    id: 2,
    name: 'John Dela Cruz',
    email: 'john.dela@gmail.com',
    moduleProgress: '2/3 Modules',
    overallPercent: '45%',
    lastActivity: '02-03-2026',
    lastAccessedModule: 'Evacuation',
    accessStatus: 'ACTIVE',
    dateCreated: '1-10-2025',
    lastActivityDate: '2-3-2026',
    modules: [
      { 
        name: 'Kitchen Fires', 
        status: 'Completed', 
        progress: 100,
        tests: [
          { name: 'PRE TEST', score: 90, date: '1-20-2026', status: 'PASSED' },
          { name: 'POST TEST', score: 95, date: '1-25-2026', status: 'PASSED' }
        ]
      },
      { 
        name: 'Electric Fires', 
        status: 'In Progress', 
        progress: 45,
        tests: []
      },
      { 
        name: 'Fire Extinguisher', 
        status: 'Not yet Started', 
        progress: 0,
        tests: []
      }
    ]
  },
  {
    id: 3,
    name: 'Sarah Torres',
    email: 'sarah.torres@gmail.com',
    moduleProgress: '0/3 Modules',
    overallPercent: '0%',
    lastActivity: '01-28-2026',
    lastAccessedModule: 'N/A',
    accessStatus: 'INACTIVE',
    dateCreated: '1-20-2025',
    lastActivityDate: '1-28-2026',
    modules: [
      { 
        name: 'Kitchen Fires', 
        status: 'Not yet Started', 
        progress: 0,
        tests: []
      },
      { 
        name: 'Electric Fires', 
        status: 'Not yet Started', 
        progress: 0,
        tests: []
      },
      { 
        name: 'Fire Extinguisher', 
        status: 'Not yet Started', 
        progress: 0,
        tests: []
      }
    ]
  }
];

export default function Progress() {
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('Kitchen Fires');
  const [completionFilter, setCompletionFilter] = useState('100%');
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [expandedTests, setExpandedTests] = useState({});

  const handleClearFilters = () => {
    setModuleFilter('Kitchen Fires');
    setCompletionFilter('100%');
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
              <span className="progress-main-value">458</span>
              <span className="progress-sub-value">/500</span>
            </div>
          </div>

          <div className="progress-filters">
            <div className="progress-filter">
              <label>Filter by Module</label>
              <select
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
              >
                <option>Kitchen Fires</option>
                <option>Electrical Fires</option>
                <option>Chemical Fires</option>
              </select>
            </div>

            <div className="progress-filter">
              <label>Filter by Completion</label>
              <select
                value={completionFilter}
                onChange={(event) => setCompletionFilter(event.target.value)}
              >
                <option>100%</option>
                <option>75%</option>
                <option>50%</option>
                <option>25%</option>
              </select>
            </div>

            <button className="progress-clear" onClick={handleClearFilters}>
              CLEAR FILTERS
            </button>
          </div>
        </div>

        <div className="progress-table-card">
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
              {progressData.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.name}</td>
                  <td>{item.moduleProgress}</td>
                  <td>{item.overallPercent}</td>
                  <td>{item.lastActivity}</td>
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
              ))}
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
                  Last Activity: <span className="progress-activity-badge">{selectedUser.lastActivity}</span>
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
                        <span className="progress-modal-value">{selectedUser.dateCreated}</span>
                      </div>
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">LAST ACTIVITY</span>
                        <span className="progress-modal-value">{selectedUser.lastActivityDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="progress-modal-section">
                    <h4>Learning Progress</h4>
                    <div className="progress-modal-info">
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">MODULES COMPLETED</span>
                        <span className="progress-modal-value">0</span>
                      </div>
                      <div className="progress-modal-info-item">
                        <span className="progress-modal-label">OVERALL PROGRESS</span>
                        <span className="progress-modal-value">{selectedUser.overallPercent}</span>
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
                                    Score: {test.score} | Date: {test.date}
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
