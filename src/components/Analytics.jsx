import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Analytics.css';
import PerformanceChart from './PerformanceChart';
import ActivityTrendsChart from './ActivityTrendsChart';
import TrainingProgressChart from './TrainingProgressChart';
import CompletionSimulationChart from './CompletionSimulationChart';
import UserOverviewChart from './UserOverviewChart';
import KnowledgeGainTrendChart from './KnowledgeGainTrendChart';
import RiskDistributionChart from './RiskDistributionChart';
import ModuleRecommendations from './ModuleRecommendations';
import {
  getAnalyticsDashboardStats,
  getAnalyticsFilterOptions,
  getAnalyticsChartsData,
} from '../utils/knowledgeAnalyticsService';

const DEFAULT_STATS = {
  activeUsers: 0,
  totalUsers: 0,
  questionsAnswered: 0,
  avgSessionLength: '0m 00s',
  startingKnowledge: 0,
  currentKnowledge: 0,
  knowledgeGainPercent: 0,
};

const DEFAULT_CHARTS = {
  userOverview: { labels: [], values: [] },
  activityTrends: { labels: [], started: [], submitted: [] },
  learningByModule: { labels: [], preTest: [], postTest: [] },
  completionByModule: { labels: [], completionRate: [], simulationCompletion: [] },
  attemptsByModule: { labels: [], attempts: [] },
  knowledgeGainTrend: { labels: [], values: [] },
  riskDistribution: { labels: ['High', 'Moderate', 'Low'], values: [0, 0, 0] },
};

