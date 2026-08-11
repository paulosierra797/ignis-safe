import { supabase } from './supabaseClient';
import { getUsersFromProfiles } from './usersService';
import { getAccountStatus } from './progressService';
import { dedupeRequest } from './requestDedupe';

const ANALYTICS_API_URL = String(import.meta.env.VITE_ANALYTICS_API_URL || '').replace(/\/+$/, '');
const MAX_SESSION_DURATION_SECONDS = Number(import.meta.env.VITE_MAX_SESSION_DURATION_SECONDS || 7200);
const MAX_APP_SESSION_DURATION_SECONDS = Number(
  import.meta.env.VITE_MAX_APP_SESSION_DURATION_SECONDS || 86400,
);

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

const ANALYTICS_CACHE_TTL_MS = 30 * 1000;
let analyticsBaseDataCache = null;
let analyticsBaseDataCacheExpiresAt = 0;

const clearAnalyticsBaseDataCache = () => {
  analyticsBaseDataCache = null;
  analyticsBaseDataCacheExpiresAt = 0;
};

if (typeof window !== 'undefined') {
  window.addEventListener('ignis-safe:data-changed', clearAnalyticsBaseDataCache);
}

const DEFAULT_CHARTS_DATA = {
  userOverview: { labels: [], values: [] },
  activityTrends: { labels: [], started: [], submitted: [] },
  learningByModule: { labels: [], preTest: [], postTest: [] },
  completionByModule: { labels: [], completionRate: [], simulationCompletion: [] },
  attemptsByModule: { labels: [], attempts: [] },
  attemptsByYear: { availableYears: [], byYear: {} },
  knowledgeGainTrend: { labels: [], values: [] },
  riskDistribution: { labels: ['High', 'Moderate', 'Low'], values: [0, 0, 0] },
};

