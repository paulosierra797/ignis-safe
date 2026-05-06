import { supabase } from './supabaseClient';
import { getUsersFromProfiles } from './usersService';

const ANALYTICS_API_URL = String(import.meta.env.VITE_ANALYTICS_API_URL || '').replace(/\/+$/, '');
const ANALYTICS_API_KEY = String(import.meta.env.VITE_ANALYTICS_API_KEY || '');
const MAX_SESSION_DURATION_SECONDS = Number(import.meta.env.VITE_MAX_SESSION_DURATION_SECONDS || 7200);

const DEFAULT_STATS = {
  activeUsers: 0,
  totalUsers: 0,
  questionsAnswered: 0,
  avgSessionLength: '0m 00s',
  startingKnowledge: 0,
  currentKnowledge: 0,
  knowledgeGainPercent: 0,
};

const DEFAULT_FILTER_OPTIONS = {
  topics: ['All'],
};

const DEFAULT_CHARTS_DATA = {
  userOverview: { labels: [], values: [] },
  activityTrends: { labels: [], started: [], submitted: [] },
  learningByModule: { labels: [], preTest: [], postTest: [] },
  completionByModule: { labels: [], completionRate: [], simulationCompletion: [] },
  attemptsByModule: { labels: [], attempts: [] },
  knowledgeGainTrend: { labels: [], values: [] },
  riskDistribution: { labels: ['High', 'Moderate', 'Low'], values: [0, 0, 0] },
};

