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
  attemptsByYear: { availableYears: [], byYear: {} },
  knowledgeGainTrend: { labels: [], values: [] },
  riskDistribution: { labels: ['High', 'Moderate', 'Low'], values: [0, 0, 0] },
};

export default function Analytics() {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState('All-time');
  const [people, setPeople] = useState('All');
  const [topic, setTopic] = useState('All');
  const [userOverviewRange, setUserOverviewRange] = useState('Month');
  const [activityTrendsView, setActivityTrendsView] = useState('Month');
  const [topics, setTopics] = useState(['All']);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [charts, setCharts] = useState(DEFAULT_CHARTS);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isRecommendationsOpen, setIsRecommendationsOpen] = useState(false);
// Starting Knowledge
let startingColor = "#22c55e";
if (stats.startingKnowledge < 30) {
  startingColor = "#ef4444";
} else if (stats.startingKnowledge < 70) {
  startingColor = "#f59e0b";
}

// Current Knowledge stays green so it is clearly distinguished from the starting score.
const currentColor = "#22c55e";

// Knowledge Gain
let gainColor = "#22c55e";
let gainArrow = "▲";
let gainStatusLabel = "Improved";
if (stats.knowledgeGainPercent < 0) {
  gainColor = "#ef4444";
  gainArrow = "▼";
  gainStatusLabel = "Declined";
} else if (stats.knowledgeGainPercent === 0) {
  gainColor = "#9ca3af";
  gainArrow = "●";
  gainStatusLabel = "No Change";
}

