import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Analytics.css';
import PerformanceChart from './PerformanceChart';
import ActivityTrendsChart from './ActivityTrendsChart';
import TrainingProgressChart from './TrainingProgressChart';
import CompletionSimulationChart from './CompletionSimulationChart';
import UserOverviewChart from './UserOverviewChart';
import { getAnalyticsDashboardStats } from '../utils/knowledgeAnalyticsService';

const DEFAULT_STATS = {
  activeUsers: 0,
  totalUsers: 0,
  questionsAnswered: 0,
  avgSessionLength: '0m 00s',
  startingKnowledge: 0,
  currentKnowledge: 0,
  knowledgeGainPercent: 0,
};

export default function Analytics() {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState('All-time');
  const [people, setPeople] = useState('All');
  const [topic, setTopic] = useState('All');
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadStats = async () => {
      setIsLoadingStats(true);
      const { data } = await getAnalyticsDashboardStats();

      if (isMounted) {
        setStats(data || DEFAULT_STATS);
        setIsLoadingStats(false);
      }
    };

    loadStats();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="analytics-container">
      <Sidebar />

      <div className="analytics-main">
        <PageHeader
          title="Analytics"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          userName="Alex meian"
          userRole="Product manager"
        />

        <div className="analytics-filters">
          <div className="filter-pill">
            <span className="filter-label">Timeframe:</span>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <option>All-time</option>
              <option>Last 30 days</option>
              <option>Last 7 days</option>
            </select>
          </div>
          <div className="filter-pill">
            <span className="filter-label">People:</span>
            <select value={people} onChange={(e) => setPeople(e.target.value)}>
              <option>All</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
          <div className="filter-pill">
            <span className="filter-label">Topic:</span>
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option>All</option>
              <option>Safety</option>
              <option>Training</option>
            </select>
          </div>
        </div>

        <div className="analytics-stats-row">
          <div className="analytics-stat-card">
            <h3>Active Users</h3>
            <div className="stat-value">
              <span className="main-value">{isLoadingStats ? '...' : stats.activeUsers}</span>
              <span className="sub-value">/{isLoadingStats ? '...' : stats.totalUsers}</span>
            </div>
          </div>
          <div className="analytics-stat-card">
            <h3>Training Completion</h3>
            <div className="stat-value">
              <span className="main-value">
                {isLoadingStats ? '...' : stats.questionsAnswered.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="analytics-stat-card">
            <h3>Av. Session Length</h3>
            <div className="stat-value">
              <span className="main-value">
                {isLoadingStats ? '...' : stats.avgSessionLength}
              </span>
            </div>
          </div>
        </div>

        <div className="analytics-stats-row">
          <div className="analytics-stat-card">
            <h3>Starting Knowledge</h3>
            <div className="stat-value">
              <span className="main-value">
                {isLoadingStats ? '...' : `${stats.startingKnowledge}%`}
              </span>
            </div>
            <div className="sparkline red"></div>
          </div>
          <div className="analytics-stat-card">
            <h3>Current Knowledge</h3>
            <div className="stat-value">
              <span className="main-value">
                {isLoadingStats ? '...' : `${stats.currentKnowledge}%`}
              </span>
            </div>
            <div className="sparkline red"></div>
          </div>
          <div className="analytics-stat-card">
            <h3>Knowledge Gain</h3>
            <div className="stat-value">
              <span className="main-value">
                {isLoadingStats
                  ? '...'
                  : `${stats.knowledgeGainPercent >= 0 ? '+' : ''}${stats.knowledgeGainPercent}%`}
              </span>
            </div>
            <div className="sparkline orange"></div>
          </div>
        </div>

        <div className="analytics-overview">
          <div className="overview-header">
            <h3>User Overview</h3>
            <select className="time-select">
              <option>This Month</option>
            </select>
          </div>
          <div className="overview-chart">
            <div style={{ height: '220px', padding: '1rem 0.5rem' }}>
              <UserOverviewChart />
            </div>
          </div>
        </div>

        <div className="analytics-charts-grid">
          {/* User Activity Trends */}
          <div className="analytics-chart-card activity-trends">
            <div className="chart-header">
              <h3>User Activity Trends</h3>
              <select className="chart-timeframe-select">
                <option>Month</option>
                <option>Week</option>
                <option>Year</option>
              </select>
            </div>
            <div style={{ height: '220px', padding: '1rem 0.5rem' }}>
              <ActivityTrendsChart />
            </div>
          </div>

          {/* Circular Progress Chart */}
          <div className="analytics-chart-card circular-progress-card">
            <div className="year-navigation">
              <button className="nav-arrow">&lt;</button>
              <span className="year-display">2025</span>
              <button className="nav-arrow">&gt;</button>
            </div>
            <div className="circular-progress-wrapper">
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="65" fill="none" stroke="#f0f0f0" strokeWidth="12"/>
                {/* Blue segment - Module 1 */}
                <circle 
                  cx="80" cy="80" r="65" 
                  fill="none" 
                  stroke="#3b82f6" 
                  strokeWidth="12"
                  strokeDasharray="408"
                  strokeDashoffset="272"
                  strokeLinecap="round"
                  transform="rotate(-90 80 80)"
                />
                {/* Teal segment - Module 2 */}
                <circle 
                  cx="80" cy="80" r="65" 
                  fill="none" 
                  stroke="#14b8a6" 
                  strokeWidth="12"
                  strokeDasharray="408"
                  strokeDashoffset="340"
                  strokeLinecap="round"
                  transform="rotate(45 80 80)"
                />
                {/* Yellow segment - Module 3 */}
                <circle 
                  cx="80" cy="80" r="65" 
                  fill="none" 
                  stroke="#fbbf24" 
                  strokeWidth="12"
                  strokeDasharray="408"
                  strokeDashoffset="306"
                  strokeLinecap="round"
                  transform="rotate(135 80 80)"
                />
              </svg>
              <div className="circular-progress-text">
                <span className="progress-value">22.870</span>
                <span className="progress-label">Total this year</span>
              </div>
            </div>
            <div className="circular-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#3b82f6' }}></span>
                <span>Module 1</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#14b8a6' }}></span>
                <span>Module 2</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#fbbf24' }}></span>
                <span>Module 3</span>
              </div>
            </div>
          </div>

          {/* Learning Improvement */}
          <div className="analytics-chart-card">
            <h3>Learning Improvement by Module</h3>
            <div style={{ height: '240px', padding: '1rem 0.5rem' }}>
              <TrainingProgressChart />
            </div>
            <div className="training-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#f99ca2' }}></span>
                <span>Post-Test (%)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#5dc5d8' }}></span>
                <span>Pre-Test (%)</span>
              </div>
            </div>
          </div>

          {/* Completion and Simulation */}
          <div className="analytics-chart-card">
            <h3>Completion and Simulation</h3>
            <div style={{ height: '240px', padding: '1rem 0.5rem' }}>
              <CompletionSimulationChart />
            </div>
            <div className="training-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#a78bfa' }}></span>
                <span>Completion Rate (%)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#fbbf24' }}></span>
                <span>Simulation Score (%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Test Attempts */}
        <div className="analytics-chart-card performance-chart">
          <h3>Test Attempts per Module</h3>
          <div className="performance-subheader">Engagement</div>
          <div style={{ height: '200px', padding: '1rem' }}>
            <PerformanceChart />
          </div>
          <div className="performance-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ background: '#a78bfa' }}></span>
              <span>Attempts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
