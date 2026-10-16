// Pure helpers behind Analytics > Barangay Assessment History. Every function
// works on "round records": one per learner + module + assessment round, built
// by assessmentHistoryService.js from the assessment_round_history view.
//
//   { userId, learnerName, email, barangay, moduleId, moduleNo, moduleTitle,
//     roundNo, preScore, postScore, preSubmittedAt, postSubmittedAt,
//     roundOpenedAt, roundOpenedByName, roundReason }
//
// Scores are 0-100 or null when that assessment was not submitted in the round.
// Barangay labels are self-declared by learners, never verified residency.

export const ALL_FILTER = 'All';

export const toScore = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const roundTo = (value, decimals = 1) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const average = (values) => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
);

// Points and percentage change from a previous score to a current one. The
// percentage is null when there is no previous score or it was 0 (undefined).
export const scoreChange = (previous, current) => {
  const before = toScore(previous);
  const after = toScore(current);
  if (before === null || after === null) return { points: null, percent: null };
  return {
    points: roundTo(after - before, 1),
    percent: before > 0 ? roundTo(((after - before) / before) * 100, 1) : null,
  };
};

const hasResult = (record) => record.preScore !== null || record.postScore !== null;

export const filterRecords = (records = [], {
  barangay = ALL_FILTER,
  userId = ALL_FILTER,
  moduleId = ALL_FILTER,
  round = ALL_FILTER,
} = {}) => (
  records.filter((record) => (
    (barangay === ALL_FILTER || record.barangay === barangay)
    && (userId === ALL_FILTER || record.userId === userId)
    && (moduleId === ALL_FILTER || record.moduleId === moduleId)
    && (round === ALL_FILTER || record.roundNo === Number(round))
  ))
);

// Aggregate measures for a group of round records.
// - learners: distinct learners with at least one submitted assessment
// - averagePre / averagePost: mean of every submitted pre / post score
// - averageGain: mean of (post - pre) over records that have both
// - completionRate: of records with a submitted pre-assessment, the share that
//   also have a submitted post-assessment in the same round
export const summarizeRecords = (records = []) => {
  const taken = records.filter(hasResult);
  const preScores = taken.map((record) => record.preScore).filter((score) => score !== null);
  const postScores = taken.map((record) => record.postScore).filter((score) => score !== null);
  const paired = taken.filter((record) => record.preScore !== null && record.postScore !== null);
  const started = taken.filter((record) => record.preScore !== null);
  const completed = started.filter((record) => record.postScore !== null);

  return {
    learners: new Set(taken.map((record) => record.userId)).size,
    records: taken.length,
    averagePre: roundTo(average(preScores)),
    averagePost: roundTo(average(postScores)),
    averageGain: roundTo(average(paired.map((record) => record.postScore - record.preScore))),
    started: started.length,
    completed: completed.length,
    completionRate: started.length ? roundTo((completed.length / started.length) * 100, 0) : null,
  };
};

// Per-round averages, oldest round first. Rounds with no submitted results yet
// (opened but not retaken) are left out so they do not read as 0%.
export const buildRoundTrend = (records = []) => {
  const byRound = new Map();
  records.filter(hasResult).forEach((record) => {
    if (!byRound.has(record.roundNo)) byRound.set(record.roundNo, []);
    byRound.get(record.roundNo).push(record);
  });

  return Array.from(byRound.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNo, roundRecords]) => ({ roundNo, ...summarizeRecords(roundRecords) }));
};

// Summary field plotted for each chart metric.
export const METRIC_FIELDS = { pre: 'averagePre', post: 'averagePost', gain: 'averageGain' };

