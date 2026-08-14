// utils/livenessChallenge.js
// Pure liveness-challenge logic (no React). Consumes already-smoothed per-tick
// samples produced by useLivenessCheck's rolling window and decides whether a
// challenge action / neutral pose is currently satisfied.

// --- Head-pose extraction -------------------------------------------------

// MediaPipe's facialTransformationMatrixes[i].data is a column-major 4x4
// (16-value) rotation+translation matrix, the same convention used by
// Three.js's Matrix4. Decomposing it as a 'YXZ' Euler (the standard order for
// head-pose: yaw first, then pitch, then roll) is a generic linear-algebra
// formula, not tied to any single library.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const RAD_TO_DEG = 180 / Math.PI;

export const decomposeYawPitchRoll = (matrixData) => {
  const m13 = matrixData[8];
  const m23 = matrixData[9];
  const m33 = matrixData[10];
  const m21 = matrixData[1];
  const m22 = matrixData[5];

  const pitch = Math.asin(-clamp(m23, -1, 1));
  let yaw;
  let roll;

  if (Math.abs(m23) < 0.9999999) {
    yaw = Math.atan2(m13, m33);
    roll = Math.atan2(m21, m22);
  } else {
    yaw = Math.atan2(-matrixData[2], matrixData[0]);
    roll = 0;
  }

  return {
    yawDeg: yaw * RAD_TO_DEG,
    pitchDeg: pitch * RAD_TO_DEG,
    rollDeg: roll * RAD_TO_DEG
  };
};

// Empirically verify this against a real camera during manual testing - if
// "turn left"/"turn right" feel swapped on a given setup, flip this constant
// rather than re-deriving the matrix math.
const TURN_YAW_SIGN = 1;

// --- Blink extraction ------------------------------------------------------

export const getBlinkScore = (blendshapeCategories = []) => {
  const byName = new Map(blendshapeCategories.map((c) => [c.categoryName, c.score]));
  const left = byName.get('eyeBlinkLeft') || 0;
  const right = byName.get('eyeBlinkRight') || 0;
  return (left + right) / 2;
};

// --- Thresholds --------------------------------------------------------

export const THRESHOLDS = {
  blinkClosed: 0.55,
  blinkOpen: 0.3,
  turnYawDeg: 15,
  lookPitchDeg: 12,
  neutralYawToleranceDeg: 8,
  neutralPitchToleranceDeg: 8,
  neutralBlinkMax: 0.35
};

export const isNeutralPose = (smoothed, baseline) => {
  if (!smoothed || !baseline) return false;
  const yawDelta = Math.abs(smoothed.yawDeg - baseline.yawDeg);
  const pitchDelta = Math.abs(smoothed.pitchDeg - baseline.pitchDeg);
  return (
    yawDelta <= THRESHOLDS.neutralYawToleranceDeg &&
    pitchDelta <= THRESHOLDS.neutralPitchToleranceDeg &&
    smoothed.blinkScore <= THRESHOLDS.neutralBlinkMax
  );
};

// --- Challenge actions -------------------------------------------------

export const BLINK_ACTION = {
  id: 'blink_twice',
  instruction: 'Blink twice',
  timeLimitMs: 7000,
  createState: () => ({ phase: 'open', blinkCount: 0 }),
  evaluate: (state, smoothed) => {
    if (state.phase === 'open' && smoothed.blinkScore > THRESHOLDS.blinkClosed) {
      state.phase = 'closed';
    } else if (state.phase === 'closed' && smoothed.blinkScore < THRESHOLDS.blinkOpen) {
      state.phase = 'open';
      state.blinkCount += 1;
    }
    return state.blinkCount >= 2;
  }
};

const TURN_LOOK_ACTIONS = [
  {
    id: 'turn_left',
    instruction: 'Turn your head left',
    timeLimitMs: 6000,
    createState: () => ({}),
    evaluate: (_state, smoothed, baseline) =>
      TURN_YAW_SIGN * (smoothed.yawDeg - baseline.yawDeg) < -THRESHOLDS.turnYawDeg
  },
  {
    id: 'turn_right',
    instruction: 'Turn your head right',
    timeLimitMs: 6000,
    createState: () => ({}),
    evaluate: (_state, smoothed, baseline) =>
      TURN_YAW_SIGN * (smoothed.yawDeg - baseline.yawDeg) > THRESHOLDS.turnYawDeg
  },
  {
    id: 'look_up',
    instruction: 'Look up',
    timeLimitMs: 6000,
    createState: () => ({}),
    evaluate: (_state, smoothed, baseline) =>
      smoothed.pitchDeg - baseline.pitchDeg > THRESHOLDS.lookPitchDeg
  },
  {
    id: 'look_down',
    instruction: 'Look down',
    timeLimitMs: 6000,
    createState: () => ({}),
    evaluate: (_state, smoothed, baseline) =>
      smoothed.pitchDeg - baseline.pitchDeg < -THRESHOLDS.lookPitchDeg
  }
];

export const ACTION_POOL = [BLINK_ACTION, ...TURN_LOOK_ACTIONS];

const shuffle = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Always includes the mandatory blink, plus 1-2 randomly chosen turn/look
// actions, in a randomized order (including where the blink falls). Called
// fresh every attempt - never a fixed sequence.
export const generateChallengeSequence = () => {
  const extraCount = 1 + Math.round(Math.random()); // 1 or 2
  const extras = shuffle(TURN_LOOK_ACTIONS).slice(0, extraCount);
  return shuffle([BLINK_ACTION, ...extras]);
};

export const createChallengeSession = (qrSessionId) => ({
  challengeId: crypto.randomUUID(),
  qrSessionId,
  sequence: generateChallengeSequence(),
  createdAt: Date.now()
});

export const isChallengeValidForSession = (challenge, qrSessionId) =>
  Boolean(challenge && qrSessionId && challenge.qrSessionId === qrSessionId);
