import { supabase } from './supabaseClient';

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
  completionByModule: { labels: [], completionRate: [], assessmentScore: [] },
  attemptsByModule: { labels: [], attempts: [] },
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

const includesByTimeframe = (isoDate, startDate) => {
  if (!startDate) return true;
  if (!isoDate) return false;

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return false;

  return parsed >= startDate;
};

const includesByPeople = (status, peopleFilter) => {
  if (peopleFilter === 'Active') return status === 'Active';
  if (peopleFilter === 'Inactive') return status !== 'Active';
  return true;
};

const includesByTopic = (moduleData, topicFilter) => {
  if (!topicFilter || topicFilter === 'All') return true;

  const selected = String(topicFilter).toLowerCase().trim();
  const moduleId = String(moduleData?.id || '').toLowerCase();
  const moduleTitle = String(moduleData?.title || '').toLowerCase().trim();

  return moduleId === selected || moduleTitle === selected;
};

const loadAnalyticsBaseData = async () => {
  const [
    { data: users, error: usersError },
    { data: attempts, error: attemptsError },
    { data: answers, error: answersError },
    { data: assessments, error: assessmentsError },
    { data: modules, error: modulesError },
    { data: moduleProgress, error: moduleProgressError },
  ] = await Promise.all([
    supabase.from('admin').select('admin_id, status'),
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

  if (usersError) throw usersError;
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

      if (Number.isFinite(diffSeconds)) {
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
    const activeUsers = usersScope.filter((user) => user.status === 'Active').length;

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

    const avgDurationSeconds =
      overview.length > 0
        ? overview.reduce((sum, row) => sum + row.durationSeconds, 0) / overview.length
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
  try {
    const startDate = getTimeframeStartDate(filters.timeframe);
    const topicFilter = filters.topic || 'All';

    const { attempts, assessments, modules, moduleProgress } = await loadAnalyticsBaseData();

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

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

    const activityTrends = {
      labels: monthLabels,
      started,
      submitted,
    };

    const learningByModuleAccumulator = {};

    filteredAttempts.forEach((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      const moduleData = modulesById[assessment?.module_id];
      if (!assessment || !moduleData) return;

      if (!learningByModuleAccumulator[moduleData.id]) {
        learningByModuleAccumulator[moduleData.id] = {
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

    const sortedModules = Object.values(learningByModuleAccumulator).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const learningByModule = {
      labels: sortedModules.map((row) => row.name),
      preTest: sortedModules.map((row) => (row.preCount > 0 ? round(row.preTotal / row.preCount, 2) : 0)),
      postTest: sortedModules.map((row) => (row.postCount > 0 ? round(row.postTotal / row.postCount, 2) : 0)),
    };

    const filteredModuleProgress = (moduleProgress || []).filter((row) => {
      const moduleData = modulesById[row.module_id] || null;
      return includesByTopic(moduleData, topicFilter);
    });

    const completionAccumulator = sortedModules.reduce((accumulator, moduleRow) => {
      accumulator[moduleRow.name] = {
        sum: 0,
        count: 0,
      };
      return accumulator;
    }, {});

    filteredModuleProgress.forEach((row) => {
      const moduleData = modulesById[row.module_id];
      if (!moduleData || !completionAccumulator[moduleData.title]) return;

      const stepsDone = [
        Boolean(row.pre_test_completed_at),
        Boolean(row.simulation_completed_at),
        Boolean(row.post_test_completed_at),
      ].filter(Boolean).length;

      completionAccumulator[moduleData.title].sum += round((stepsDone / 3) * 100, 2);
      completionAccumulator[moduleData.title].count += 1;
    });

    const completionByModule = {
      labels: sortedModules.map((row) => row.name),
      completionRate: sortedModules.map((row) => {
        const bucket = completionAccumulator[row.name];
        if (!bucket || bucket.count === 0) return 0;
        return round(bucket.sum / bucket.count, 2);
      }),
      assessmentScore: sortedModules.map((row) =>
        row.scoreCount > 0 ? round(row.scoreTotal / row.scoreCount, 2) : 0,
      ),
    };

    const attemptsByModule = {
      labels: sortedModules.map((row) => row.name),
      attempts: sortedModules.map((row) => row.attempts),
    };

    return {
      data: {
        userOverview,
        activityTrends,
        learningByModule,
        completionByModule,
        attemptsByModule,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching analytics charts data:', error);
    return { data: DEFAULT_CHARTS_DATA, error: error.message };
  }
};
