import test from 'node:test';
import assert from 'node:assert/strict';
import { keepLatestRoundAttempts } from './assessmentHistory.js';

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
