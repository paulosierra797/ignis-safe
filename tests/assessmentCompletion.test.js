import test from 'node:test';
import assert from 'node:assert/strict';
import { isCompletedAssessmentAttempt } from '../src/utils/assessmentHistory.js';

test('submitted and completed results include genuine zero scores', () => {
  assert.equal(isCompletedAssessmentAttempt({ status: 'submitted', score: 0 }), true);
  assert.equal(isCompletedAssessmentAttempt({ status: 'completed', score: 80 }), true);
  assert.equal(isCompletedAssessmentAttempt({ submitted_at: '2026-10-17T00:00:00Z', score: 50 }), true);
});

test('started, abandoned and unscored attempts are not completed history', () => {
  for (const attempt of [
    { status: 'in_progress', score: 0 },
    { status: 'in_progress', score: 0, submitted_at: '2026-10-17T00:00:00Z' },
    { status: 'submitted', score: null },
    { status: 'submitted', score: '' },
    { status: 'submitted', score: 'invalid' },
    { status: 'submitted', score: 101 },
    { score: 80 },
  ]) assert.equal(isCompletedAssessmentAttempt(attempt), false);
});