const callAnalyticsApi = async (endpoint, payload = null) => {
  if (!ANALYTICS_API_URL) return null;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (ANALYTICS_API_KEY) {
    headers['x-analytics-api-key'] = ANALYTICS_API_KEY;
  }

  const response = await fetch(`${ANALYTICS_API_URL}${endpoint}`, {
    method: payload ? 'POST' : 'GET',
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Analytics API request failed (${response.status})`);
  }

  return response.json();
};

const tryAnalyticsApi = async (endpoint, payload = null) => {
  if (!ANALYTICS_API_URL) return null;

  try {
    return await callAnalyticsApi(endpoint, payload);
  } catch (error) {
    console.warn('Analytics API unavailable, using local computation fallback:', error);
    return null;
  }
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const formatDuration = (seconds) => {
  const safeSeconds = Math.max(0, Math.floor(toNumber(seconds, 0)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
};

const extractValidSessionDurations = (attempts) => {
  return (attempts || []).reduce((accumulator, attempt) => {
    if (!attempt?.started_at || !attempt?.submitted_at) return accumulator;

    const startedAt = new Date(attempt.started_at).getTime();
    const submittedAt = new Date(attempt.submitted_at).getTime();
    if (!Number.isFinite(startedAt) || !Number.isFinite(submittedAt)) return accumulator;

    const diffSeconds = Math.floor((submittedAt - startedAt) / 1000);
    if (diffSeconds <= 0) return accumulator;
    if (diffSeconds > MAX_SESSION_DURATION_SECONDS) return accumulator;

    accumulator.push(diffSeconds);
    return accumulator;
  }, []);
};

const normalizeType = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .trim();

const isPreTestType = (value) => {
  const normalized = normalizeType(value);
  return normalized === 'pre_test' || normalized === 'pretest' || normalized.includes('pre');
};

const isPostTestType = (value) => {
  const normalized = normalizeType(value);
  return (
    normalized === 'post_test' ||
    normalized === 'posttest' ||
    normalized.includes('post') ||
    normalized.includes('final')
  );
};

const getTimeframeStartDate = (timeframe) => {
  const now = new Date();

  if (timeframe === 'Last 7 days') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (timeframe === 'Last 30 days') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return null;
};

const getAttemptTimestamp = (attempt) => {
  return attempt?.submitted_at || attempt?.started_at || attempt?.created_at || null;
};

const includesByTimeframe = (isoDate, startDate) => {
  if (!startDate) return true;
  if (!isoDate) return false;

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return false;

  return parsed >= startDate;
};

const includesByPeople = (status, peopleFilter) => {
  const normalizedStatus = String(status || '').toLowerCase().trim();

  if (peopleFilter === 'Active') return normalizedStatus === 'active';
  if (peopleFilter === 'Inactive') return normalizedStatus !== 'active';
  return true;
};

const includesByTopic = (moduleData, topicFilter) => {
  if (!topicFilter || topicFilter === 'All') return true;

  const selected = String(topicFilter).toLowerCase().trim();
  const moduleId = String(moduleData?.id || '').toLowerCase();
  const moduleTitle = String(moduleData?.title || '').toLowerCase().trim();

  return moduleId === selected || moduleTitle === selected;
};

const buildActivityTrends = (filteredAttempts, view = 'Month') => {
  const selectedView = String(view || 'Month');
  const now = new Date();

  if (selectedView === 'Week') {
    const labels = [];
    const started = Array(7).fill(0);
    const submitted = Array(7).fill(0);

    const dayKeys = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    });

    const keyToIndex = dayKeys.reduce((accumulator, key, index) => {
      accumulator[key] = index;
      return accumulator;
    }, {});

    filteredAttempts.forEach((attempt) => {
      if (attempt.started_at) {
        const startedAt = new Date(attempt.started_at);
        if (!Number.isNaN(startedAt.getTime())) {
          const key = `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, '0')}-${String(startedAt.getDate()).padStart(2, '0')}`;
          const index = keyToIndex[key];
          if (Number.isInteger(index)) {
            started[index] += 1;
          }
        }
      }

      if (attempt.submitted_at) {
        const submittedAt = new Date(attempt.submitted_at);
        if (!Number.isNaN(submittedAt.getTime())) {
          const key = `${submittedAt.getFullYear()}-${String(submittedAt.getMonth() + 1).padStart(2, '0')}-${String(submittedAt.getDate()).padStart(2, '0')}`;
          const index = keyToIndex[key];
          if (Number.isInteger(index)) {
            submitted[index] += 1;
          }
        }
      }
    });

    return { labels, started, submitted };
  }

  if (selectedView === 'Year') {
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const started = Array(12).fill(0);
    const submitted = Array(12).fill(0);

    filteredAttempts.forEach((attempt) => {
      if (attempt.started_at) {
        const startedAt = new Date(attempt.started_at);
        if (!Number.isNaN(startedAt.getTime())) {
          started[startedAt.getMonth()] += 1;
        }
      }

      if (attempt.submitted_at) {
        const submittedAt = new Date(attempt.submitted_at);
        if (!Number.isNaN(submittedAt.getTime())) {
          submitted[submittedAt.getMonth()] += 1;
        }
      }
    });

    return { labels, started, submitted };
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const labels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1));
  const started = Array(daysInMonth).fill(0);
  const submitted = Array(daysInMonth).fill(0);

  filteredAttempts.forEach((attempt) => {
    if (attempt.started_at) {
      const startedAt = new Date(attempt.started_at);
      if (
        !Number.isNaN(startedAt.getTime()) &&
        startedAt.getFullYear() === year &&
        startedAt.getMonth() === month
      ) {
        started[startedAt.getDate() - 1] += 1;
      }
    }

    if (attempt.submitted_at) {
      const submittedAt = new Date(attempt.submitted_at);
      if (
        !Number.isNaN(submittedAt.getTime()) &&
        submittedAt.getFullYear() === year &&
        submittedAt.getMonth() === month
      ) {
        submitted[submittedAt.getDate() - 1] += 1;
      }
    }
  });

  return { labels, started, submitted };
};

const loadAnalyticsBaseData = async () => {
  const { data: profileUsers, error: profileUsersError } = await getUsersFromProfiles();
  if (profileUsersError) throw new Error(profileUsersError);

  const users = (profileUsers || []).map((user) => ({
    admin_id: user.id,
    status: user.status,
  }));

  const [
    { data: attempts, error: attemptsError },
    { data: answers, error: answersError },
    { data: assessments, error: assessmentsError },
    { data: modules, error: modulesError },
    { data: moduleProgress, error: moduleProgressError },
  ] = await Promise.all([
    supabase
      .from('assessment_attempts')
      .select('id, user_id, assessment_id, started_at, submitted_at, created_at, status, score'),
    supabase
      .from('assessment_attempt_answers')
      .select('attempt_id, created_at, selected_option_id, answer_text'),
    supabase.from('assessments').select('id, module_id, type, title'),
    supabase.from('modules').select('id, module_no, title'),
    supabase
      .from('module_progress')
      .select('user_id, module_id, pre_test_completed_at, simulation_completed_at, post_test_completed_at'),
  ]);

  if (attemptsError) throw attemptsError;
  if (answersError) throw answersError;
  if (assessmentsError) throw assessmentsError;
  if (modulesError) throw modulesError;
  if (moduleProgressError) throw moduleProgressError;

  return {
    users: users || [],
    attempts: attempts || [],
    answers: answers || [],
    assessments: assessments || [],
    modules: modules || [],
    moduleProgress: moduleProgress || [],
  };
};

const buildOverviewRows = ({ attempts, assessmentsById, modulesById, userById, filters }) => {
  const startDate = getTimeframeStartDate(filters?.timeframe);
  const peopleFilter = filters?.people || 'All';
  const topicFilter = filters?.topic || 'All';

  const grouped = {};

  (attempts || []).forEach((attempt) => {
    const assessment = assessmentsById[attempt.assessment_id];
    if (!assessment) return;

    const moduleData = modulesById[assessment.module_id] || null;
    const userStatus = userById[attempt.user_id]?.status || 'Unknown';
    const attemptTimestamp = getAttemptTimestamp(attempt);

    if (!includesByPeople(userStatus, peopleFilter)) return;
    if (!includesByTopic(moduleData, topicFilter)) return;
    if (!includesByTimeframe(attemptTimestamp, startDate)) return;

    const key = `${attempt.user_id}-${assessment.module_id}`;
    if (!grouped[key]) {
      grouped[key] = {
        adminId: attempt.user_id,
        moduleId: assessment.module_id,
        moduleName: moduleData?.module_no ? `Module ${moduleData.module_no}` : (moduleData?.title || assessment.title || 'Unknown Module'),
        preAttempt: null,
        postAttempt: null,
        durationSecondsList: [],
        latestActivityAt: null,
      };
    }

    const item = grouped[key];
    const attemptTime = attemptTimestamp ? new Date(attemptTimestamp).getTime() : 0;

    if (isPreTestType(assessment.type)) {
      const previousPre = item.preAttempt
        ? new Date(getAttemptTimestamp(item.preAttempt) || 0).getTime()
        : 0;
      if (!item.preAttempt || attemptTime > previousPre) {
        item.preAttempt = attempt;
      }
    }

    if (isPostTestType(assessment.type)) {
      const previousPost = item.postAttempt
        ? new Date(getAttemptTimestamp(item.postAttempt) || 0).getTime()
        : 0;
      if (!item.postAttempt || attemptTime > previousPost) {
        item.postAttempt = attempt;
      }
    }

    if (attempt.started_at && attempt.submitted_at) {
      const startedAt = new Date(attempt.started_at).getTime();
      const submittedAt = new Date(attempt.submitted_at).getTime();
      const diffSeconds = Math.max(0, Math.floor((submittedAt - startedAt) / 1000));

      if (Number.isFinite(diffSeconds) && diffSeconds > 0 && diffSeconds <= MAX_SESSION_DURATION_SECONDS) {
        item.durationSecondsList.push(diffSeconds);
      }
    }

    const previousLatest = item.latestActivityAt ? new Date(item.latestActivityAt).getTime() : 0;
    if (attemptTime > previousLatest) {
      item.latestActivityAt = attemptTimestamp;
    }
  });

  return Object.values(grouped).map((row) => {
    const preTestScore = toNumber(row.preAttempt?.score, 0);
    const postTestScore = toNumber(row.postAttempt?.score, 0);
    const durationSeconds =
      row.durationSecondsList.length > 0
        ? row.durationSecondsList.reduce((sum, value) => sum + value, 0) /
          row.durationSecondsList.length
        : 0;

    const normalizedGain =
      row.preAttempt && row.postAttempt
        ? calculateNormalizedGain(preTestScore, postTestScore)
        : 0;

    return {
      adminId: row.adminId,
      moduleId: row.moduleId,
      moduleName: row.moduleName,
      preTestScore,
      postTestScore,
      completionRate: 0,
      simulationScore: 0,
      durationSeconds: toNumber(durationSeconds, 0),
      errorCount: 0,
      hintCount: 0,
      normalizedGain,
      rawGain: round(postTestScore - preTestScore, 2),
      riskLevel: classifyKnowledgeRisk({
        normalizedGain,
        completionRate: 100,
        simulationScore: 100,
      }),
      latestActivityAt: row.latestActivityAt,
    };
  });
};

export const calculateNormalizedGain = (preTestScore, postTestScore) => {
  const pre = toNumber(preTestScore, 0);
  const post = toNumber(postTestScore, 0);

  if (pre >= 100) return 0;
  return round((post - pre) / (100 - pre), 4);
};

export const classifyKnowledgeRisk = ({
  normalizedGain,
  completionRate,
  simulationScore,
}) => {
  const gain = toNumber(normalizedGain, 0);
  const completion = toNumber(completionRate, 0);
  const simulation = toNumber(simulationScore, 0);

  if (gain < 0.2 || completion < 60 || simulation < 55) {
    return 'high';
  }

  if (gain < 0.4 || completion < 80 || simulation < 70) {
    return 'moderate';
  }

  return 'low';
};

export const getKnowledgeGainOverview = async () => {
  try {
    const { users, attempts, assessments, modules } = await loadAnalyticsBaseData();

    const userById = users.reduce((accumulator, row) => {
      accumulator[row.admin_id] = row;
      return accumulator;
    }, {});

    const assessmentsById = assessments.reduce((accumulator, row) => {
      accumulator[row.id] = row;
      return accumulator;
    }, {});

    const modulesById = modules.reduce((accumulator, row) => {
      accumulator[row.id] = row;
      return accumulator;
    }, {});

    const rows = buildOverviewRows({
      attempts,
      assessmentsById,
      modulesById,
      userById,
      filters: { timeframe: 'All-time', people: 'All', topic: 'All' },
    });

    return { data: rows, error: null };
  } catch (error) {
    console.error('Error fetching knowledge gain overview:', error);
    return { data: [], error: error.message };
  }
};

export const getAnalyticsDashboardStats = async (filters = {}) => {
  const remote = await tryAnalyticsApi('/api/knowledge-analytics/dashboard-stats', filters);
  if (remote?.data) {
    return { data: remote.data, error: remote.error || null };
  }

  try {
    const startDate = getTimeframeStartDate(filters.timeframe);
    const peopleFilter = filters.people || 'All';
    const topicFilter = filters.topic || 'All';

    const { users, attempts, answers, assessments, modules } = await loadAnalyticsBaseData();

    const userById = users.reduce((accumulator, row) => {
      accumulator[row.admin_id] = row;
      return accumulator;
    }, {});

    const assessmentsById = assessments.reduce((accumulator, row) => {
      accumulator[row.id] = row;
      return accumulator;
    }, {});

    const modulesById = modules.reduce((accumulator, row) => {
      accumulator[row.id] = row;
      return accumulator;
    }, {});

    const hasActivityFilters = Boolean(startDate) || (topicFilter && topicFilter !== 'All');

    const filteredAttempts = attempts.filter((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      if (!assessment) return false;

      const moduleData = modulesById[assessment.module_id] || null;
      const userStatus = userById[attempt.user_id]?.status || 'Unknown';
      const attemptTimestamp = getAttemptTimestamp(attempt);

      if (!includesByPeople(userStatus, peopleFilter)) return false;
      if (!includesByTopic(moduleData, topicFilter)) return false;
      if (!includesByTimeframe(attemptTimestamp, startDate)) return false;

      return true;
    });

    const filteredAttemptIds = new Set(filteredAttempts.map((attempt) => attempt.id));
    const filteredUserIds = new Set(filteredAttempts.map((attempt) => attempt.user_id));

    const usersByPeople = users.filter((row) => includesByPeople(row.status, peopleFilter));
    const usersScope = hasActivityFilters
      ? usersByPeople.filter((row) => filteredUserIds.has(row.admin_id))
      : usersByPeople;

    const totalUsers = usersScope.length;
    const activeUsers = usersScope.filter(
      (user) => String(user.status || '').toLowerCase() === 'active',
    ).length;

    const questionsAnswered = answers.filter((answer) => {
      if (!filteredAttemptIds.has(answer.attempt_id)) return false;

      if (!includesByTimeframe(answer.created_at, startDate)) return false;

      return Boolean(answer.selected_option_id) || Boolean(String(answer.answer_text || '').trim());
    }).length;

    const overview = buildOverviewRows({
      attempts: filteredAttempts,
      assessmentsById,
      modulesById,
      userById,
      filters,
    });

    const validSessionDurations = extractValidSessionDurations(filteredAttempts);

    const avgDurationSeconds =
      validSessionDurations.length > 0
        ? validSessionDurations.reduce((sum, value) => sum + value, 0) / validSessionDurations.length
        : 0;

    const startingKnowledge =
      overview.length > 0
        ? round(
            overview.reduce((sum, row) => sum + row.preTestScore, 0) / overview.length,
            2,
          )
        : 0;

    const currentKnowledge =
      overview.length > 0
        ? round(
            overview.reduce((sum, row) => sum + row.postTestScore, 0) / overview.length,
            2,
          )
        : 0;

    const knowledgeGainPercent =
      startingKnowledge >= 100
        ? 0
        : round(((currentKnowledge - startingKnowledge) / (100 - startingKnowledge)) * 100, 2);

    return {
      data: {
        activeUsers,
        totalUsers,
        questionsAnswered,
        avgSessionLength: formatDuration(avgDurationSeconds),
        startingKnowledge,
        currentKnowledge,
        knowledgeGainPercent,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error building analytics dashboard stats:', error);
    return { data: DEFAULT_STATS, error: error.message };
  }
};

export const getKnowledgeGainByModule = async () => {
  const { data, error } = await getKnowledgeGainOverview();

  if (error) {
    return { data: [], error };
  }

  const grouped = data.reduce((accumulator, row) => {
    const key = row.moduleId;
    if (!accumulator[key]) {
      accumulator[key] = {
        moduleId: row.moduleId,
        moduleName: row.moduleName,
        learners: 0,
        avgPreTest: 0,
        avgPostTest: 0,
        avgCompletion: 0,
        avgSimulation: 0,
        avgNormalizedGain: 0,
      };
    }

    const current = accumulator[key];
    current.learners += 1;
    current.avgPreTest += row.preTestScore;
    current.avgPostTest += row.postTestScore;
    current.avgCompletion += row.completionRate;
    current.avgSimulation += row.simulationScore;
    current.avgNormalizedGain += row.normalizedGain;

    return accumulator;
  }, {});

  const modules = Object.values(grouped).map((moduleRow) => ({
    ...moduleRow,
    avgPreTest: round(moduleRow.avgPreTest / moduleRow.learners, 2),
    avgPostTest: round(moduleRow.avgPostTest / moduleRow.learners, 2),
    avgCompletion: round(moduleRow.avgCompletion / moduleRow.learners, 2),
    avgSimulation: round(moduleRow.avgSimulation / moduleRow.learners, 2),
    avgNormalizedGain: round(moduleRow.avgNormalizedGain / moduleRow.learners, 4),
  }));

  return { data: modules, error: null };
};

export const getAnalyticsFilterOptions = async () => {
  const remote = await tryAnalyticsApi('/api/knowledge-analytics/filter-options');
  if (remote?.data) {
    return { data: remote.data, error: remote.error || null };
  }

  try {
    const { data, error } = await supabase
      .from('modules')
      .select('title')
      .order('module_no', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const topics = [
      'All',
      ...Array.from(
        new Set(
          (data || [])
            .map((row) => String(row.title || '').trim())
            .filter(Boolean),
        ),
      ),
    ];

    return { data: { topics }, error: null };
  } catch (error) {
    console.error('Error fetching analytics filter options:', error);
    return { data: DEFAULT_FILTER_OPTIONS, error: error.message };
  }
};

export const getAnalyticsChartsData = async (filters = {}) => {
  const remote = await tryAnalyticsApi('/api/knowledge-analytics/charts', filters);
  if (remote?.data) {
    return { data: remote.data, error: remote.error || null };
  }

  try {
    const startDate = getTimeframeStartDate(filters.timeframe);
    const peopleFilter = filters.people || 'All';
    const topicFilter = filters.topic || 'All';

    const { users, attempts, assessments, modules, moduleProgress } = await loadAnalyticsBaseData();

    const userById = users.reduce((accumulator, row) => {
      accumulator[row.admin_id] = row;
      return accumulator;
    }, {});

    const assessmentsById = assessments.reduce((accumulator, row) => {
      accumulator[row.id] = row;
      return accumulator;
    }, {});

    const modulesById = modules.reduce((accumulator, row) => {
      accumulator[row.id] = row;
      return accumulator;
    }, {});

    const filteredAttempts = (attempts || []).filter((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      if (!assessment) return false;

      const moduleData = modulesById[assessment.module_id] || null;
      const timestamp = getAttemptTimestamp(attempt);
      const userStatus = userById[attempt.user_id]?.status || 'Unknown';

      if (!includesByPeople(userStatus, peopleFilter)) return false;
      if (!includesByTopic(moduleData, topicFilter)) return false;
      if (!includesByTimeframe(timestamp, startDate)) return false;

      return true;
    });

    const dayCount = filters.timeframe === 'Last 7 days' ? 7 : 30;
    const dayBuckets = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (dayCount - 1 - index));
      return date;
    });

    const toDayKey = (dateInput) => {
      const date = new Date(dateInput);
      if (Number.isNaN(date.getTime())) return null;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const activeUsersByDay = dayBuckets.reduce((accumulator, date) => {
      accumulator[toDayKey(date)] = new Set();
      return accumulator;
    }, {});

    filteredAttempts.forEach((attempt) => {
      const timestamp = getAttemptTimestamp(attempt);
      if (!timestamp) return;

      const dayKey = toDayKey(timestamp);
      if (!dayKey || !activeUsersByDay[dayKey]) return;
      activeUsersByDay[dayKey].add(attempt.user_id);
    });

    const userOverview = {
      labels: dayBuckets.map((date) =>
        date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
      ),
      values: dayBuckets.map((date) => {
        const key = toDayKey(date);
        return activeUsersByDay[key]?.size || 0;
      }),
    };

    const activityTrends = buildActivityTrends(filteredAttempts, filters.activityTrendsView);

    const learningByModuleAccumulator = {};

    filteredAttempts.forEach((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      const moduleData = modulesById[assessment?.module_id];
      if (!assessment || !moduleData) return;

      if (!learningByModuleAccumulator[moduleData.id]) {
        learningByModuleAccumulator[moduleData.id] = {
          module_no: toNumber(moduleData.module_no, Number.MAX_SAFE_INTEGER),
          title: moduleData.title,
          name: moduleData.title,
          preTotal: 0,
          preCount: 0,
          postTotal: 0,
          postCount: 0,
          scoreTotal: 0,
          scoreCount: 0,
          attempts: 0,
        };
      }

      const row = learningByModuleAccumulator[moduleData.id];
      const score = toNumber(attempt.score, 0);
      const type = assessment.type;

      if (isPreTestType(type)) {
        row.preTotal += score;
        row.preCount += 1;
      }

      if (isPostTestType(type)) {
        row.postTotal += score;
        row.postCount += 1;
      }

      row.scoreTotal += score;
      row.scoreCount += 1;
      row.attempts += 1;
    });

    const sortedModules = Object.values(learningByModuleAccumulator).sort((a, b) => {
      const aNo = toNumber(a.module_no, Number.MAX_SAFE_INTEGER);
      const bNo = toNumber(b.module_no, Number.MAX_SAFE_INTEGER);
      if (aNo !== bNo) return aNo - bNo;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });

    const learningByModule = {
      labels: sortedModules.map((row) => (row.module_no ? `Module ${row.module_no}` : row.title || row.name)),
      preTest: sortedModules.map((row) => (row.preCount > 0 ? round(row.preTotal / row.preCount, 2) : 0)),
      postTest: sortedModules.map((row) => (row.postCount > 0 ? round(row.postTotal / row.postCount, 2) : 0)),
    };

    const modulesForCompletion = (modules || [])
      .filter((moduleRow) => includesByTopic(moduleRow, topicFilter))
      .sort((a, b) => {
        const aNo = toNumber(a.module_no, Number.MAX_SAFE_INTEGER);
        const bNo = toNumber(b.module_no, Number.MAX_SAFE_INTEGER);
        if (aNo !== bNo) return aNo - bNo;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });

    const filteredModuleProgress = (moduleProgress || []).filter((row) => {
      const moduleData = modulesById[row.module_id] || null;
      return includesByTopic(moduleData, topicFilter);
    });

    const completionAccumulator = modulesForCompletion.reduce((accumulator, moduleRow) => {
      accumulator[moduleRow.id] = {
        completionSum: 0,
        simulationDone: 0,
        count: 0,
      };
      return accumulator;
    }, {});

    filteredModuleProgress.forEach((row) => {
      const bucket = completionAccumulator[row.module_id];
      if (!bucket) return;

      const stepsDone = [
        Boolean(row.pre_test_completed_at),
        Boolean(row.simulation_completed_at),
        Boolean(row.post_test_completed_at),
      ].filter(Boolean).length;

      bucket.completionSum += round((stepsDone / 3) * 100, 2);
      bucket.simulationDone += Number(Boolean(row.simulation_completed_at));
      bucket.count += 1;
    });

    const completionByModule = {
      labels: modulesForCompletion.map((row) => (row.module_no ? `Module ${row.module_no}` : row.title)),
      completionRate: modulesForCompletion.map((row) => {
        const bucket = completionAccumulator[row.id];
        if (!bucket || bucket.count === 0) return 0;
        return round(bucket.completionSum / bucket.count, 2);
      }),
      simulationCompletion: modulesForCompletion.map((row) => {
        const bucket = completionAccumulator[row.id];
        if (!bucket || bucket.count === 0) return 0;
        return round((bucket.simulationDone / bucket.count) * 100, 2);
      }),
    };

    const modulesForAttempts = (modules || [])
      .filter((moduleRow) => includesByTopic(moduleRow, topicFilter))
      .sort((a, b) => {
        const aNo = toNumber(a.module_no, Number.MAX_SAFE_INTEGER);
        const bNo = toNumber(b.module_no, Number.MAX_SAFE_INTEGER);
        if (aNo !== bNo) return aNo - bNo;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });

    const attemptsAccumulator = modulesForAttempts.reduce((accumulator, moduleRow) => {
      accumulator[moduleRow.id] = 0;
      return accumulator;
    }, {});

    filteredAttempts.forEach((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      if (!assessment?.module_id) return;
      if (typeof attemptsAccumulator[assessment.module_id] !== 'number') return;
      attemptsAccumulator[assessment.module_id] += 1;
    });

    const attemptsByModule = {
      labels: modulesForAttempts.map((row) => (row.module_no ? `Module ${row.module_no}` : row.title)),
      attempts: modulesForAttempts.map((row) => attemptsAccumulator[row.id] || 0),
    };

    const overviewRows = buildOverviewRows({
      attempts: filteredAttempts,
      assessmentsById,
      modulesById,
      userById,
      filters,
    });

    const trendAccumulator = overviewRows.reduce((accumulator, row) => {
      if (!row.latestActivityAt) return accumulator;

      const date = new Date(row.latestActivityAt);
      if (Number.isNaN(date.getTime())) return accumulator;

      if (startDate && date < startDate) return accumulator;

      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (!accumulator[dateKey]) {
        accumulator[dateKey] = { gainSum: 0, count: 0 };
      }

      accumulator[dateKey].gainSum += toNumber(row.normalizedGain, 0) * 100;
      accumulator[dateKey].count += 1;
      return accumulator;
    }, {});

    const sortedTrendKeys = Object.keys(trendAccumulator).sort((a, b) => a.localeCompare(b));
    const knowledgeGainTrend = {
      labels: sortedTrendKeys.map((key) => {
        const date = new Date(`${key}T00:00:00`);
        return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      }),
      values: sortedTrendKeys.map((key) => {
        const bucket = trendAccumulator[key];
        if (!bucket?.count) return 0;
        return round(bucket.gainSum / bucket.count, 2);
      }),
    };

    const riskDistributionCounts = overviewRows.reduce(
      (accumulator, row) => {
        const level = classifyKnowledgeRisk({
          normalizedGain: row.normalizedGain,
          completionRate: row.completionRate,
          simulationScore: row.simulationScore,
        });

        if (level === 'high') accumulator.high += 1;
        else if (level === 'moderate') accumulator.moderate += 1;
        else accumulator.low += 1;

        return accumulator;
      },
      { high: 0, moderate: 0, low: 0 },
    );

    const riskDistribution = {
      labels: ['High', 'Moderate', 'Low'],
      values: [
        riskDistributionCounts.high,
        riskDistributionCounts.moderate,
        riskDistributionCounts.low,
      ],
    };

    return {
      data: {
        userOverview,
        activityTrends,
        learningByModule,
        completionByModule,
        attemptsByModule,
        knowledgeGainTrend,
        riskDistribution,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching analytics charts data:', error);
    return { data: DEFAULT_CHARTS_DATA, error: error.message };
  }
};
