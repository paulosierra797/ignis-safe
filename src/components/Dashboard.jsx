import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import CloseButton from './CloseButton';
import Hint from './Hint';
import AIRecommendationsDialog from './AIRecommendationsDialog';
import { getPersonnelOverviewStats, getUsersFromProfiles } from '../utils/usersService';
import { getAnalyticsDashboardStats, getAnalyticsChartsData } from '../utils/knowledgeAnalyticsService';
import { getPersonnelForDate, getShiftAssignmentSummaryForDate } from '../utils/personnelOperationsService';
import { getManilaToday, getMonthKeyInTimeZone } from '../utils/dateUtils';
import { formatStatusLabel } from '../utils/statusUtils';
import './Dashboard.css';
import './InsightsSurface.css';
import './DashboardOverview.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
gsap.registerPlugin(useGSAP);

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

const clampPercent = (value) => Math.min(100, Math.max(0, toNumber(value, 0)));

const getKnowledgeLevel = (value) => {
  const score = toNumber(value, 0);
  if (score < 40) return 'Needs support';
  if (score < 70) return 'Developing';
  return 'Proficient';
};

const percentOf = (value, total) => (total > 0 ? clampPercent((toNumber(value, 0) / total) * 100) : 0);

const RING_RADIUS = 32;

const LINE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'top',
      align: 'start',
      labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, color: '#667085', font: { family: 'Poppins', size: 11 } },
    },
  },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0, color: '#667085', font: { size: 11 } }, grid: { color: 'rgba(152, 162, 179, 0.18)' } },
    x: { ticks: { color: '#667085', font: { size: 11 } }, grid: { display: false } },
  },
};


export default function Dashboard() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [personnelStats, setPersonnelStats] = useState({
    totalPersonnel: 0,
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
    registeredThisMonth: 0,
    activeUsersToday: 0,
    activeUsersThisWeek: 0,
    newRegistrationsCurrent: 0,
    newRegistrationsPrevious: 0,
    trainingCompletionPercent: 0,
  });
  const knowledgeGain = analyticsStats.knowledgeGainPercent;
