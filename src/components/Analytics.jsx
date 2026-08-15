import React, { useEffect, useRef, useState } from 'react';
import { FaArrowDown, FaArrowUp, FaMinus } from 'react-icons/fa';
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
import AIRecommendationsDialog from './AIRecommendationsDialog';
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

function AnalyticsCardHeader({ title, description, children }) {
  return (
    <div className="analytics-card-header">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

// Shimmering placeholders shown instead of "..." while a section's own data is
// still loading - sized to match the value they stand in for, so nothing
// jumps once the real value arrives.
function SkeletonText({ width = '3.5rem', size = 'md' }) {
  return (
    <span
      className={`analytics-skeleton analytics-skeleton-text analytics-skeleton-${size}`}
      style={{ width }}
      aria-hidden="true"
    />
  );
}

function SkeletonBlock({ height = '100%' }) {
  return <div className="analytics-skeleton analytics-skeleton-block" style={{ height }} aria-hidden="true" />;
}

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
  // The summary cards (Total Learners, Questions Answered, Knowledge...) and the
  // charts below them depend on different, independently-cached fetches, so each
  // section gets its own loading flag instead of one shared flag gating every
  // card on the slowest request - the lighter summary numbers can render as soon
  // as they resolve instead of waiting on the heavier chart aggregation.
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // Reuses already-fetched results per filter combination within this session so
  // switching back to a previously selected Timeframe/Users/Topic renders
  // instantly instead of showing a loading state again. Entries are refreshed in
  // the background on every fetch (including cache hits) so the reused data
  // never goes stale for long.
  const summaryCacheRef = useRef(new Map());
  const chartsCacheRef = useRef(new Map());
// Starting Knowledge
let startingColor = "#22c55e";
if (stats.startingKnowledge < 40) {
  startingColor = "#ef4444";
} else if (stats.startingKnowledge < 70) {
  startingColor = "#f59e0b";
}

let currentColor = "#22c55e";
if (stats.currentKnowledge < 40) {
  currentColor = "#ef4444";
} else if (stats.currentKnowledge < 70) {
  currentColor = "#f59e0b";
}

// Knowledge Gain
let gainColor = "#22c55e";
let GainArrowIcon = FaArrowUp;
let gainStatusLabel = "Improved";
if (stats.knowledgeGainPercent < 0) {
  gainColor = "#ef4444";
  GainArrowIcon = FaArrowDown;
  gainStatusLabel = "Declined";
} else if (stats.knowledgeGainPercent === 0) {
  gainColor = "#9ca3af";
  GainArrowIcon = FaMinus;
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

  // Refetches on every underlying data change (mirrors the analytics base-data
  // cache's own invalidation in knowledgeAnalyticsService.js, which clears on
  // this same event with no scope filtering) so Analytics stays in sync with
  // edits made elsewhere in the admin panel without a manual page reload.
  useEffect(() => {
    const handleDataChanged = () => setRefreshTick((tick) => tick + 1);

    if (typeof window !== 'undefined') {
      window.addEventListener('ignis-safe:data-changed', handleDataChanged);
      return () => window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
    }

    return undefined;
  }, []);

  // Summary cards (Total Learners, Questions Answered, Average Session,
  // Knowledge Progress, Knowledge Gain) only depend on Timeframe/Users/Topic -
  // the chart-local Activity/Overview range selectors below don't affect them,
  // so they don't belong in this effect's dependencies.
  useEffect(() => {
    let isMounted = true;
    const cacheKey = `${timeframe}|${people}|${topic}`;
    const cached = summaryCacheRef.current.get(cacheKey);

    if (cached) {
      setStats(cached);
      setIsLoadingSummary(false);
    } else {
      setIsLoadingSummary(true);
    }

    const loadSummary = async () => {
      const { data } = await getAnalyticsDashboardStats({ timeframe, people, topic });
      if (!isMounted) return;

      const nextStats = data || DEFAULT_STATS;
      summaryCacheRef.current.set(cacheKey, nextStats);
      setStats(nextStats);
      setIsLoadingSummary(false);
    };

    loadSummary();

    return () => {
      isMounted = false;
    };
  }, [timeframe, people, topic, refreshTick]);

  // Charts additionally depend on the Activity Trends and Active Learner Trend
  // range selectors, so this stays a separate effect/fetch from the summary
  // cards above - changing either selector no longer re-triggers the summary
  // stats fetch.
  useEffect(() => {
    let isMounted = true;
    const cacheKey = `${timeframe}|${people}|${topic}|${activityTrendsView}|${userOverviewRange}`;
    const cached = chartsCacheRef.current.get(cacheKey);

    if (cached) {
      setCharts(cached);
      setIsLoadingCharts(false);
    } else {
      setIsLoadingCharts(true);
    }

    const loadCharts = async () => {
      const { data } = await getAnalyticsChartsData({
        timeframe,
        people,
        topic,
        activityTrendsView,
        userOverviewRange,
      });
      if (!isMounted) return;

      const nextCharts = data || DEFAULT_CHARTS;
      chartsCacheRef.current.set(cacheKey, nextCharts);
      setCharts(nextCharts);
      setIsLoadingCharts(false);
    };

    loadCharts();

    return () => {
      isMounted = false;
    };
  }, [timeframe, people, topic, activityTrendsView, userOverviewRange, refreshTick]);

  return (
    <div className="analytics-container">
      <Sidebar />

      <div className="analytics-main">
        <PageHeader
          title="Analytics"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="analytics-page-summary">
          <div>
            <span>Learning insights</span>
            <h2>Training Performance Overview</h2>
          </div>
          <p>
            See how learners use the application, complete training, and improve their knowledge.
            Filters update every measure and chart below.
          </p>
        </div>

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
            <div className="analytics-stat-heading">
              <span>Participation</span>
              <h3>Total Learners</h3>
            </div>
            <div className="stat-value">
              <span className="main-value">
                {isLoadingSummary ? <SkeletonText width="4rem" size="lg" /> : stats.totalUsers}
              </span>
            </div>
            <p>Total registered mobile app learners included in the selected filters.</p>
          </div>
          <div className="analytics-stat-card">
            <div className="analytics-stat-heading">
              <span>Learning activity</span>
              <h3>Questions Answered</h3>
            </div>
            <div className="stat-value">
              <span className="main-value">
                {isLoadingSummary ? <SkeletonText width="5rem" size="lg" /> : stats.questionsAnswered.toLocaleString()}
              </span>
            </div>
            <p>Total assessment questions submitted by the learners included in the filters.</p>
          </div>
          <div className="analytics-stat-card">
            <div className="analytics-stat-heading">
              <span>Time spent</span>
              <h3>Average Session</h3>
            </div>
            <div className="stat-value">
              <span className="main-value main-value-time">
                {isLoadingSummary ? <SkeletonText width="4.5rem" size="lg" /> : stats.avgSessionLength}
              </span>
            </div>
            <p>Typical time a learner spends in one application session.</p>
          </div>
        </div>

        <div className="knowledge-section">
          <div className="knowledge-compare-card">
            <div className="knowledge-compare-header">
              <div>
                <h3>Knowledge Progress</h3>
                <p>Average assessment scores before training compared with the latest scores.</p>
              </div>
              <span className="knowledge-compare-sub">0-100 score</span>
            </div>

            <div className="knowledge-bar-row">
              <div className="knowledge-bar-label">
                <span className="knowledge-bar-dot" style={{ background: startingColor }}></span>
                <span>Starting Knowledge</span>
                <span className="knowledge-bar-value" style={{ color: startingColor }}>
                  {isLoadingSummary ? <SkeletonText width="2.5rem" /> : `${stats.startingKnowledge}%`}
                </span>
              </div>
              <div className="knowledge-bar-track">
                <div
                  className="knowledge-bar-fill"
                  style={{
                    width: `${isLoadingSummary ? 0 : Math.min(Math.max(stats.startingKnowledge, 0), 100)}%`,
                    background: startingColor,
                  }}
                ></div>
              </div>
              <small>Baseline score before the selected learners began training.</small>
            </div>

            <div className="knowledge-bar-row">
              <div className="knowledge-bar-label">
                <span className="knowledge-bar-dot" style={{ background: currentColor }}></span>
                <span>Current Knowledge</span>
                <span className="knowledge-bar-value" style={{ color: currentColor }}>
                  {isLoadingSummary ? <SkeletonText width="2.5rem" /> : `${stats.currentKnowledge}%`}
                </span>
              </div>
              <div className="knowledge-bar-track">
                <div
                  className="knowledge-bar-fill"
                  style={{
                    width: `${isLoadingSummary ? 0 : Math.min(Math.max(stats.currentKnowledge, 0), 100)}%`,
                    background: currentColor,
                  }}
                ></div>
              </div>
              <small>Latest measured score from completed learning assessments.</small>
            </div>
          </div>

          <div className="knowledge-gain-card">
            <h3>Knowledge Gain</h3>
            <p className="knowledge-gain-description">Difference between starting and current knowledge.</p>
            <div className="gain-indicator">
              <span className="gain-arrow" style={{ color: gainColor }}>
                <GainArrowIcon aria-hidden="true" />
              </span>
              <span className="gain-value" style={{ color: gainColor }}>
                {isLoadingSummary
                  ? <SkeletonText width="3.5rem" size="lg" />
                  : `${stats.knowledgeGainPercent > 0 ? '+' : ''}${stats.knowledgeGainPercent}%`}
              </span>
            </div>
            <div
              className="gain-status-pill"
              style={{ background: `${gainColor}1a`, color: gainColor }}
            >
              {isLoadingSummary ? <SkeletonText width="3.5rem" size="sm" /> : gainStatusLabel}
            </div>
            <div className="gain-meter">
              <div className="gain-meter-track">
                <div className="gain-meter-zero-line"></div>
                {!isLoadingSummary && gainMagnitude > 0 && (
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
          <AnalyticsCardHeader
            title="Active Learner Trend"
            description="How many learners used the application in each period."
          >
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
          </AnalyticsCardHeader>
          <div className="overview-chart">
            <div className="analytics-chart-canvas analytics-chart-canvas-wide">
              {isLoadingCharts ? <SkeletonBlock /> : <UserOverviewChart chartData={charts.userOverview} />}
            </div>
          </div>
        </div>

        <div className="analytics-section-heading">
          <span>Detailed views</span>
          <h2>Learning Activity and Outcomes</h2>
          <p>Use these charts to spot participation changes, module strengths, and learners who may need support.</p>
        </div>

        <div className="analytics-charts-grid">
          {/* User Activity Trends */}
          <div className="analytics-chart-card activity-trends">
            <AnalyticsCardHeader
              title="Attempt Activity"
              description="Started attempts compared with attempts learners completed and submitted."
            >
              <select
                className="chart-timeframe-select"
                value={activityTrendsView}
                onChange={(e) => setActivityTrendsView(e.target.value)}
              >
                <option value="Month">Month</option>
                <option value="Week">Week</option>
                <option value="Year">Year</option>
              </select>
            </AnalyticsCardHeader>
            <div className="analytics-chart-canvas">
              {isLoadingCharts ? <SkeletonBlock /> : <ActivityTrendsChart chartData={charts.activityTrends} />}
            </div>
          </div>

          {/* Learning Improvement */}
          <div className="analytics-chart-card">
            <AnalyticsCardHeader
              title="Knowledge Improvement by Module"
              description="Pre-test and post-test scores show where learning improved after training."
            />
            <div className="analytics-chart-canvas analytics-chart-canvas-tall">
              {isLoadingCharts ? <SkeletonBlock /> : <TrainingProgressChart chartData={charts.learningByModule} />}
            </div>
            <div className="training-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#15803d' }}></span>
                <span>Post-Test (%)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#2563eb' }}></span>
                <span>Pre-Test (%)</span>
              </div>
            </div>
          </div>

          {/* Completion and Simulation */}
          <div className="analytics-chart-card">
            <AnalyticsCardHeader
              title="Module and Simulation Completion"
              description="Compares lesson completion with completion of the related practical simulation."
            />
            <div className="analytics-chart-canvas analytics-chart-canvas-tall">
              {isLoadingCharts ? <SkeletonBlock /> : <CompletionSimulationChart chartData={charts.completionByModule} />}
            </div>
            <div className="training-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#0f766e' }}></span>
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
            <AnalyticsCardHeader
              title="Knowledge Gain Over Time"
              description="Tracks how the measured improvement in learner scores changes over time."
            />
            <div className="analytics-chart-canvas">
              {isLoadingCharts ? <SkeletonBlock /> : <KnowledgeGainTrendChart chartData={charts.knowledgeGainTrend} />}
            </div>
          </div>

          {/* Risk Distribution */}
          <div className="analytics-chart-card">
            <AnalyticsCardHeader
              title="Learners Needing Support"
              description="Groups learners by how urgently their recent results may need attention."
            />
            <div className="analytics-chart-canvas analytics-chart-canvas-donut">
              {isLoadingCharts ? <SkeletonBlock /> : <RiskDistributionChart chartData={charts.riskDistribution} />}
            </div>
          </div>
        </div>

        {/* Test Attempts */}
        <div className="analytics-chart-card performance-chart">
          <AnalyticsCardHeader
            title="Assessment Attempts by Module"
            description="Shows where learners are most active and where repeated attempts may indicate difficulty."
          />
          <div className="analytics-chart-canvas analytics-chart-canvas-wide">
            {isLoadingCharts ? <SkeletonBlock /> : <PerformanceChart chartData={charts.attemptsByModule} />}
          </div>
          <div className="performance-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ background: '#a78bfa' }}></span>
              <span>Attempts</span>
            </div>
          </div>
        </div>

        <AIRecommendationsDialog />
      </div>
    </div>
  );
}