// One line per group (barangay, module...) across assessment rounds. `rounds`
// is the shared x-axis (every round with a submitted result); each series has
// one summary per round, or null when that group has no result in the round.
export const buildRoundSeries = (records = [], getGroupKey) => {
  const taken = records.filter(hasResult);
  const rounds = Array.from(new Set(taken.map((record) => record.roundNo))).sort((a, b) => a - b);
  const groups = new Map();
  taken.forEach((record) => {
    const key = getGroupKey(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  const series = Array.from(groups.entries()).map(([key, groupRecords]) => {
    const byRound = new Map(buildRoundTrend(groupRecords).map((point) => [point.roundNo, point]));
    return { key, points: rounds.map((roundNo) => byRound.get(roundNo) || null) };
  });
  return { rounds, series };
};

// Barangays ordered by how many distinct learners have results there (most
// first). Charts take colors from this order on the unfiltered data, so a
// barangay keeps its color when other filters change.
export const rankBarangays = (records = []) => {
  const learners = new Map();
  records.filter(hasResult).forEach((record) => {
    if (!learners.has(record.barangay)) learners.set(record.barangay, new Set());
    learners.get(record.barangay).add(record.userId);
  });
  return Array.from(learners.entries())
    .sort(([nameA, a], [nameB, b]) => (b.size - a.size) || nameA.localeCompare(nameB))
    .map(([barangay]) => barangay);
};

// Barangay-level summary rows. `records` drives the headline measures (so the
// round filter applies); `trendRecords` (same barangay/module filters, every
// round) drives each barangay's round-by-round history.
export const summarizeByBarangay = (records = [], trendRecords = records) => {
  const groups = new Map();
  records.forEach((record) => {
    if (!groups.has(record.barangay)) groups.set(record.barangay, []);
    groups.get(record.barangay).push(record);
  });

  return Array.from(groups.entries())
    .map(([barangay, groupRecords]) => ({
      barangay,
      ...summarizeRecords(groupRecords),
      trend: buildRoundTrend(trendRecords.filter((record) => record.barangay === barangay)),
    }))
    .filter((row) => row.records > 0)
    .sort((a, b) => (b.learners - a.learners) || a.barangay.localeCompare(b.barangay));
};

// Individual learner progress: one row per learner + module comparing the
// "current" round with the round before it. With a round filter, the selected
// round is treated as current; otherwise the learner's latest round is.
export const buildLearnerComparisons = (records = [], { round = ALL_FILTER } = {}) => {
  const groups = new Map();
  records.forEach((record) => {
    const key = `${record.userId}:${record.moduleId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  const selectedRound = round === ALL_FILTER ? null : Number(round);
  const rows = [];

  groups.forEach((groupRecords, key) => {
    const ordered = [...groupRecords].sort((a, b) => a.roundNo - b.roundNo);
    const currentIndex = selectedRound === null
      ? ordered.length - 1
      : ordered.findIndex((record) => record.roundNo === selectedRound);
    if (currentIndex < 0) return;

    const current = ordered[currentIndex];
    const previous = currentIndex > 0 ? ordered[currentIndex - 1] : null;
    if (!hasResult(current) && !previous) return;

    rows.push({
      key,
      userId: current.userId,
      learnerName: current.learnerName,
      email: current.email,
      barangay: current.barangay,
      moduleId: current.moduleId,
      moduleNo: current.moduleNo,
      moduleTitle: current.moduleTitle,
      totalRounds: ordered.length,
      current,
      previous,
      awaitingRetake: !hasResult(current),
      preChange: scoreChange(previous?.preScore, current.preScore),
      postChange: scoreChange(previous?.postScore, current.postScore),
    });
  });

  return rows.sort((a, b) => (
    (Number(Boolean(b.previous)) - Number(Boolean(a.previous)))
    || a.learnerName.localeCompare(b.learnerName)
    || a.moduleNo - b.moduleNo
  ));
};

// Latest round number per learner + module, keyed "userId:moduleId".
export const getCurrentRounds = (records = []) => {
  const rounds = {};
  records.forEach((record) => {
    const key = `${record.userId}:${record.moduleId}`;
    rounds[key] = Math.max(rounds[key] || 1, record.roundNo);
  });
  return rounds;
};

// Pre and post must come from the same round when pairing a learner's scores.
// Attempts without round_no (database not migrated yet) count as Round 1.
export const keepLatestRoundAttempts = (attempts = [], getModuleId) => {
  const latestRound = {};
  attempts.forEach((attempt) => {
    const key = `${attempt.user_id}:${getModuleId(attempt)}`;
    latestRound[key] = Math.max(latestRound[key] || 1, Number(attempt.round_no) || 1);
  });
  return attempts.filter((attempt) => (
    (Number(attempt.round_no) || 1) === latestRound[`${attempt.user_id}:${getModuleId(attempt)}`]
  ));
};