const gainMagnitude = Math.min(Math.abs(stats.knowledgeGainPercent || 0), 100);
const gainMeterHalfWidth = gainMagnitude / 2; // track is split into two 50% halves around the zero line
const isGainPositive = stats.knowledgeGainPercent > 0;
  useEffect(() => {
    let isMounted = true;

    const loadFilterOptions = async () => {
      const { data } = await getAnalyticsFilterOptions();

      if (!isMounted) return;

      const nextTopics = data?.topics?.length ? data.topics : ['All'];
      setTopics(nextTopics);
      setTopic((currentTopic) => (nextTopics.includes(currentTopic) ? currentTopic : 'All'));
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
    userOverviewRange,
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
  }, [timeframe, people, topic, activityTrendsView, userOverviewRange]);

  useEffect(() => {
    if (!isRecommendationsOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsRecommendationsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isRecommendationsOpen]);

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
          <div className="filter-pill filter-pill-timeframe">
            <span className="filter-label">Timeframe:</span>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <option>All-time</option>
              <option>Last 30 days</option>
              <option>Last 7 days</option>
            </select>
          </div>
          <div className="filter-pill filter-pill-users">
            <span className="filter-label">Users:</span>
            <select value={people} onChange={(e) => setPeople(e.target.value)}>
              <option>All</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
          <div className="filter-pill filter-pill-topic">
            <span className="filter-label">Topic:</span>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              title={topic}
              aria-label="Filter analytics by topic"
            >
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
        </div>

        <div className="knowledge-section">
          <div className="knowledge-compare-card">
            <div className="knowledge-compare-header">
              <h3>Knowledge Progress</h3>
              <span className="knowledge-compare-sub">Starting vs. Current</span>
            </div>

            <div className="knowledge-bar-row">
              <div className="knowledge-bar-label">
                <span className="knowledge-bar-dot" style={{ background: startingColor }}></span>
                <span>Starting Knowledge</span>
                <span className="knowledge-bar-value" style={{ color: startingColor }}>
                  {isLoadingStats ? '...' : `${stats.startingKnowledge}%`}
                </span>
              </div>
              <div className="knowledge-bar-track">
                <div
                  className="knowledge-bar-fill"
                  style={{
                    width: `${isLoadingStats ? 0 : Math.min(Math.max(stats.startingKnowledge, 0), 100)}%`,
                    background: startingColor,
                  }}
                ></div>
              </div>
            </div>

            <div className="knowledge-bar-row">
              <div className="knowledge-bar-label">
                <span className="knowledge-bar-dot" style={{ background: currentColor }}></span>
                <span>Current Knowledge</span>
                <span className="knowledge-bar-value" style={{ color: currentColor }}>
                  {isLoadingStats ? '...' : `${stats.currentKnowledge}%`}
                </span>
              </div>
              <div className="knowledge-bar-track">
                <div
                  className="knowledge-bar-fill"
                  style={{
                    width: `${isLoadingStats ? 0 : Math.min(Math.max(stats.currentKnowledge, 0), 100)}%`,
                    background: currentColor,
                  }}
                ></div>
              </div>
            </div>
          </div>

          <div className="knowledge-gain-card">
            <h3>Knowledge Gain</h3>
            <div className="gain-indicator">
              <span className="gain-arrow" style={{ color: gainColor }}>{gainArrow}</span>
              <span className="gain-value" style={{ color: gainColor }}>
                {isLoadingStats
                  ? '...'
                  : `${stats.knowledgeGainPercent > 0 ? '+' : ''}${stats.knowledgeGainPercent}%`}
              </span>
            </div>
            <div
              className="gain-status-pill"
              style={{ background: `${gainColor}1a`, color: gainColor }}
            >
              {isLoadingStats ? 'Loading...' : gainStatusLabel}
            </div>
            <div className="gain-meter">
              <div className="gain-meter-track">
                <div className="gain-meter-zero-line"></div>
                {!isLoadingStats && gainMagnitude > 0 && (
                  <div
                    className="gain-meter-fill"
                    style={{
                      background: gainColor,
                      width: `${gainMeterHalfWidth}%`,
                      left: isGainPositive ? '50%' : `${50 - gainMeterHalfWidth}%`,
                    }}
                  ></div>
                )}
              </div>
              <div className="gain-meter-scale">
                <span>-100%</span>
                <span>0</span>
                <span>+100%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="analytics-overview">
          <div className="overview-header">
            <h3>User Overview</h3>
            <select
              className="time-select"
              value={userOverviewRange}
              onChange={(event) => setUserOverviewRange(event.target.value)}
              aria-label="User overview date range"
            >
              <option value="Year">This Year</option>
              <option value="Month">This Month</option>
              <option value="Week">This Week</option>
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

          {/* Learning Improvement */}
          <div className="analytics-chart-card">
            <h3>Learning Improvement by Module</h3>
            <div style={{ height: '300px', padding: '1rem 0.5rem' }}>
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
            <div style={{ height: '300px', padding: '1rem 0.5rem' }}>
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
          <div style={{ height: '260px', padding: '1rem' }}>
            <PerformanceChart chartData={charts.attemptsByModule} />
          </div>
          <div className="performance-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ background: '#a78bfa' }}></span>
              <span>Attempts</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="ai-recommendations-fab"
          onClick={() => setIsRecommendationsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isRecommendationsOpen}
        >
          <span className="ai-recommendations-fab-icon" aria-hidden="true">✦</span>
          <span>AI Recommendations</span>
        </button>

        {isRecommendationsOpen && (
          <div
            className="ai-recommendations-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsRecommendationsOpen(false);
            }}
          >
            <section
              className="ai-recommendations-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-recommendations-title"
            >
              <div className="ai-recommendations-dialog-header">
                <div>
                  <span className="ai-recommendations-eyebrow">AI insights</span>
                  <h2 id="ai-recommendations-title">Module Recommendations</h2>
                </div>
                <button
                  type="button"
                  className="ai-recommendations-close"
                  onClick={() => setIsRecommendationsOpen(false)}
                  aria-label="Close AI recommendations"
                >
                  ×
                </button>
              </div>
              <div className="ai-recommendations-dialog-body">
                <ModuleRecommendations />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