const callAnalyticsApi = async (endpoint, payload = null) => {
  if (!ANALYTICS_API_URL) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Please sign in as an administrator to view analytics.');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

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

// Retakes can leave more than one attempt row per (user, assessment); only the most
// recent one should count toward Questions Answered so duplicate attempts don't inflate it.
const getLatestAttemptIdsPerAssessment = (attemptList) => {
  const latestByKey = {};

  (attemptList || []).forEach((attempt) => {
    const key = `${attempt.user_id}-${attempt.assessment_id}`;
    const time = new Date(getAttemptTimestamp(attempt) || 0).getTime();
    const existing = latestByKey[key];
    const existingTime = existing ? new Date(getAttemptTimestamp(existing) || 0).getTime() : -1;

    if (!existing || time > existingTime) {
      latestByKey[key] = attempt;
    }
  });

  return new Set(Object.values(latestByKey).map((attempt) => attempt.id));
};

const getModuleProgressTimestamp = (row) => {
  const timestamps = [row?.pre_test_completed_at, row?.simulation_completed_at, row?.post_test_completed_at]
    .map((value) => (value ? new Date(value).getTime() : null))
    .filter((value) => Number.isFinite(value));

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
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

const formatModuleLabel = (moduleNo) => {
  const value = String(moduleNo ?? '').trim();
  return value ? `Module ${value}` : 'Module -';
};

const getModuleDisplayTitle = (moduleRow) => {
  const title = String(moduleRow?.title || '').trim();
  return title || formatModuleLabel(moduleRow?.module_no);
};

const normalizeSimulationSessionRow = (row = {}) => ({
  admin_id: row.admin_id || row.user_id || row.profile_id || null,
  module_id: row.module_id || null,
  completion_rate: row.completion_rate ?? null,
  simulation_score: row.simulation_score ?? row.score ?? null,
  duration_seconds: row.duration_seconds ?? row.duration ?? row.seconds ?? null,
  error_count: row.error_count ?? row.errors ?? 0,
  hint_count: row.hint_count ?? row.hints ?? 0,
  completed_at: row.completed_at || row.submitted_at || row.created_at || null,
});

const normalizeAppSessionRow = (row = {}) => ({
  session_id: row.session_id || row.id || null,
  admin_id: row.admin_id || row.user_id || null,
  started_at: row.started_at || row.created_at || null,
  ended_at: row.ended_at || row.closed_at || null,
  duration_seconds: row.duration_seconds ?? null,
  closure_reason: row.closure_reason || row.reason || null,
  metadata: row.metadata || {},
});

const fetchSimulationSessions = async () => {
  const tableNames = ['simulation_attempts', 'training_simulation_sessions'];

  let lastError = null;
  for (const tableName of tableNames) {
    const { data, error } = await supabase.from(tableName).select('*');
    if (!error) {
      return (data || []).map(normalizeSimulationSessionRow);
    }

    lastError = error;
    if (error?.code !== 'PGRST205' && error?.code !== '42P01') {
      break;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
};

const fetchAppSessions = async () => {
  const { data, error } = await supabase.from('app_sessions').select('*');

  if (!error) {
    return (data || []).map(normalizeAppSessionRow);
  }

  if (error?.code === 'PGRST205' || error?.code === '42P01') {
    return [];
  }

  throw error;
};

const dedupeAppSessions = (sessions) => {
  const seen = new Set();
  return (sessions || []).filter((session) => {
    const key = `${session.admin_id}|${session.started_at}|${session.ended_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractValidAppSessionDurations = (sessions) => {
  return dedupeAppSessions(sessions).reduce((accumulator, session) => {
    const storedDuration = toNumber(session.duration_seconds, 0);
    if (storedDuration > 0 && storedDuration <= MAX_APP_SESSION_DURATION_SECONDS) {
      accumulator.push(Math.floor(storedDuration));
      return accumulator;
    }

    const startedAt = new Date(session.started_at).getTime();
    const endedAt = new Date(session.ended_at || session.completed_at || session.updated_at).getTime();
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return accumulator;

    const diffSeconds = Math.floor((endedAt - startedAt) / 1000);
    if (diffSeconds <= 0) return accumulator;
    if (diffSeconds > MAX_APP_SESSION_DURATION_SECONDS) return accumulator;

    accumulator.push(diffSeconds);
    return accumulator;
  }, []);
};

const buildDailyActivityTrend = (filteredAttempts, dayCount, now, labelOptions) => {
  const labels = [];
  const started = Array(dayCount).fill(0);
  const submitted = Array(dayCount).fill(0);

  const dayKeys = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (dayCount - 1 - index));
    labels.push(date.toLocaleDateString('en-US', labelOptions));

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
};

const buildActivityTrends = (filteredAttempts, view = 'Month') => {
  const selectedView = String(view || 'Month');
  const now = new Date();

  if (selectedView === 'Week') {
    return buildDailyActivityTrend(filteredAttempts, 7, now, { weekday: 'short' });
  }

  if (selectedView === 'Days30') {
    return buildDailyActivityTrend(filteredAttempts, 30, now, { month: 'short', day: 'numeric' });
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

const fetchAnalyticsBaseData = async () => dedupeRequest('loadAnalyticsBaseData', async () => {
  const { data: profileUsers, error: profileUsersError } = await getUsersFromProfiles();
  if (profileUsersError) throw new Error(profileUsersError);

  const profilesById = (profileUsers || []).reduce((accumulator, user) => {
    accumulator[user.id] = user;
    return accumulator;
  }, {});

  // Excludes Admin/Personnel accounts (see getUsersFromProfiles), so this is the same
  // eligible-learner population shown on Admin Dashboard > Users. Every other table is
  // scoped to this same set of ids so every Training Performance Overview metric shares
  // one dataset instead of silently including admin/personnel or orphaned records.
  const mobileUserIds = new Set(Object.keys(profilesById));

  const [
    { data: attempts, error: attemptsError },
    { data: answers, error: answersError },
    { data: assessments, error: assessmentsError },
    { data: modules, error: modulesError },
    { data: moduleProgress, error: moduleProgressError },
    appSessions,
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
    fetchAppSessions(),
  ]);

  if (attemptsError) throw attemptsError;
  if (answersError) throw answersError;
  if (assessmentsError) throw assessmentsError;
  if (modulesError) throw modulesError;
  if (moduleProgressError) throw moduleProgressError;

  const simulationSessions = await fetchSimulationSessions();

  const eligibleAttempts = (attempts || []).filter((attempt) => mobileUserIds.has(attempt.user_id));
  const eligibleAttemptIds = new Set(eligibleAttempts.map((attempt) => attempt.id));
  const eligibleModuleProgress = (moduleProgress || []).filter((row) => mobileUserIds.has(row.user_id));
  const eligibleSimulationSessions = (simulationSessions || []).filter((row) => mobileUserIds.has(row.admin_id));
  const eligibleAppSessions = (appSessions || []).filter((row) => mobileUserIds.has(row.admin_id));

  // Real per-learner "Active"/"Inactive" status derived from actual activity records
  // (mirrors getAccountStatus in progressService.js, the same rule Admin Dashboard > Users
  // uses), instead of a static placeholder, so the Users filter reflects true activity.
  const lastActivityByUser = {};
  const noteActivity = (userId, timestamp) => {
    if (!userId || !timestamp) return;
    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return;
    if (!lastActivityByUser[userId] || time > lastActivityByUser[userId]) {
      lastActivityByUser[userId] = time;
    }
  };

  eligibleAttempts.forEach((attempt) => noteActivity(attempt.user_id, getAttemptTimestamp(attempt)));
  eligibleModuleProgress.forEach((row) => {
    noteActivity(row.user_id, row.pre_test_completed_at);
    noteActivity(row.user_id, row.simulation_completed_at);
    noteActivity(row.user_id, row.post_test_completed_at);
  });
  eligibleSimulationSessions.forEach((row) => noteActivity(row.admin_id, row.completed_at));
  eligibleAppSessions.forEach((row) => noteActivity(row.admin_id, row.ended_at || row.started_at));

  const users = Array.from(mobileUserIds).map((adminId) => {
    const profile = profilesById[adminId] || {};
    const lastActivityAt = lastActivityByUser[adminId]
      ? new Date(lastActivityByUser[adminId]).toISOString()
      : profile.updated_at || profile.created_at || null;

    return {
      admin_id: adminId,
      status: getAccountStatus(lastActivityAt),
    };
  });

  return {
    users,
    attempts: eligibleAttempts,
    answers: (answers || []).filter((answer) => eligibleAttemptIds.has(answer.attempt_id)),
    assessments: assessments || [],
    modules: modules || [],
    moduleProgress: eligibleModuleProgress,
    simulationSessions: eligibleSimulationSessions,
    appSessions: eligibleAppSessions,
  };
});

const loadAnalyticsBaseData = async () => {
  if (analyticsBaseDataCache && Date.now() < analyticsBaseDataCacheExpiresAt) {
    return analyticsBaseDataCache;
  }

  const data = await fetchAnalyticsBaseData();
  analyticsBaseDataCache = data;
  analyticsBaseDataCacheExpiresAt = Date.now() + ANALYTICS_CACHE_TTL_MS;
  return data;
};

const buildOverviewRows = ({ attempts, assessmentsById, modulesById, userById, filters, simulationSessions = [] }) => {
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
        moduleName: moduleData?.title || assessment.title || 'Unknown Module',
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

  // pick latest simulation session per admin/module, respecting filters and timeframe
  const latestSimByKey = (simulationSessions || []).reduce((acc, sim) => {
    const adminId = sim.admin_id;
    const moduleId = sim.module_id;
    if (!adminId || !moduleId) return acc;

    const moduleData = modulesById[moduleId] || null;
    const userStatus = userById[adminId]?.status || 'Unknown';
    const completedAt = sim.completed_at || sim.created_at || null;

    if (!includesByPeople(userStatus, filters?.people || 'All')) return acc;
    if (!includesByTopic(moduleData, filters?.topic || 'All')) return acc;
    if (!includesByTimeframe(completedAt, getTimeframeStartDate(filters?.timeframe || 'All-time'))) return acc;

    const key = `${adminId}-${moduleId}`;
    const prev = acc[key];
    const prevTs = prev && prev.completed_at ? new Date(prev.completed_at).getTime() : 0;
    const thisTs = completedAt ? new Date(completedAt).getTime() : 0;
    if (!prev || thisTs > prevTs) acc[key] = sim;
    return acc;
  }, {});

  return Object.values(grouped).map((row) => {
    const preTestScore = toNumber(row.preAttempt?.score, 0);
    const postTestScore = toNumber(row.postAttempt?.score, 0);

    let preDuration = 0;
    let postDuration = 0;

    if (row.preAttempt && row.preAttempt.started_at && row.preAttempt.submitted_at) {
      const started = new Date(row.preAttempt.started_at).getTime();
      const submitted = new Date(row.preAttempt.submitted_at).getTime();
      if (Number.isFinite(started) && Number.isFinite(submitted)) {
        const diff = Math.max(0, Math.floor((submitted - started) / 1000));
        if (diff > 0 && diff <= MAX_SESSION_DURATION_SECONDS) preDuration = diff;
      }
    }

    if (row.postAttempt && row.postAttempt.started_at && row.postAttempt.submitted_at) {
      const started = new Date(row.postAttempt.started_at).getTime();
      const submitted = new Date(row.postAttempt.submitted_at).getTime();
      if (Number.isFinite(started) && Number.isFinite(submitted)) {
        const diff = Math.max(0, Math.floor((submitted - started) / 1000));
        if (diff > 0 && diff <= MAX_SESSION_DURATION_SECONDS) postDuration = diff;
      }
    }

    const sim = latestSimByKey[`${row.adminId}-${row.moduleId}`];
    let simDuration = 0;
    let simulationScore = 0;
    let completionRate = 0;
    if (sim) {
      const d = toNumber(sim.duration_seconds, 0);
      if (d > 0 && d <= MAX_SESSION_DURATION_SECONDS) simDuration = Math.floor(d);
      simulationScore = toNumber(sim.simulation_score, 0);
      completionRate = toNumber(sim.completion_rate, 0);
    }

    const totalDuration = preDuration + simDuration + postDuration;

    const normalizedGain = row.preAttempt && row.postAttempt ? calculateNormalizedGain(preTestScore, postTestScore) : 0;

    return {
      adminId: row.adminId,
      moduleId: row.moduleId,
      moduleName: row.moduleName,
      preTestScore,
      postTestScore,
      completionRate,
      simulationScore,
      durationSeconds: toNumber(totalDuration, 0),
      preDurationSeconds: preDuration,
      postDurationSeconds: postDuration,
      simulationDurationSeconds: simDuration,
      errorCount: 0,
      hintCount: 0,
      normalizedGain,
      rawGain: round(postTestScore - preTestScore, 2),
      riskLevel: classifyKnowledgeRisk({ normalizedGain, completionRate, simulationScore }),
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
    const { users, attempts, assessments, modules, simulationSessions } = await loadAnalyticsBaseData();

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
      simulationSessions,
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

    const { users, attempts, answers, assessments, modules, simulationSessions, appSessions } = await loadAnalyticsBaseData();

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

    const filteredUserIds = new Set(filteredAttempts.map((attempt) => attempt.user_id));
    const dedupedAttemptIds = getLatestAttemptIdsPerAssessment(filteredAttempts);

    // `users` already excludes Admin/Personnel accounts (see getUsersFromProfiles in
    // usersService.js), so "Active Learners" here reflects mobile app learners only.
    // A learner counts as active when they have qualifying activity within the
    // selected timeframe/topic filters, not a borrowed/hardcoded status flag.
    const usersByPeople = users.filter((row) => includesByPeople(row.status, peopleFilter));

    const totalUsers = usersByPeople.length;
    const activeUsers = usersByPeople.filter((user) => filteredUserIds.has(user.admin_id)).length;

    const questionsAnswered = answers.filter((answer) => {
      if (!dedupedAttemptIds.has(answer.attempt_id)) return false;

      if (!includesByTimeframe(answer.created_at, startDate)) return false;

      return Boolean(answer.selected_option_id) || Boolean(String(answer.answer_text || '').trim());
    }).length;

    const overview = buildOverviewRows({
      attempts: filteredAttempts,
      assessmentsById,
      modulesById,
      userById,
      filters,
      simulationSessions,
    });

    const filteredAppSessions = (appSessions || []).filter((session) => {
      const userStatus = userById[session.admin_id]?.status || 'Unknown';
      const sessionTimestamp = session.ended_at || session.started_at || null;

      if (!includesByPeople(userStatus, peopleFilter)) return false;
      if (!includesByTimeframe(sessionTimestamp, startDate)) return false;

      return true;
    });

    const appSessionTotals = extractValidAppSessionDurations(filteredAppSessions);
    // Fall back to the already-deduped per-user/module durations from buildOverviewRows
    // (one row per learner per module) instead of raw attempts, so duplicate/retake
    // attempt rows can't inflate the average.
    const legacySessionTotals = appSessionTotals.length > 0
      ? []
      : overview.map((row) => row.durationSeconds).filter((value) => value > 0);
    const sessionTotals = appSessionTotals.length > 0 ? appSessionTotals : legacySessionTotals;
    const avgDurationSeconds = sessionTotals.length > 0
      ? sessionTotals.reduce((sum, value) => sum + value, 0) / sessionTotals.length
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
    const { modules } = await loadAnalyticsBaseData();

    const topics = [
      'All',
      ...Array.from(
        new Set(
          (modules || [])
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

    const { users, attempts, assessments, modules, moduleProgress, simulationSessions } = await loadAnalyticsBaseData();

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

    const toDayKey = (dateInput) => {
      const date = new Date(dateInput);
      if (Number.isNaN(date.getTime())) return null;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const overviewRange = filters.userOverviewRange || 'Month';
    let userOverview;

    if (overviewRange === 'Year') {
      const currentYear = new Date().getFullYear();
      const monthBuckets = Array.from({ length: 12 }, (_, monthIndex) => {
        const date = new Date(currentYear, monthIndex, 1);
        return {
          key: `${currentYear}-${String(monthIndex + 1).padStart(2, '0')}`,
          label: date.toLocaleDateString('en-US', { month: 'short' }),
        };
      });
      const activeUsersByMonth = monthBuckets.reduce((accumulator, bucket) => {
        accumulator[bucket.key] = new Set();
        return accumulator;
      }, {});

      filteredAttempts.forEach((attempt) => {
        const timestamp = getAttemptTimestamp(attempt);
        if (!timestamp) return;

        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime()) || date.getFullYear() !== currentYear) return;
        const monthKey = `${currentYear}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        activeUsersByMonth[monthKey]?.add(attempt.user_id);
      });

      userOverview = {
        labels: monthBuckets.map((bucket) => bucket.label),
        values: monthBuckets.map((bucket) => activeUsersByMonth[bucket.key]?.size || 0),
      };
    } else {
      const dayCount = overviewRange === 'Week' ? 7 : 30;
      const dayBuckets = Array.from({ length: dayCount }, (_, index) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (dayCount - 1 - index));
        return date;
      });
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

      userOverview = {
        labels: dayBuckets.map((date) =>
          date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        ),
        values: dayBuckets.map((date) => activeUsersByDay[toDayKey(date)]?.size || 0),
      };
    }

    const activityTrends = buildActivityTrends(filteredAttempts, filters.activityTrendsView);

    const learningByModuleAccumulator = {};

    filteredAttempts.forEach((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      const moduleData = modulesById[assessment?.module_id];
      if (!assessment || !moduleData) return;

      if (!learningByModuleAccumulator[moduleData.id]) {
        learningByModuleAccumulator[moduleData.id] = {
          moduleNo: moduleData.module_no,
          moduleTitle: getModuleDisplayTitle(moduleData),
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

    const sortedModules = Object.values(learningByModuleAccumulator).sort(
      (a, b) => toNumber(a.moduleNo, Number.MAX_SAFE_INTEGER) - toNumber(b.moduleNo, Number.MAX_SAFE_INTEGER),
    );

    const learningByModule = {
      labels: sortedModules.map((row) => row.moduleTitle),
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
      const userStatus = userById[row.user_id]?.status || 'Unknown';

      if (!includesByTopic(moduleData, topicFilter)) return false;
      if (!includesByPeople(userStatus, peopleFilter)) return false;
      if (!includesByTimeframe(getModuleProgressTimestamp(row), startDate)) return false;

      return true;
    });

    // Keep only the most recently updated progress row per (user, module) so duplicate
    // rows can't skew the completion rate.
    const dedupedModuleProgress = Object.values(
      filteredModuleProgress.reduce((accumulator, row) => {
        const key = `${row.user_id}-${row.module_id}`;
        const existing = accumulator[key];
        if (!existing) {
          accumulator[key] = row;
          return accumulator;
        }

        const existingTime = new Date(getModuleProgressTimestamp(existing) || 0).getTime();
        const rowTime = new Date(getModuleProgressTimestamp(row) || 0).getTime();
        if (rowTime > existingTime) accumulator[key] = row;
        return accumulator;
      }, {}),
    );

    const completionAccumulator = modulesForCompletion.reduce((accumulator, moduleRow) => {
      accumulator[moduleRow.id] = {
        completionSum: 0,
        simulationDone: 0,
        count: 0,
      };
      return accumulator;
    }, {});

    dedupedModuleProgress.forEach((row) => {
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
      labels: modulesForCompletion.map((row) => getModuleDisplayTitle(row)),
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
      labels: modulesForAttempts.map((row) => getModuleDisplayTitle(row)),
      attempts: modulesForAttempts.map((row) => attemptsAccumulator[row.id] || 0),
    };

    const attemptsByModuleYearAccumulator = {};

    filteredAttempts.forEach((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      if (!assessment?.module_id) return;

      const timestamp = getAttemptTimestamp(attempt);
      if (!timestamp) return;

      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return;

      const year = date.getFullYear();
      if (!attemptsByModuleYearAccumulator[year]) {
        attemptsByModuleYearAccumulator[year] = {};
      }

      const moduleId = assessment.module_id;
      attemptsByModuleYearAccumulator[year][moduleId] =
        (attemptsByModuleYearAccumulator[year][moduleId] || 0) + 1;
    });

    const availableYears = Object.keys(attemptsByModuleYearAccumulator)
      .map(Number)
      .sort((a, b) => a - b);

    const byYear = availableYears.reduce((accumulator, year) => {
      const moduleCounts = attemptsByModuleYearAccumulator[year];
      accumulator[year] = {
        labels: modulesForAttempts.map((row) => getModuleDisplayTitle(row)),
        attempts: modulesForAttempts.map((row) => moduleCounts[row.id] || 0),
      };
      return accumulator;
    }, {});

    const attemptsByYear = { availableYears, byYear };

    const overviewRows = buildOverviewRows({
      attempts: filteredAttempts,
      assessmentsById,
      modulesById,
      userById,
      filters,
      simulationSessions,
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

    // Aggregate to one entry per unique learner (a learner may have a row per module)
    // before classifying risk, so a single learner attempting several modules can't be
    // counted more than once and the total can never exceed the learner count.
    const riskMetricsByLearner = overviewRows.reduce((accumulator, row) => {
      if (!accumulator[row.adminId]) {
        accumulator[row.adminId] = { gainSum: 0, completionSum: 0, simulationSum: 0, count: 0 };
      }

      const bucket = accumulator[row.adminId];
      bucket.gainSum += toNumber(row.normalizedGain, 0);
      bucket.completionSum += toNumber(row.completionRate, 0);
      bucket.simulationSum += toNumber(row.simulationScore, 0);
      bucket.count += 1;

      return accumulator;
    }, {});

    const riskDistributionCounts = Object.values(riskMetricsByLearner).reduce(
      (accumulator, bucket) => {
        const level = classifyKnowledgeRisk({
          normalizedGain: bucket.count > 0 ? bucket.gainSum / bucket.count : 0,
          completionRate: bucket.count > 0 ? bucket.completionSum / bucket.count : 0,
          simulationScore: bucket.count > 0 ? bucket.simulationSum / bucket.count : 0,
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
        attemptsByYear,
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

export const getModuleRecommendations = async () => {
  const remote = await tryAnalyticsApi('/api/knowledge-analytics/module-recommendations');
  if (remote?.data) {
    return { data: remote.data || [], error: remote.error || null };
  }

  try {
    const { attempts, assessments, modules } = await loadAnalyticsBaseData();

    const assessmentsById = assessments.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});

    const modulesById = modules.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});

    const moduleStats = {};

    attempts.forEach((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      if (!assessment) return;

      const moduleId = assessment.module_id;
      const moduleData = modulesById[moduleId];
      if (!moduleData) return;

      if (!moduleStats[moduleId]) {
        moduleStats[moduleId] = {
          moduleId,
          moduleName: moduleData.title || 'Unknown Module',
          scores: [],
          attemptsCount: 0,
          completionCount: 0,
        };
      }

      const score = toNumber(attempt.score, 0);
      moduleStats[moduleId].scores.push(score);
      moduleStats[moduleId].attemptsCount += 1;
      if (score >= 70) {
        moduleStats[moduleId].completionCount += 1;
      }
    });

    const recommendations = Object.entries(moduleStats)
      .map(([moduleId, stats]) => {
        if (!stats.scores.length) return null;

        const avgScore = round(
          stats.scores.reduce((sum, score) => sum + score, 0) / stats.scores.length,
          2
        );

        const passRate = round(
          stats.attemptsCount > 0 ? (stats.completionCount / stats.attemptsCount) * 100 : 0,
          2
        );

        let level = 'excellent';
        let color = 'green';

        if (avgScore < 80) {
          level = 'good';
          color = 'blue';
        }

        if (avgScore < 65) {
          level = 'moderate';
          color = 'orange';
        }

        if (avgScore < 50) {
          level = 'low';
          color = 'red';
        }

        const recommendationsText = [];

        if (avgScore >= 80) {
          recommendationsText.push('Keep the current lesson structure and reuse its strongest approach in weaker modules');
          if (passRate < 100) {
            recommendationsText.push(`Review the questions missed by the remaining ${round(100 - passRate, 1)}% of learners`);
          }
        } else if (avgScore >= 65) {
          recommendationsText.push('Add one worked example after each difficult concept');
          recommendationsText.push('Insert short practice checks between lesson sections');
          if (passRate < 80) {
            recommendationsText.push('Give struggling learners additional guided practice before the final assessment');
          }
        } else if (avgScore >= 50) {
          recommendationsText.push('Rewrite complex explanations using shorter steps and plain-language examples');
          recommendationsText.push('Break long lessons into smaller sections with one learning goal each');
          recommendationsText.push('Add a short prerequisite review before the main lesson');
          recommendationsText.push('Increase guided simulation and practice opportunities');
        } else {
          recommendationsText.push('Review the lowest-performing topics and rewrite unclear explanations first');
          recommendationsText.push('Add a visual, step-by-step walkthrough for each critical procedure');
          recommendationsText.push('Provide guided practice with hints before independent simulation');
          recommendationsText.push('Split the module if it currently covers several unrelated learning goals');
        }

        return {
          moduleId,
          moduleName: stats.moduleName,
          averageScore: avgScore,
          passRate,
          attemptCount: stats.attemptsCount,
          level,
          color,
          recommendations: recommendationsText,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.averageScore - b.averageScore);

    return { data: recommendations, error: null };
  } catch (error) {
    console.error('Error fetching module recommendations:', error);
    return { data: [], error: error.message };
  }
};
