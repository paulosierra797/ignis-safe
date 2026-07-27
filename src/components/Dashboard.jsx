import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import AIRecommendationsDialog from './AIRecommendationsDialog';
import { getPersonnelOverviewStats, getUsersFromProfiles } from '../utils/usersService';
import { getAnalyticsDashboardStats, getAnalyticsChartsData } from '../utils/knowledgeAnalyticsService';
import { getPersonnelForDate, getShiftAssignmentSummaryForDate } from '../utils/personnelOperationsService';
import { getManilaToday } from '../utils/dateUtils';
import './Dashboard.css';

const DEFAULT_ANALYTICS_STATS = {
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
};

const ACTIVITY_TIMEFRAME_OPTIONS = ['Last 7 Days', 'Last 30 Days', 'This Month', 'This Year'];

const getActivityTrendsParams = (option) => {
  switch (option) {
    case 'Last 30 Days':
      return { timeframe: 'Last 30 days', activityTrendsView: 'Days30' };
    case 'This Month':
      return { timeframe: 'All-time', activityTrendsView: 'Month' };
    case 'This Year':
      return { timeframe: 'All-time', activityTrendsView: 'Year' };
    case 'Last 7 Days':
    default:
      return { timeframe: 'Last 7 days', activityTrendsView: 'Week' };
  }
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPercentDelta = (current, previous) => {
  const safeCurrent = toNumber(current, 0);
  const safePrevious = toNumber(previous, 0);

  if (safePrevious <= 0) {
    if (safeCurrent <= 0) return 0;
    return 100;
  }

  return Math.round(((safeCurrent - safePrevious) / safePrevious) * 100);
};

const getBarHeights = (values) => {
  const safeValues = (values || []).map((value) => toNumber(value, 0));
  const maxValue = Math.max(...safeValues, 0);

  return safeValues.map((value) => {
    if (maxValue <= 0) return 12;
    return Math.max(12, Math.round((value / maxValue) * 100));
  });
};

const clampPercent = (value) => Math.min(100, Math.max(0, toNumber(value, 0)));

const getKnowledgeLevel = (value) => {
  const score = toNumber(value, 0);
  if (score < 40) return 'Needs support';
  if (score < 70) return 'Developing';
  return 'Proficient';
};

function DashboardSectionHeader({ eyebrow, title, description }) {
  return (
    <div className="dashboard-section-heading">
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      <p>{description}</p>
    </div>
  );
}


export default function Dashboard() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [personnelStats, setPersonnelStats] = useState({
    totalPersonnel: 0,
    totalCapacity: 0,
    onDuty: 0,
    offDuty: 0,
    attendancePercentage: 0
  });
 
  const [analyticsStats, setAnalyticsStats] = useState(DEFAULT_ANALYTICS_STATS);
  const [chartsData, setChartsData] = useState(DEFAULT_CHARTS);
  const [activityTimeframe, setActivityTimeframe] = useState('Last 7 Days');
  const [activityTrendsData, setActivityTrendsData] = useState(DEFAULT_CHARTS.activityTrends);
  const [mobileStats, setMobileStats] = useState({
    totalRegistered: 0,
    activeUsersToday: 0,
    activeUsersThisWeek: 0,
    newRegistrationsCurrent: 0,
    newRegistrationsPrevious: 0,
    trainingCompletionPercent: 0,
  });
  const knowledgeGain = analyticsStats.knowledgeGainPercent;
const isNegative = knowledgeGain < 0;
const gainColor = isNegative ? "#ef4444" : "#22c55e"; // red : green
  const startingKnowledge = analyticsStats.startingKnowledge;

let startingColor = "#22c55e"; // Green
if (startingKnowledge < 40) {
  startingColor = "#ef4444"; // Red
} else if (startingKnowledge < 70) {
  startingColor = "#f59e0b"; // Yellow
}
const currentKnowledge = analyticsStats.currentKnowledge;

let currentColor = "#22c55e"; // Green (High)

if (currentKnowledge < 40) {
  currentColor = "#ef4444"; // Red (Low)
} else if (currentKnowledge < 70) {
  currentColor = "#f59e0b"; // Yellow (Moderate)
}
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [todayPersonnel, setTodayPersonnel] = useState({ onDuty: [], onLeave: [] });
  const [todayPersonnelError, setTodayPersonnelError] = useState('');
  const [isOnDutyModalOpen, setIsOnDutyModalOpen] = useState(false);
  const [isOnLeaveModalOpen, setIsOnLeaveModalOpen] = useState(false);

  const [shiftAssignments, setShiftAssignments] = useState({ shiftA: [], shiftB: [] });
  const [shiftAssignmentsError, setShiftAssignmentsError] = useState('');
  const [isShiftAModalOpen, setIsShiftAModalOpen] = useState(false);
  const [isShiftBModalOpen, setIsShiftBModalOpen] = useState(false);

  const fetchDashboardData = useCallback(async () => {
      try {
        setLoadError('');

        const today = getManilaToday();

        const [
          { data: personnelData, error: personnelError },
          { data: analyticsData, error: analyticsError },
          { data: charts, error: chartsError },
          { data: users, error: usersError },
          { data: todayPersonnelData, error: todayPersonnelFetchError },
          { data: shiftSummaryData, error: shiftSummaryError },
        ] = await Promise.all([
          getPersonnelOverviewStats(),
          getAnalyticsDashboardStats({ timeframe: 'All-time', people: 'All', topic: 'All' }),
          getAnalyticsChartsData({ timeframe: 'All-time', people: 'All', topic: 'All' }),
          getUsersFromProfiles(),
          getPersonnelForDate(today),
          getShiftAssignmentSummaryForDate(today),
        ]);

        if (personnelError) {
          console.error('Error fetching personnel stats:', personnelError);
        }
        if (analyticsError) {
          console.error('Error fetching analytics stats:', analyticsError);
        }
        if (chartsError) {
          console.error('Error fetching charts data:', chartsError);
        }
        if (usersError) {
          console.error('Error fetching users for dashboard metrics:', usersError);
        }
        if (todayPersonnelFetchError) {
          console.error('Error fetching today\'s on-duty/on-leave personnel:', todayPersonnelFetchError);
        }
        if (shiftSummaryError) {
          console.error('Error fetching today\'s shift assignments:', shiftSummaryError);
        }

        if (personnelData) {
          setPersonnelStats(personnelData);
        }

        setTodayPersonnelError(todayPersonnelFetchError || '');
        setTodayPersonnel({
          onDuty: todayPersonnelData?.onDuty || [],
          onLeave: todayPersonnelData?.onLeave || [],
        });

        setShiftAssignmentsError(shiftSummaryError || '');
        setShiftAssignments({
          shiftA: shiftSummaryData?.shiftA || [],
          shiftB: shiftSummaryData?.shiftB || [],
        });

        setAnalyticsStats(analyticsData || DEFAULT_ANALYTICS_STATS);
        setChartsData(charts || DEFAULT_CHARTS);

        const safeUsers = users || [];
        const now = new Date();
        const currentPeriodStart = new Date(now);
        currentPeriodStart.setDate(now.getDate() - 30);
        const previousPeriodStart = new Date(now);
        previousPeriodStart.setDate(now.getDate() - 60);

        const newRegistrationsCurrent = safeUsers.filter((user) => {
          if (!user.created_at) return false;
          const date = new Date(user.created_at);
          if (Number.isNaN(date.getTime())) return false;
          return date >= currentPeriodStart;
        }).length;

        const newRegistrationsPrevious = safeUsers.filter((user) => {
          if (!user.created_at) return false;
          const date = new Date(user.created_at);
          if (Number.isNaN(date.getTime())) return false;
          return date >= previousPeriodStart && date < currentPeriodStart;
        }).length;

        const userOverviewValues = charts?.userOverview?.values || [];
        const activeUsersToday = toNumber(userOverviewValues[userOverviewValues.length - 1], 0);
        const activeUsersThisWeek = userOverviewValues
          .slice(-7)
          .reduce((sum, value) => sum + toNumber(value, 0), 0);

        const completionRates = charts?.completionByModule?.completionRate || [];
        const trainingCompletionPercent = completionRates.length > 0
          ? Math.round(completionRates.reduce((sum, value) => sum + toNumber(value, 0), 0) / completionRates.length)
          : 0;

        setMobileStats({
          totalRegistered: safeUsers.length,
          activeUsersToday,
          activeUsersThisWeek,
          newRegistrationsCurrent,
          newRegistrationsPrevious,
          trainingCompletionPercent,
        });

        if (personnelError || analyticsError || chartsError || usersError || todayPersonnelFetchError || shiftSummaryError) {
          setLoadError('Some dashboard metrics could not be loaded. Showing available data.');
        }
      } catch (err) {
        console.error('Failed to fetch dashboard metrics:', err);
        setLoadError('Failed to load dashboard metrics. Please refresh and try again.');
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const handleDataChanged = (event) => {
      const scope = event?.detail?.scope || '';
      if (!scope || ['users', 'profile', 'dashboard', 'attendance', 'leave_requests'].includes(scope)) {
        void fetchDashboardData();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('ignis-safe:data-changed', handleDataChanged);
      return () => window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
    }

    return undefined;
  }, [fetchDashboardData]);

  useEffect(() => {
    let currentManilaDate = getManilaToday();

    const intervalId = setInterval(() => {
      const latestManilaDate = getManilaToday();
      if (latestManilaDate !== currentManilaDate) {
        currentManilaDate = latestManilaDate;
        void fetchDashboardData();
      }
    }, 60000);

    return () => clearInterval(intervalId);
  }, [fetchDashboardData]);

  useEffect(() => {
    let isMounted = true;

    const loadActivityTrends = async () => {
      const { data, error } = await getAnalyticsChartsData({
        people: 'All',
        topic: 'All',
        ...getActivityTrendsParams(activityTimeframe),
      });

      if (!isMounted) return;

      if (error) {
        console.error('Error fetching activity trends:', error);
        return;
      }

      setActivityTrendsData(data?.activityTrends || DEFAULT_CHARTS.activityTrends);
    };

    loadActivityTrends();

    return () => {
      isMounted = false;
    };
  }, [activityTimeframe]);

  const recentActivityLabels = activityTrendsData.labels;
  const recentActivityValues = activityTrendsData.submitted;
  const activityBarHeights = getBarHeights(recentActivityValues);

  const completionRows = chartsData.completionByModule.labels
    .map((label, index) => ({
      label,
      value: toNumber(chartsData.completionByModule.completionRate[index], 0),
    }))
    .sort((a, b) => b.value - a.value)
    ;

  const registrationTrend = toPercentDelta(
    mobileStats.newRegistrationsCurrent,
    mobileStats.newRegistrationsPrevious,
  );

  const knowledgeGainPrefix = analyticsStats.knowledgeGainPercent > 0 ? '+' : '';

  const handleCardKeyDown = (event, path) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(path);
    }
  };

  return (
    <div className="dashboard-container">
      <Sidebar />
      
      <div className="dashboard-main">
        <PageHeader
          title="Dashboard"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {loadError && (
          <div className="dashboard-load-message">
            {loadError}
          </div>
        )}

        {/* Personnel Metrics Section */}
        <div className="metrics-section">
          <DashboardSectionHeader
            eyebrow="Today"
            title="Personnel Operations"
            description="Current staffing, attendance, duty, and leave information for today's operations."
          />
          <div className="metrics-grid">
            <div
              className="metric-card clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/dashboard/accounts')}
              onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/accounts')}
              aria-label="Open Personnel page"
            >
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
                <p className="metric-description">Registered personnel compared with the configured staffing capacity.</p>
              </div>
            </div>

            <div
              className="metric-card clickable"
              role="button"
              tabIndex={0}
              onClick={() => setIsShiftAModalOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setIsShiftAModalOpen(true);
                }
              }}
              aria-label="View personnel assigned to Shift A today"
            >
              <div className="metric-icon duty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">Shift A</p>
                <div className="metric-value">
                  <span className="main-number">{loading ? '...' : shiftAssignments.shiftA.length}</span>
                </div>
                <p className="metric-description">Personnel assigned to Shift A for today's duty schedule.</p>
              </div>
            </div>

            <div
              className="metric-card clickable"
              role="button"
              tabIndex={0}
              onClick={() => setIsShiftBModalOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setIsShiftBModalOpen(true);
                }
              }}
              aria-label="View personnel assigned to Shift B today"
            >
              <div className="metric-icon duty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">Shift B</p>
                <div className="metric-value">
                  <span className="main-number">{loading ? '...' : shiftAssignments.shiftB.length}</span>
                </div>
                <p className="metric-description">Personnel assigned to Shift B for today's duty schedule.</p>
              </div>
            </div>

            <div
              className="metric-card clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/attendance-admin')}
              onKeyDown={(event) => handleCardKeyDown(event, '/attendance-admin')}
              aria-label="Open Attendance page"
            >
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
                <p className="metric-description">Share of expected personnel who recorded attendance today.</p>
              </div>
            </div>

            <div
              className="metric-card clickable"
              role="button"
              tabIndex={0}
              onClick={() => setIsOnDutyModalOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setIsOnDutyModalOpen(true);
                }
              }}
              aria-label="View personnel on duty today"
            >
              <div className="metric-icon duty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">On Duty Today</p>
                <div className="metric-value">
                  <span className="main-number">{loading ? '...' : todayPersonnel.onDuty.length}</span>
                </div>
                <p className="metric-description">Assigned personnel available for duty after approved leave is considered.</p>
              </div>
            </div>

            <div
              className="metric-card clickable"
              role="button"
              tabIndex={0}
              onClick={() => setIsOnLeaveModalOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setIsOnLeaveModalOpen(true);
                }
              }}
              aria-label="View personnel on leave today"
            >
              <div className="metric-icon leave">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M3 10H21M7 3V6M17 3V6M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">On Leave Today</p>
                <div className="metric-value">
                  <span className="main-number">{loading ? '...' : todayPersonnel.onLeave.length}</span>
                </div>
                <p className="metric-description">Personnel covered by an approved leave period today.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile App Users Section */}
        <div className="metrics-section">
          <DashboardSectionHeader
            eyebrow="Engagement"
            title="Mobile Learning Activity"
            description="Registration, recent use, and training completion across mobile learners."
          />
          <div className="metrics-grid-4">
            <div
              className="metric-card compact clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/dashboard/users')}
              onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/users')}
              aria-label="Open Users page"
            >
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
                  <span className="main-number">{loading ? '...' : mobileStats.totalRegistered}</span>
                </div>
                <span className={`metric-trend ${registrationTrend >= 0 ? 'positive' : ''}`}>
                  {loading
                    ? '...'
                    : `${registrationTrend >= 0 ? '+' : ''}${registrationTrend}% this month`}
                </span>
                <p className="metric-description">All learner accounts currently registered in the mobile application.</p>
              </div>
            </div>

            <div
              className="metric-card compact clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/dashboard/analytics')}
              onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/analytics')}
              aria-label="Open Analytics page"
            >
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
                  <span className="main-number">{loading ? '...' : mobileStats.activeUsersToday}</span>
                </div>
                <span className="metric-detail">
                  {loading ? '...' : `This Week: ${mobileStats.activeUsersThisWeek}`}
                </span>
                <p className="metric-description">Learners who opened and used the application during the selected day.</p>
              </div>
            </div>

            <div
              className="metric-card compact clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/dashboard/users')}
              onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/users')}
              aria-label="Open Users page"
            >
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
                  <span className="main-number">{loading ? '...' : mobileStats.newRegistrationsCurrent}</span>
                </div>
                <span className="metric-comparison">
                  {loading ? '...' : `Last Month: ${mobileStats.newRegistrationsPrevious}`}
                </span>
                <p className="metric-description">Accounts created during the most recent 30-day period.</p>
              </div>
            </div>

            <div
              className="metric-card compact clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/dashboard/progress')}
              onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/progress')}
              aria-label="Open Progress page"
            >
              <div className="metric-icon completion">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.7088 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.85999" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="metric-content">
                <p className="metric-label">Training Completion</p>
                <div className="metric-value">
                  <span className="main-number">{loading ? '...' : mobileStats.trainingCompletionPercent}</span>
                  <span className="percentage-sign">%</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${loading ? 0 : mobileStats.trainingCompletionPercent}%` }}
                  ></div>
                </div>
                <p className="metric-description">Average module completion across the available training content.</p>
              </div>
            </div>
          </div>
        </div>

        <section className="dashboard-knowledge-section">
          <DashboardSectionHeader
            eyebrow="Learning outcome"
            title="Knowledge Journey"
            description="A direct comparison of average learner scores before training and their latest measured scores."
          />
          <div
            className="knowledge-journey"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/dashboard/analytics')}
            onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/analytics')}
            aria-label="Open detailed learning analytics"
          >
            <div className="knowledge-score">
              <div
                className="knowledge-ring"
                style={{
                  '--knowledge-value': `${clampPercent(startingKnowledge)}%`,
                  '--knowledge-color': startingColor,
                }}
              >
                <div>
                  <strong>{loading ? '...' : `${startingKnowledge}%`}</strong>
                  <span>Starting</span>
                </div>
              </div>
              <div className="knowledge-score-copy">
                <strong>Starting Knowledge</strong>
                <span>{getKnowledgeLevel(startingKnowledge)}</span>
                <p>Average baseline score recorded before learners completed training.</p>
              </div>
            </div>

            <div className="knowledge-change">
              <span className="knowledge-change-label">Measured change</span>
              <strong style={{ color: gainColor }}>
                {loading ? '...' : `${knowledgeGainPrefix}${knowledgeGain}%`}
              </strong>
              <div className="knowledge-change-track" aria-hidden="true">
                <span style={{ left: `${clampPercent(startingKnowledge)}%`, background: startingColor }} />
                <span style={{ left: `${clampPercent(currentKnowledge)}%`, background: currentColor }} />
              </div>
              <p>
                {isNegative
                  ? 'Latest scores are below the starting average and may need closer review.'
                  : 'Latest scores are above the starting average, showing learning improvement.'}
              </p>
            </div>

            <div className="knowledge-score">
              <div
                className="knowledge-ring"
                style={{
                  '--knowledge-value': `${clampPercent(currentKnowledge)}%`,
                  '--knowledge-color': currentColor,
                }}
              >
                <div>
                  <strong>{loading ? '...' : `${currentKnowledge}%`}</strong>
                  <span>Current</span>
                </div>
              </div>
              <div className="knowledge-score-copy">
                <strong>Current Knowledge</strong>
                <span>{getKnowledgeLevel(currentKnowledge)}</span>
                <p>Average latest score after completed assessments and learning activity.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Charts Section */}
        <DashboardSectionHeader
          eyebrow="Trends"
          title="Learning Performance"
          description="Recent submitted activity and module completion, shown together for quick comparison."
        />
        <div className="charts-section">
          <div
            className="chart-card clickable"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/dashboard/analytics')}
            onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/analytics')}
            aria-label="Open Analytics page"
          >
            <div className="chart-header">
              <div>
                <h3>Submitted Learning Activity</h3>
                <p>Number of completed and submitted attempts in each period.</p>
              </div>
              <select
                className="chart-select"
                value={activityTimeframe}
                aria-label="User Activity Trends timeframe"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  setActivityTimeframe(event.target.value);
                }}
              >
                {ACTIVITY_TIMEFRAME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="chart-body">
              <div className="bar-chart">
                {(recentActivityLabels.length > 0 ? recentActivityLabels : ['-', '-', '-', '-', '-', '-', '-']).map((label, index) => (
                  <div key={index} className="bar-wrapper">
                    <div className="bar" style={{ height: `${activityBarHeights[index] || 12}%` }}>
                      <span className="bar-value">{loading ? '...' : (recentActivityValues[index] || 0)}</span>
                    </div>
                    <span className="bar-label">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="chart-card clickable"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/dashboard/progress')}
            onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/progress')}
            aria-label="Open Progress page"
          >
            <div className="chart-header">
              <div>
                <h3>Completion by Module</h3>
                <p>Percentage of learners who completed each training module.</p>
              </div>
            </div>
            <div className="chart-body">
              <div className="stats-list">
                {completionRows.length === 0 ? (
                  <div className="stat-item">
                    <div className="stat-info">
                      <span className="stat-label">No module progress data available</span>
                      <span className="stat-percent">0%</span>
                    </div>
                    <div className="stat-bar">
                      <div className="stat-bar-fill in-progress" style={{ width: '0%' }}></div>
                    </div>
                  </div>
                ) : completionRows.map((row) => (
                  <div className="stat-item" key={row.label}>
                    <div className="stat-info">
                      <span className="stat-label">{row.label}</span>
                      <span className="stat-percent">{loading ? '...' : `${Math.round(row.value)}%`}</span>
                    </div>
                    <div className="stat-bar">
                      <div
                        className={`stat-bar-fill ${row.value >= 80 ? 'completed' : 'in-progress'}`}
                        style={{ width: `${Math.max(0, Math.min(100, row.value))}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <AIRecommendationsDialog />

        {isOnDutyModalOpen && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
            <div className="dashboard-modal">
              <div className="dashboard-modal-header">
                <h3>On Duty Today ({todayPersonnel.onDuty.length})</h3>
                <button
                  className="dashboard-modal-close"
                  onClick={() => setIsOnDutyModalOpen(false)}
                  aria-label="Close on duty personnel modal"
                >
                  x
                </button>
              </div>
              <div className="dashboard-modal-body">
                {loading ? (
                  <p className="dashboard-modal-empty">Loading today's on-duty personnel...</p>
                ) : todayPersonnelError ? (
                  <div className="dashboard-modal-message dashboard-modal-message-error">
                    Unable to load on-duty personnel: {todayPersonnelError}
                  </div>
                ) : todayPersonnel.onDuty.length === 0 ? (
                  <p className="dashboard-modal-empty">No personnel are on duty today.</p>
                ) : (
                  <div className="dashboard-modal-table-wrap">
                    <table className="dashboard-modal-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Rank</th>
                          <th>Time In</th>
                          <th>Time Out</th>
                        </tr>
                      </thead>
                      <tbody>
                        {todayPersonnel.onDuty.map((person) => (
                          <tr key={person.admin_id}>
                            <td>{person.name}</td>
                            <td>{person.rank}</td>
                            <td>{person.time_in || '-'}</td>
                            <td>{person.time_out || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isOnLeaveModalOpen && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
            <div className="dashboard-modal">
              <div className="dashboard-modal-header">
                <h3>On Leave Today ({todayPersonnel.onLeave.length})</h3>
                <button
                  className="dashboard-modal-close"
                  onClick={() => setIsOnLeaveModalOpen(false)}
                  aria-label="Close on leave personnel modal"
                >
                  x
                </button>
              </div>
              <div className="dashboard-modal-body">
                {loading ? (
                  <p className="dashboard-modal-empty">Loading today's on-leave personnel...</p>
                ) : todayPersonnelError ? (
                  <div className="dashboard-modal-message dashboard-modal-message-error">
                    Unable to load on-leave personnel: {todayPersonnelError}
                  </div>
                ) : todayPersonnel.onLeave.length === 0 ? (
                  <p className="dashboard-modal-empty">No personnel are on leave today.</p>
                ) : (
                  <div className="dashboard-modal-table-wrap">
                    <table className="dashboard-modal-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Rank</th>
                          <th>Leave Period</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {todayPersonnel.onLeave.map((person) => (
                          <tr key={person.admin_id}>
                            <td>{person.name}</td>
                            <td>{person.rank}</td>
                            <td>{person.leave_start_date} - {person.leave_end_date}</td>
                            <td>{person.approval_status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isShiftAModalOpen && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
            <div className="dashboard-modal">
              <div className="dashboard-modal-header">
                <h3>Shift A Today ({shiftAssignments.shiftA.length})</h3>
                <button
                  className="dashboard-modal-close"
                  onClick={() => setIsShiftAModalOpen(false)}
                  aria-label="Close Shift A personnel modal"
                >
                  x
                </button>
              </div>
              <div className="dashboard-modal-body">
                {loading ? (
                  <p className="dashboard-modal-empty">Loading Shift A assignments...</p>
                ) : shiftAssignmentsError ? (
                  <div className="dashboard-modal-message dashboard-modal-message-error">
                    Unable to load Shift A assignments: {shiftAssignmentsError}
                  </div>
                ) : shiftAssignments.shiftA.length === 0 ? (
                  <p className="dashboard-modal-empty">No personnel are assigned to Shift A today.</p>
                ) : (
                  <div className="dashboard-modal-table-wrap">
                    <table className="dashboard-modal-table">
                      <thead>
                        <tr>
                          <th>No.</th>
                          <th>Name</th>
                          <th>Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shiftAssignments.shiftA.map((person, index) => (
                          <tr key={person.admin_id}>
                            <td>{index + 1}</td>
                            <td>{person.name}</td>
                            <td>{person.rank}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isShiftBModalOpen && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
            <div className="dashboard-modal">
              <div className="dashboard-modal-header">
                <h3>Shift B Today ({shiftAssignments.shiftB.length})</h3>
                <button
                  className="dashboard-modal-close"
                  onClick={() => setIsShiftBModalOpen(false)}
                  aria-label="Close Shift B personnel modal"
                >
                  x
                </button>
              </div>
              <div className="dashboard-modal-body">
                {loading ? (
                  <p className="dashboard-modal-empty">Loading Shift B assignments...</p>
                ) : shiftAssignmentsError ? (
                  <div className="dashboard-modal-message dashboard-modal-message-error">
                    Unable to load Shift B assignments: {shiftAssignmentsError}
                  </div>
                ) : shiftAssignments.shiftB.length === 0 ? (
                  <p className="dashboard-modal-empty">No personnel are assigned to Shift B today.</p>
                ) : (
                  <div className="dashboard-modal-table-wrap">
                    <table className="dashboard-modal-table">
                      <thead>
                        <tr>
                          <th>No.</th>
                          <th>Name</th>
                          <th>Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shiftAssignments.shiftB.map((person, index) => (
                          <tr key={person.admin_id}>
                            <td>{index + 1}</td>
                            <td>{person.name}</td>
                            <td>{person.rank}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
