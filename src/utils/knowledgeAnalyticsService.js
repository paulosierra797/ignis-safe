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

const mapOverviewRow = (row) => {
  const preTestScore = toNumber(row.pre_test_score, 0);
  const postTestScore = toNumber(row.post_test_score, 0);
  const completionRate = toNumber(row.completion_rate, 0);
  const simulationScore = toNumber(row.simulation_score, 0);
  const normalizedGain =
    row.normalized_gain !== null && row.normalized_gain !== undefined
      ? toNumber(row.normalized_gain, 0)
      : calculateNormalizedGain(preTestScore, postTestScore);

  return {
    adminId: row.admin_id,
    moduleId: row.module_id,
    moduleName: row.module_name || 'Unknown Module',
    preTestScore,
    postTestScore,
    completionRate,
    simulationScore,
    durationSeconds: toNumber(row.duration_seconds, 0),
    errorCount: toNumber(row.error_count, 0),
    hintCount: toNumber(row.hint_count, 0),
    normalizedGain,
    rawGain: round(postTestScore - preTestScore, 2),
    riskLevel: classifyKnowledgeRisk({
      normalizedGain,
      completionRate,
      simulationScore,
    }),
    latestActivityAt: row.latest_activity_at,
  };
};

export const getKnowledgeGainOverview = async () => {
  try {
    const { data, error } = await supabase
      .from('v_training_knowledge_gain')
      .select('*');

    if (error) throw error;

    const rows = (data || []).map(mapOverviewRow);
    return { data: rows, error: null };
  } catch (error) {
    console.error('Error fetching knowledge gain overview:', error);
    return { data: [], error: error.message };
  }
};

export const getAnalyticsDashboardStats = async () => {
  try {
    const [{ data: users, error: usersError }, { data: overview, error: overviewError }] =
      await Promise.all([
        supabase.from('admin').select('admin_id, status'),
        getKnowledgeGainOverview(),
      ]);

    if (usersError) throw usersError;
    if (overviewError) throw new Error(overviewError);

    const totalUsers = (users || []).length;
    const activeUsers = (users || []).filter((user) => user.status === 'Active').length;
    const answeredRows = overview.filter(
      (row) => row.preTestScore > 0 || row.postTestScore > 0,
    );

    const questionsAnswered = answeredRows.length * 2;

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