export default function Analytics() {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState('All-time');
  const [people, setPeople] = useState('All');
  const [topic, setTopic] = useState('All');
  const [activityTrendsView, setActivityTrendsView] = useState('Month');
  const [topics, setTopics] = useState(['All']);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [charts, setCharts] = useState(DEFAULT_CHARTS);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const circularColors = ['#3b82f6', '#14b8a6', '#fbbf24'];
  const circularRadius = 65;
  const circularCircumference = 2 * Math.PI * circularRadius;

  const circularEntries = charts.attemptsByModule.labels
    .map((label, index) => ({
      label,
      value: charts.attemptsByModule.attempts[index] || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const circularTotal = circularEntries.reduce((sum, entry) => sum + entry.value, 0);

  let circularProgressOffset = 0;
  const circularSegments = circularEntries.map((entry, index) => {
    const ratio = circularTotal > 0 ? entry.value / circularTotal : 0;
    const arcLength = ratio * circularCircumference;
    const rotateDeg = circularProgressOffset * 360 - 90;
    circularProgressOffset += ratio;

    return {
      ...entry,
      color: circularColors[index % circularColors.length],
      arcLength,
      rotateDeg,
    };
  });

  useEffect(() => {
    let isMounted = true;

    const loadFilterOptions = async () => {
      const { data } = await getAnalyticsFilterOptions();

      if (!isMounted) return;

      const nextTopics = data?.topics?.length ? data.topics : ['All'];
      setTopics(nextTopics);
      if (!nextTopics.includes(topic)) {
        setTopic('All');
      }
    };

    loadFilterOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadStats = async () => {
      setIsLoadingStats(true);
      const { data: statsData } =
  await getAnalyticsDashboardStats({
    timeframe,
    people,
    topic,
  });

const { data: chartsData } =
  await getAnalyticsChartsData({
    timeframe,
    people,
    topic,
    activityTrendsView,
  });

      if (isMounted) {
        setStats(statsData || DEFAULT_STATS);
        setCharts(chartsData || DEFAULT_CHARTS);
        setIsLoadingStats(false);
      }
    };

    loadStats();

    return () => {
      isMounted = false;
    };
  }, [timeframe, people, topic, activityTrendsView]);

  return (
    <div className="analytics-container">
      <Sidebar />

      <div className="analytics-main">
        <PageHeader
          title="Analytics"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
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
              {topics.map((topicOption) => (
                <option key={topicOption} value={topicOption}>
                  {topicOption}
                </option>
              ))}
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
            <h3>Avg Mobile Session</h3>
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
              <UserOverviewChart chartData={charts.userOverview} isLoading={isLoadingStats} />
            </div>
          </div>
        </div>

        <div className="analytics-charts-grid">
          {/* User Activity Trends */}
          <div className="analytics-chart-card activity-trends">
            <div className="chart-header">
              <h3>User Activity Trends</h3>
              <select
                className="chart-timeframe-select"
                value={activityTrendsView}
                onChange={(e) => setActivityTrendsView(e.target.value)}
              >
                <option value="Month">Month</option>
                <option value="Week">Week</option>
                <option value="Year">Year</option>
              </select>
            </div>
            <div style={{ height: '220px', padding: '1rem 0.5rem' }}>
              <ActivityTrendsChart chartData={charts.activityTrends} />
            </div>
          </div>

          {/* Circular Progress Chart */}
          <div className="analytics-chart-card circular-progress-card">
            <div className="year-navigation">
              <button className="nav-arrow">&lt;</button>
              <span className="year-display">{new Date().getFullYear()}</span>
              <button className="nav-arrow">&gt;</button>
            </div>
            <div className="circular-progress-wrapper">
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="65" fill="none" stroke="#f0f0f0" strokeWidth="12"/>
                {circularSegments.map((segment) => (
                  <circle
                    key={segment.label}
                    cx="80"
                    cy="80"
                    r="65"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="12"
                    strokeDasharray={`${segment.arcLength} ${circularCircumference - segment.arcLength}`}
                    strokeLinecap="round"
                    transform={`rotate(${segment.rotateDeg} 80 80)`}
                  />
                ))}
              </svg>
              <div className="circular-progress-text">
                <span className="progress-value">{circularTotal.toLocaleString()}</span>
                <span className="progress-label">Total this year</span>
              </div>
            </div>
            <div className="circular-legend">
              {circularSegments.map((segment) => (
                <div className="legend-item" key={segment.label}>
                  <span className="legend-dot" style={{ background: segment.color }}></span>
                  <span>{segment.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Learning Improvement */}
          <div className="analytics-chart-card">
            <h3>Learning Improvement by Module</h3>
            <div style={{ height: '240px', padding: '1rem 0.5rem' }}>
              <TrainingProgressChart chartData={charts.learningByModule} />
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
              <CompletionSimulationChart chartData={charts.completionByModule} />
            </div>
            <div className="training-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#a78bfa' }}></span>
                <span>Completion Rate (%)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#fbbf24' }}></span>
                <span>Simulation Completion (%)</span>
              </div>
            </div>
          </div>

          {/* Knowledge Gain Trend */}
          <div className="analytics-chart-card">
            <h3>Knowledge Gain Trend (AI)</h3>
            <div style={{ height: '240px', padding: '1rem 0.5rem' }}>
              <KnowledgeGainTrendChart chartData={charts.knowledgeGainTrend} />
            </div>
          </div>

          {/* Risk Distribution */}
          <div className="analytics-chart-card">
            <h3>Learner Risk Distribution</h3>
            <div style={{ height: '250px', padding: '0.75rem 0.5rem' }}>
              <RiskDistributionChart chartData={charts.riskDistribution} />
            </div>
          </div>
        </div>

        {/* Test Attempts */}
        <div className="analytics-chart-card performance-chart">
          <h3>Test Attempts per Module</h3>
          <div className="performance-subheader">Engagement</div>
          <div style={{ height: '200px', padding: '1rem' }}>
            <PerformanceChart chartData={charts.attemptsByModule} />
          </div>
          <div className="performance-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ background: '#a78bfa' }}></span>
              <span>Attempts</span>
            </div>
          </div>
        </div>

        {/* AI Module Recommendations */}
        <ModuleRecommendations />
      </div>
    </div>
  );
}
