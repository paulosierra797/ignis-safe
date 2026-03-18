import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { getPersonnelOverviewStats } from '../utils/usersService';
import './Dashboard.css';

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [personnelStats, setPersonnelStats] = useState({
    totalPersonnel: 0,
    totalCapacity: 0,
    onDuty: 0,
    offDuty: 0,
    attendancePercentage: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPersonnelStats = async () => {
      try {
        const { data, error } = await getPersonnelOverviewStats();
        if (error) {
          console.error('Error fetching personnel stats:', error);
        } else if (data) {
          setPersonnelStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch personnel overview stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPersonnelStats();
  }, []);

  return (
    <div className="dashboard-container">
      <Sidebar />
      
      <div className="dashboard-main">
        <PageHeader
          title="Dashboard"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Personnel Metrics Section */}
        <div className="metrics-section">
          <h3 className="section-title">Personnel Overview</h3>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon personnel">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8.5 11C10.7091 11 12.5 9.20914 12.5 7C12.5 4.79086 10.7091 3 8.5 3C6.29086 3 4.5 4.79086 4.5 7C4.5 9.20914 6.29086 11 8.5 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">Total Personnel</p>
                <div className="metric-value">
                  <span className="main-number">{personnelStats.totalPersonnel}</span>
                  <span className="sub-number">/{personnelStats.totalCapacity}</span>
                </div>
                <span className="metric-status active">Active</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon duty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">On-Duty Status</p>
                <div className="duty-split">
                  <div className="duty-item on-duty">
                    <span className="duty-count">{personnelStats.onDuty}</span>
                    <span className="duty-text">On-Duty</span>
                  </div>
                  <div className="duty-divider"></div>
                  <div className="duty-item off-duty">
                    <span className="duty-count">{personnelStats.offDuty}</span>
                    <span className="duty-text">Off-Duty</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon attendance">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">Today's Attendance</p>
                <div className="metric-value">
                  <span className="main-number">{personnelStats.attendancePercentage}</span>
                  <span className="percentage-sign">%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${personnelStats.attendancePercentage}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile App Users Section */}
        <div className="metrics-section">
          <h3 className="section-title">Mobile App Users</h3>
          <div className="metrics-grid-4">
            <div className="metric-card compact">
              <div className="metric-icon users">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45768C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">Total Registered</p>
                <div className="metric-value">
                  <span className="main-number">1,248</span>
                </div>
                <span className="metric-trend positive">+12% this month</span>
              </div>
            </div>

            <div className="metric-card compact">
              <div className="metric-icon active-users">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="19" cy="7" r="4" fill="#22c55e"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">Active Users Today</p>
                <div className="metric-value">
                  <span className="main-number">847</span>
                </div>
                <span className="metric-detail">This Week: 1,102</span>
              </div>
            </div>

            <div className="metric-card compact">
              <div className="metric-icon registrations">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8.5 11C10.7091 11 12.5 9.20914 12.5 7C12.5 4.79086 10.7091 3 8.5 3C6.29086 3 4.5 4.79086 4.5 7C4.5 9.20914 6.29086 11 8.5 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20 8V14M17 11H23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">New Registrations</p>
                <div className="metric-value">
                  <span className="main-number">158</span>
                </div>
                <span className="metric-comparison">Last Month: 142</span>
              </div>
            </div>

            <div className="metric-card compact">
              <div className="metric-icon completion">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.7088 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.85999" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">Training Completion</p>
                <div className="metric-value">
                  <span className="main-number">78</span>
                  <span className="percentage-sign">%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: '78%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Knowledge Gain Statistics */}
        <div className="metrics-section">
          <h3 className="section-title">Knowledge Statistics</h3>
          <div className="metrics-grid">
            <div className="metric-card knowledge">
              <div className="metric-content">
                <p className="metric-label">Starting Knowledge</p>
                <div className="knowledge-display">
                  <span className="knowledge-percent">64%</span>
                  <div className="knowledge-trend-line">
                    <svg width="120" height="40" viewBox="0 0 120 40">
                      <path d="M 0 30 Q 20 25, 40 28 T 80 22 T 120 20" stroke="#94a3b8" strokeWidth="2" fill="none" />
                      <circle cx="0" cy="30" r="3" fill="#94a3b8" />
                      <circle cx="120" cy="20" r="3" fill="#94a3b8" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="metric-card knowledge">
              <div className="metric-content">
                <p className="metric-label">Current Knowledge</p>
                <div className="knowledge-display">
                  <span className="knowledge-percent current">86%</span>
                  <div className="knowledge-trend-line">
                    <svg width="120" height="40" viewBox="0 0 120 40">
                      <path d="M 0 35 Q 20 28, 40 30 T 80 18 T 120 12" stroke="#3b82f6" strokeWidth="2" fill="none" />
                      <circle cx="0" cy="35" r="3" fill="#3b82f6" />
                      <circle cx="120" cy="12" r="3" fill="#3b82f6" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="metric-card knowledge">
              <div className="metric-content">
                <p className="metric-label">Knowledge Gain</p>
                <div className="knowledge-display">
                  <span className="knowledge-percent gain">+34%</span>
                  <div className="knowledge-trend-line up">
                    <svg width="120" height="40" viewBox="0 0 120 40">
                      <defs>
                        <linearGradient id="gainGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.1" />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.3" />
                        </linearGradient>
                      </defs>
                      <path d="M 0 38 L 30 32 L 60 28 L 90 18 L 120 8 L 120 40 L 0 40 Z" fill="url(#gainGradient)" />
                      <path d="M 0 38 L 30 32 L 60 28 L 90 18 L 120 8" stroke="#22c55e" strokeWidth="2" fill="none" />
                      <circle cx="120" cy="8" r="3" fill="#22c55e" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="charts-section">
          <div className="chart-card">
            <div className="chart-header">
              <h3>User Activity Trends</h3>
              <select className="chart-select">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>Last 3 Months</option>
              </select>
            </div>
            <div className="chart-body">
              <div className="bar-chart">
                {[65, 78, 82, 75, 88, 92, 85].map((height, index) => (
                  <div key={index} className="bar-wrapper">
                    <div className="bar" style={{ height: `${height}%` }}>
                      <span className="bar-value">{height}%</span>
                    </div>
                    <span className="bar-label">Day {index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <h3>Training Progress Distribution</h3>
            </div>
            <div className="chart-body">
              <div className="stats-list">
                <div className="stat-item">
                  <div className="stat-info">
                    <span className="stat-label">Module 1: Fire Safety Basics</span>
                    <span className="stat-percent">95%</span>
                  </div>
                  <div className="stat-bar">
                    <div className="stat-bar-fill completed" style={{ width: '95%' }}></div>
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-info">
                    <span className="stat-label">Module 2: Emergency Response</span>
                    <span className="stat-percent">87%</span>
                  </div>
                  <div className="stat-bar">
                    <div className="stat-bar-fill completed" style={{ width: '87%' }}></div>
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-info">
                    <span className="stat-label">Module 3: Equipment Handling</span>
                    <span className="stat-percent">72%</span>
                  </div>
                  <div className="stat-bar">
                    <div className="stat-bar-fill in-progress" style={{ width: '72%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
