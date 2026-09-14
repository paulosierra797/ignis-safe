import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THRESHOLDS,
  createReturnCenterAction,
  generateChallengeSequence,
  isNeutralPose
} from './livenessChallenge.js';

const baseline = { yawDeg: 0, pitchDeg: 0 };

test('default liveness thresholds remain strict for attendance verification', () => {
  const [turnLeft] = generateChallengeSequence();
  const state = turnLeft.createState();

  assert.equal(turnLeft.evaluate(state, { yawDeg: 20, pitchDeg: 0, blinkScore: 0 }, baseline, 0), false);
  assert.equal(isNeutralPose({ yawDeg: 9, pitchDeg: 0, blinkScore: 0 }, baseline), false);
  assert.equal(THRESHOLDS.turnYawDeg, 25);
});

test('enrollment overrides accept a clear moderate turn without changing the challenge steps', () => {
  const sequence = generateChallengeSequence({ turnYawDeg: 19, turnSustainMs: 300 });
  const [turnLeft] = sequence;
  const state = turnLeft.createState();
  const sample = { yawDeg: 21, pitchDeg: 0, blinkScore: 0 };

  assert.deepEqual(sequence.map((action) => action.id), ['turn_left', 'turn_right']);
  assert.equal(turnLeft.evaluate(state, sample, baseline, 0), false);
  assert.equal(turnLeft.evaluate(state, sample, baseline, 300), true);
});

test('enrollment recentering tolerates normal camera pose noise', () => {
  const action = createReturnCenterAction({
    centerSustainMs: 250,
    neutralYawToleranceDeg: 12,
    neutralPitchToleranceDeg: 12,
    neutralBlinkMax: 0.75
  });
  const state = action.createState();
  const sample = { yawDeg: 10, pitchDeg: -9, blinkScore: 0.5 };

  assert.equal(action.evaluate(state, sample, baseline, 0), false);
  assert.equal(action.evaluate(state, sample, baseline, 250), true);
});