const isNegative = knowledgeGain < 0;
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
  // Each card owns its own loading flag (instead of one shared flag gating every
  // card on the slowest fetch) so fast cards can render as soon as their own
  // data arrives. None of these are ever reset back to true on a refetch, so
  // background refreshes (data-changed events, the daily interval) swap values
  // in place without flashing "..." again - matching the original single-flag
  // behavior for repeat loads.
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [mobileStatsLoading, setMobileStatsLoading] = useState(true);
  const [todayPersonnelLoading, setTodayPersonnelLoading] = useState(true);
  const [shiftAssignmentsLoading, setShiftAssignmentsLoading] = useState(true);
  const [activityTrendsLoading, setActivityTrendsLoading] = useState(true);

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

      // Each card's data is fetched and applied to state independently as soon
      // as it resolves, instead of waiting on Promise.all for every branch
      // (including the slowest one) before any card can render real data. The
      // underlying requests still all fire concurrently - only the state
      // updates are decoupled.

      const personnelStatsPromise = getPersonnelOverviewStats()
        .then(({ data, error }) => {
          if (error) console.error('Error fetching personnel stats:', error);
          if (data) setPersonnelStats(data);
          return error;
        })
        .catch((err) => {
          console.error('Failed to fetch personnel stats:', err);
          return err.message;
        });

      const analyticsPromise = getAnalyticsDashboardStats({ timeframe: 'All-time', people: 'All', topic: 'All' })
        .then(({ data, error }) => {
          if (error) console.error('Error fetching analytics stats:', error);
          setAnalyticsStats(data || DEFAULT_ANALYTICS_STATS);
          return error;
        })
        .catch((err) => {
          console.error('Failed to fetch analytics stats:', err);
          setAnalyticsStats(DEFAULT_ANALYTICS_STATS);
          return err.message;
        })
        .finally(() => setAnalyticsLoading(false));

      const usersPromise = getUsersFromProfiles();
      const chartsPromise = getAnalyticsChartsData({ timeframe: 'All-time', people: 'All', topic: 'All' });

      const chartsResultPromise = chartsPromise
        .then(({ data, error }) => {
          if (error) console.error('Error fetching charts data:', error);
          setChartsData(data || DEFAULT_CHARTS);
          return { data, error };
        })
        .catch((err) => {
          console.error('Failed to fetch charts data:', err);
          setChartsData(DEFAULT_CHARTS);
          return { data: null, error: err.message };
        })
        .finally(() => setChartsLoading(false));

      const mobileStatsPromise = Promise.all([usersPromise, chartsResultPromise])
        .then(([{ data: users, error: usersError }, { data: charts }]) => {
          if (usersError) console.error('Error fetching users for dashboard metrics:', usersError);

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

          const currentMonthKey = getMonthKeyInTimeZone(now);
          const registeredThisMonth = safeUsers.filter(
            (user) => getMonthKeyInTimeZone(user.created_at) === currentMonthKey,
          ).length;

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
            registeredThisMonth,
            activeUsersToday,
            activeUsersThisWeek,
            newRegistrationsCurrent,
            newRegistrationsPrevious,
            trainingCompletionPercent,
          });

          return usersError;
        })
        .catch((err) => {
          console.error('Failed to compute mobile stats:', err);
          return err.message;
        })
        .finally(() => setMobileStatsLoading(false));

      const todayPersonnelPromise = getPersonnelForDate(today)
        .then(({ data, error }) => {
          if (error) console.error('Error fetching today\'s on-duty/on-leave personnel:', error);
          setTodayPersonnelError(error || '');
          setTodayPersonnel({
            onDuty: data?.onDuty || [],
            onLeave: data?.onLeave || [],
          });
          return error;
        })
        .catch((err) => {
          console.error('Failed to fetch today\'s on-duty/on-leave personnel:', err);
          setTodayPersonnelError(err.message || '');
          return err.message;
        })
        .finally(() => setTodayPersonnelLoading(false));

      const shiftSummaryPromise = getShiftAssignmentSummaryForDate(today)
        .then(({ data, error }) => {
          if (error) console.error('Error fetching today\'s shift assignments:', error);
          setShiftAssignmentsError(error || '');
          setShiftAssignments({
            shiftA: data?.shiftA || [],
            shiftB: data?.shiftB || [],
          });
          return error;
        })
        .catch((err) => {
          console.error('Failed to fetch today\'s shift assignments:', err);
          setShiftAssignmentsError(err.message || '');
          return err.message;
        })
        .finally(() => setShiftAssignmentsLoading(false));

      const [
        personnelError,
        analyticsError,
        chartsResult,
        mobileError,
        todayError,
        shiftError,
      ] = await Promise.all([
        personnelStatsPromise,
        analyticsPromise,
        chartsResultPromise,
        mobileStatsPromise,
        todayPersonnelPromise,
        shiftSummaryPromise,
      ]);

      if (personnelError || analyticsError || chartsResult?.error || mobileError || todayError || shiftError) {
        setLoadError('Some dashboard metrics could not be loaded. Showing available data.');
      }
    } catch (err) {
      console.error('Failed to fetch dashboard metrics:', err);
      setLoadError('Failed to load dashboard metrics. Please refresh and try again.');
    }
  }, []);

  useEffect(() => {
    // fetchDashboardData updates each card's state as its own request resolves
    // (progressive loading) via .then()/.catch()/.finally() chains the compiler's
    // static analysis can't trace, so it flags this call as a false positive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        setActivityTrendsLoading(false);
        return;
      }

      setActivityTrendsData(data?.activityTrends || DEFAULT_CHARTS.activityTrends);
      setActivityTrendsLoading(false);
    };

    loadActivityTrends();

    return () => {
      isMounted = false;
    };
  }, [activityTimeframe]);

  const recentActivityLabels = activityTrendsData.labels;
  const recentActivityValues = activityTrendsData.submitted;

  const completionRows = chartsData.completionByModule.labels
    .map((label, index) => ({
      label,
      value: toNumber(chartsData.completionByModule.completionRate[index], 0),
    }))
    .sort((a, b) => b.value - a.value)
    ;

  const knowledgeGainPrefix = analyticsStats.knowledgeGainPercent > 0 ? '+' : '';

  // Ignore keys pressed on a nested control (tooltip label, select) so they do not trigger the card.
  const handleActivateKeyDown = (event, action) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  const handleCardKeyDown = (event, path) => handleActivateKeyDown(event, () => navigate(path));

  const mainRef = useRef(null);

  // Subtle entrance only; skipped when reduced motion is preferred.
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.ov-reveal', { y: 12, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope: mainRef });

  const gainClass = isNegative ? 'is-negative' : 'is-positive';
  const attendance = clampPercent(personnelStats.attendancePercentage);
  const ringCircumference = 2 * Math.PI * RING_RADIUS;
  const totalPersonnel = toNumber(personnelStats.totalPersonnel, 0);
  const show = (loading, value) => (loading ? '...' : value);

  const lineData = {
    labels: activityTrendsLoading ? [] : recentActivityLabels,
    datasets: [
      {
        label: 'Started',
        data: activityTrendsLoading ? [] : activityTrendsData.started,
        borderColor: '#94a3b8',
        backgroundColor: '#94a3b8',
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
      {
        label: 'Submitted',
        data: activityTrendsLoading ? [] : recentActivityValues,
        borderColor: '#b91c1c',
        backgroundColor: '#b91c1c',
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
      },
    ],
  };

  const registrationMax = Math.max(mobileStats.newRegistrationsCurrent, mobileStats.newRegistrationsPrevious, 1);

  const personnelRows = [
    {
      key: 'onDuty',
      label: 'On Duty',
      hint: 'Assigned today and not on approved leave.',
      value: todayPersonnel.onDuty.length,
      loading: todayPersonnelLoading,
      onActivate: () => setIsOnDutyModalOpen(true),
      aria: 'View personnel on duty today',
    },
    {
      key: 'onLeave',
      label: 'On Leave',
      hint: 'Personnel on approved leave today.',
      value: todayPersonnel.onLeave.length,
      loading: todayPersonnelLoading,
      tone: 'warn',
      onActivate: () => setIsOnLeaveModalOpen(true),
      aria: 'View personnel on leave today',
    },
    {
      key: 'shiftA',
      label: 'Shift A',
      hint: 'Personnel assigned to Shift A today.',
      value: shiftAssignments.shiftA.length,
      loading: shiftAssignmentsLoading,
      tone: 'neutral',
      onActivate: () => setIsShiftAModalOpen(true),
      aria: 'View personnel assigned to Shift A today',
    },
    {
      key: 'shiftB',
      label: 'Shift B',
      hint: 'Personnel assigned to Shift B today.',
      value: shiftAssignments.shiftB.length,
      loading: shiftAssignmentsLoading,
      tone: 'neutral',
      onActivate: () => setIsShiftBModalOpen(true),
      aria: 'View personnel assigned to Shift B today',
    },
  ];

  return (
    <div className="dashboard-container">
      <Sidebar />

      <div className="dashboard-main" ref={mainRef}>
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

        <div className="ov-stack">
          {/* Personnel Operations */}
          <section className="ov-panel ov-reveal">
            <h3 className="ov-title">
              <Hint text="Staffing, attendance, duty and leave for today.">Personnel Operations</Hint>
            </h3>
            <div className="ov-personnel">
              <div className="ov-kpis">
                <div
                  className="ov-kpi ov-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/dashboard/accounts?tab=personnel')}
                  onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/accounts?tab=personnel')}
                  aria-label="Open Personnel Directory"
                >
                  <Hint text="All registered personnel accounts."><span className="ov-label">Total Personnel</span></Hint>
                  <strong className="ov-number">{personnelStats.totalPersonnel}</strong>
                </div>

                <div
                  className="ov-kpi ov-ring-kpi ov-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/attendance-admin')}
                  onKeyDown={(event) => handleCardKeyDown(event, '/attendance-admin')}
                  aria-label="Open Attendance page"
                >
                  <svg className="ov-ring" viewBox="0 0 80 80" aria-hidden="true">
                    <circle className="ov-ring-track" cx="40" cy="40" r={RING_RADIUS} />
                    <circle
                      className="ov-ring-fill"
                      cx="40"
                      cy="40"
                      r={RING_RADIUS}
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringCircumference * (1 - attendance / 100)}
                    />
                  </svg>
                  <div>
                    <Hint text="Share of expected personnel who logged attendance today."><span className="ov-label">Today's Attendance</span></Hint>
                    <strong className="ov-number">{attendance}<small>%</small></strong>
                  </div>
                </div>
              </div>

              <div className="ov-bars">
                {personnelRows.map((row) => (
                  <div
                    key={row.key}
                    className="ov-row ov-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={row.onActivate}
                    onKeyDown={(event) => handleActivateKeyDown(event, row.onActivate)}
                    aria-label={row.aria}
                  >
                    <div className="ov-row-top">
                      <Hint text={row.hint}><span className="ov-label">{row.label}</span></Hint>
                      <strong>{show(row.loading, row.value)}</strong>
                    </div>
                    <div className="ov-track">
                      <span
                        className={`ov-fill ${row.tone ? `is-${row.tone}` : ''}`}
                        style={{ width: `${row.loading ? 0 : percentOf(row.value, totalPersonnel)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="ov-two">
            {/* Mobile Learning Activity */}
            <section className="ov-panel ov-reveal">
              <h3 className="ov-title">
                <Hint text="How many learners joined, use the app, and finish training.">Mobile Learning Activity</Hint>
              </h3>
              <div className="ov-kpis ov-kpis--row">
                <div
                  className="ov-kpi ov-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/dashboard/users?view=users')}
                  onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/users?view=users')}
                  aria-label="Open Users page"
                >
                  <Hint text="All learner accounts in the mobile app."><span className="ov-label">Total Registered</span></Hint>
                  <strong className="ov-number">{show(mobileStatsLoading, mobileStats.totalRegistered)}</strong>
                  <span className={`ov-sub ${mobileStats.registeredThisMonth > 0 ? 'is-positive' : ''}`}>
                    {show(mobileStatsLoading, `${mobileStats.registeredThisMonth > 0 ? '+' : ''}${mobileStats.registeredThisMonth} this month`)}
                  </span>
                </div>
                <div
                  className="ov-kpi ov-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/dashboard/analytics')}
                  onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/analytics')}
                  aria-label="Open Analytics page"
                >
                  <Hint text="Learners who used the app today."><span className="ov-label">Active Today</span></Hint>
                  <strong className="ov-number">{show(mobileStatsLoading, mobileStats.activeUsersToday)}</strong>
                  <span className="ov-sub">{show(mobileStatsLoading, `This week: ${mobileStats.activeUsersThisWeek}`)}</span>
                </div>
              </div>

              <div className="ov-bars">
                <div
                  className="ov-row ov-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/dashboard/users?view=users')}
                  onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/users?view=users')}
                  aria-label="Open Users page"
                >
                  <div className="ov-row-top">
                    <Hint text="Accounts created in the last 30 days, compared with the 30 days before."><span className="ov-label">New Registrations</span></Hint>
                  </div>
                  <div className="ov-compare">
                    <span className="ov-compare-label">Last 30 days</span>
                    <div className="ov-track"><span className="ov-fill" style={{ width: `${mobileStatsLoading ? 0 : percentOf(mobileStats.newRegistrationsCurrent, registrationMax)}%` }} /></div>
                    <strong>{show(mobileStatsLoading, mobileStats.newRegistrationsCurrent)}</strong>
                  </div>
                  <div className="ov-compare">
                    <span className="ov-compare-label">30 days before</span>
                    <div className="ov-track"><span className="ov-fill is-neutral" style={{ width: `${mobileStatsLoading ? 0 : percentOf(mobileStats.newRegistrationsPrevious, registrationMax)}%` }} /></div>
                    <strong>{show(mobileStatsLoading, mobileStats.newRegistrationsPrevious)}</strong>
                  </div>
                </div>

                <div
                  className="ov-row ov-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/dashboard/progress?view=users')}
                  onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/progress?view=users')}
                  aria-label="Open Progress page"
                >
                  <div className="ov-row-top">
                    <Hint text="Average completion across all training modules."><span className="ov-label">Training Completion</span></Hint>
                    <strong>{show(mobileStatsLoading, `${mobileStats.trainingCompletionPercent}%`)}</strong>
                  </div>
                  <div className="ov-track">
                    <span className="ov-fill" style={{ width: `${mobileStatsLoading ? 0 : clampPercent(mobileStats.trainingCompletionPercent)}%` }} />
                  </div>
                </div>
              </div>
            </section>

            {/* Knowledge Journey */}
            <section className="ov-panel ov-reveal">
              <h3 className="ov-title">
                <Hint text="Average score before training compared with the latest score.">Knowledge Journey</Hint>
              </h3>
              <div
                className="ov-journey ov-clickable"
                role="button"
                tabIndex={0}
                onClick={() => navigate('/dashboard/analytics')}
                onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/analytics')}
                aria-label="Open detailed learning analytics"
              >
                <div className="ov-kpi">
                  <Hint text="Change from the starting score to the latest score."><span className="ov-label">Change</span></Hint>
                  <strong className={`ov-number ${gainClass}`}>
                    {show(analyticsLoading, `${knowledgeGainPrefix}${knowledgeGain}%`)}
                  </strong>
                </div>
                <div className="ov-row">
                  <div className="ov-row-top">
                    <Hint text="Average score before learners began training."><span className="ov-label">Starting</span></Hint>
                    <strong>{show(analyticsLoading, `${startingKnowledge}%`)}</strong>
                  </div>
                  <div className="ov-track ov-track--lg">
                    <span className="ov-fill" style={{ width: `${analyticsLoading ? 0 : clampPercent(startingKnowledge)}%`, background: startingColor }} />
                  </div>
                  <span className="ov-sub">{getKnowledgeLevel(startingKnowledge)}</span>
                </div>
                <div className="ov-row">
                  <div className="ov-row-top">
                    <Hint text="Average of the latest learner scores."><span className="ov-label">Current</span></Hint>
                    <strong>{show(analyticsLoading, `${currentKnowledge}%`)}</strong>
                  </div>
                  <div className="ov-track ov-track--lg">
                    <span className="ov-fill" style={{ width: `${analyticsLoading ? 0 : clampPercent(currentKnowledge)}%`, background: currentColor }} />
                  </div>
                  <span className="ov-sub">{getKnowledgeLevel(currentKnowledge)}</span>
                </div>
              </div>
            </section>
          </div>

          {/* Learning Performance */}
          <div className="ov-two ov-two--wide">
            <section
              className="ov-panel ov-reveal ov-clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/dashboard/analytics')}
              onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/analytics')}
              aria-label="Open Analytics page"
            >
              <div className="ov-title-row">
                <h3 className="ov-title">
                  <Hint text="Training attempts started and submitted in each period.">Learning Activity</Hint>
                </h3>
                <select
                  className="ov-select"
                  value={activityTimeframe}
                  aria-label="Learning activity timeframe"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    setActivityTimeframe(event.target.value);
                  }}
                >
                  {ACTIVITY_TIMEFRAME_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="ov-chart">
                <Line data={lineData} options={LINE_OPTIONS} />
              </div>
            </section>

            <section
              className="ov-panel ov-reveal ov-clickable"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/dashboard/progress?view=users')}
              onKeyDown={(event) => handleCardKeyDown(event, '/dashboard/progress?view=users')}
              aria-label="Open Progress page"
            >
              <h3 className="ov-title">
                <Hint text="Share of learners who finished each module.">Completion by Module</Hint>
              </h3>
              <div className="ov-bars ov-bars--scroll">
                {completionRows.length === 0 ? (
                  <p className="ov-empty">{chartsLoading ? 'Loading...' : 'No module progress data yet.'}</p>
                ) : completionRows.map((row) => (
                  <div className="ov-row" key={row.label}>
                    <div className="ov-row-top">
                      <span className="ov-label">{row.label}</span>
                      <strong>{show(chartsLoading, `${Math.round(row.value)}%`)}</strong>
                    </div>
                    <div className="ov-track">
                      <span
                        className={`ov-fill ${row.value >= 80 ? '' : 'is-warn'}`}
                        style={{ width: `${chartsLoading ? 0 : clampPercent(row.value)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <AIRecommendationsDialog />

        {isOnDutyModalOpen && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
            <div className="dashboard-modal">
              <div className="dashboard-modal-header">
                <h3>On Duty Today ({todayPersonnel.onDuty.length})</h3>
                <CloseButton
                  className="dashboard-modal-close"
                  onClick={() => setIsOnDutyModalOpen(false)}
                  label="Close on duty personnel modal"
                />
              </div>
              <div className="dashboard-modal-body">
                {todayPersonnelLoading ? (
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
                <CloseButton
                  className="dashboard-modal-close"
                  onClick={() => setIsOnLeaveModalOpen(false)}
                  label="Close on leave personnel modal"
                />
              </div>
              <div className="dashboard-modal-body">
                {todayPersonnelLoading ? (
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
                            <td>{formatStatusLabel(person.approval_status)}</td>
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
                <CloseButton
                  className="dashboard-modal-close"
                  onClick={() => setIsShiftAModalOpen(false)}
                  label="Close Shift A personnel modal"
                />
              </div>
              <div className="dashboard-modal-body">
                {shiftAssignmentsLoading ? (
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
                <CloseButton
                  className="dashboard-modal-close"
                  onClick={() => setIsShiftBModalOpen(false)}
                  label="Close Shift B personnel modal"
                />
              </div>
              <div className="dashboard-modal-body">
                {shiftAssignmentsLoading ? (
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
