import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_FILTER,
  METRIC_FIELDS,
  buildLearnerComparisons,
  buildRoundSeries,
  buildRoundTrend,
  filterRecords,
  keepLatestRoundAttempts,
  rankBarangays,
  scoreChange,
  summarizeByBarangay,
  summarizeRecords,
} from './assessmentHistory.js';

const record = (overrides) => ({
  userId: 'u1',
  learnerName: 'Ana',
  email: '',
  barangay: 'Salawag',
  moduleId: 'm1',
  moduleNo: 1,
  moduleTitle: 'Fire Extinguisher',
  roundNo: 1,
  preScore: null,
  postScore: null,
  ...overrides,
});

const records = [
  record({ userId: 'u1', roundNo: 1, preScore: 40, postScore: 70 }),
  record({ userId: 'u1', roundNo: 2, preScore: 60, postScore: 90 }),
  record({ userId: 'u2', learnerName: 'Ben', roundNo: 1, preScore: 50, postScore: null }),
  record({ userId: 'u3', learnerName: 'Cara', barangay: 'Burol I', roundNo: 1, preScore: 80, postScore: 80 }),
  record({ userId: 'u3', learnerName: 'Cara', barangay: 'Burol I', roundNo: 2 }),
];

test('score change gives points and percentage, with no percentage from zero', () => {
  assert.deepEqual(scoreChange(50, 75), { points: 25, percent: 50 });
  assert.deepEqual(scoreChange(80, 60), { points: -20, percent: -25 });
  assert.deepEqual(scoreChange(0, 40), { points: 40, percent: null });
  assert.deepEqual(scoreChange(null, 40), { points: null, percent: null });
});

test('summaries count learners once and ignore rounds with no results', () => {
  const summary = summarizeRecords(records);
  assert.equal(summary.learners, 3);
  assert.equal(summary.records, 4);
  assert.equal(summary.averagePre, 57.5);
  assert.equal(summary.averagePost, 80);
  assert.equal(summary.started, 4);
  assert.equal(summary.completed, 3);
  assert.equal(summary.completionRate, 75);
  assert.equal(summary.averageGain, 20);
});

test('filters combine barangay, module and round', () => {
  assert.equal(filterRecords(records, { barangay: 'Salawag' }).length, 3);
  assert.equal(filterRecords(records, { round: '2' }).length, 2);
  assert.equal(filterRecords(records, { barangay: 'Burol I', round: '1' }).length, 1);
  assert.equal(filterRecords(records, { moduleId: 'other' }).length, 0);
});

test('learner filter narrows to one learner', () => {
  assert.equal(filterRecords(records, { userId: 'u1' }).length, 2);
  assert.equal(filterRecords(records, { userId: 'u3', round: '1' }).length, 1);
});

test('round series share one round axis and use null for missing rounds', () => {
  const { rounds, series } = buildRoundSeries(records, (row) => row.barangay);
  assert.deepEqual(rounds, [1, 2]);
  const salawag = series.find((line) => line.key === 'Salawag');
  assert.deepEqual(salawag.points.map((point) => point?.[METRIC_FIELDS.post] ?? null), [70, 90]);
  assert.equal(salawag.points[0].learners, 2);
  const burol = series.find((line) => line.key === 'Burol I');
  assert.deepEqual(burol.points.map((point) => point?.[METRIC_FIELDS.pre] ?? null), [80, null]);
});

test('barangays rank by distinct learners, then name', () => {
  assert.deepEqual(rankBarangays(records), ['Salawag', 'Burol I']);
});

test('barangay summary keeps its own round history and skips empty groups', () => {
  const round2 = filterRecords(records, { round: '2' });
  const rows = summarizeByBarangay(round2, records);
  assert.deepEqual(rows.map((row) => row.barangay), ['Salawag']);
  assert.deepEqual(rows[0].trend.map((point) => [point.roundNo, point.averagePost]), [[1, 70], [2, 90]]);
});

test('round trend leaves out rounds that were opened but not retaken', () => {
  const trend = buildRoundTrend(filterRecords(records, { barangay: 'Burol I' }));
  assert.deepEqual(trend.map((point) => point.roundNo), [1]);
});

test('learner comparison uses the latest round, or the selected round', () => {
  const latest = buildLearnerComparisons(records);
  const ana = latest.find((row) => row.userId === 'u1');
  assert.equal(ana.previous.roundNo, 1);
  assert.equal(ana.current.roundNo, 2);
  assert.deepEqual(ana.postChange, { points: 20, percent: 28.6 });

  const cara = latest.find((row) => row.userId === 'u3');
  assert.equal(cara.awaitingRetake, true);

  const roundOne = buildLearnerComparisons(records, { round: '1' });
  assert.equal(roundOne.find((row) => row.userId === 'u1').previous, null);
  assert.equal(buildLearnerComparisons(records, { round: ALL_FILTER }).length, 3);
});

test('existing analytics pair pre and post from the same round', () => {
  const attempts = [
    { id: 'a', user_id: 'u1', module: 'm1', round_no: 1 },
    { id: 'b', user_id: 'u1', module: 'm1', round_no: 2 },
    { id: 'c', user_id: 'u1', module: 'm2' },
    { id: 'd', user_id: 'u2', module: 'm1', round_no: 1 },
  ];
  const kept = keepLatestRoundAttempts(attempts, (attempt) => attempt.module).map((attempt) => attempt.id);
  assert.deepEqual(kept, ['b', 'c', 'd']);
});
