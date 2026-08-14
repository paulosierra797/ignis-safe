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

// The <video> preview is NOT CSS-mirrored (see AttendanceConfirm.jsx - the
// getUserMedia stream is drawn raw), so MediaPipe's yaw is computed directly
// against the unflipped camera frame. This constant is the single knob to
// flip if "turn left"/"turn right" ever feel swapped on a real device -
// re-derive the matrix math only as a last resort.
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
  // A "strong" turn, not a slight glance - deliberately higher than a
  // passive head wobble so a static photo tilted slightly can't pass.
  turnYawDeg: 25,
  // Turn must be held past the threshold for this long (not just a
  // momentary spike) before the step is marked complete.
  turnSustainMs: 350,
  // Same idea for the "return to center" step between Turn Left and Turn
  // Right - must genuinely settle back near baseline, not just pass through.
  centerSustainMs: 300,
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
//
// evaluate(state, smoothed, baseline, now) is called every tracked frame
// while the step is active; `now` is a performance.now() timestamp used for
// sustain windows (a threshold must be genuinely held, not just brushed).

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

const makeTurnAction = (id, instruction, isPastThreshold) => ({
  id,
  instruction,
  timeLimitMs: 6000,
  createState: () => ({ sustainSince: null }),
  evaluate: (state, smoothed, baseline, now) => {
    const relativeYaw = TURN_YAW_SIGN * (smoothed.yawDeg - baseline.yawDeg);
    if (!isPastThreshold(relativeYaw)) {
      state.sustainSince = null;
      return false;
    }
    if (state.sustainSince == null) state.sustainSince = now;
    return now - state.sustainSince >= THRESHOLDS.turnSustainMs;
  }
});

export const TURN_LEFT_ACTION = makeTurnAction(
  'turn_left',
  'Turn head LEFT',
  (relativeYaw) => relativeYaw < -THRESHOLDS.turnYawDeg
);

export const TURN_RIGHT_ACTION = makeTurnAction(
  'turn_right',
  'Turn head RIGHT',
  (relativeYaw) => relativeYaw > THRESHOLDS.turnYawDeg
);

// Sits between Turn Left and Turn Right so the right-turn step can never be
// satisfied by a yaw reading left over from (or sweeping through on the way
// back from) the left turn - the face must genuinely settle near baseline
// first.
export const RETURN_CENTER_ACTION = {
  id: 'return_center',
  instruction: 'Return to center',
  timeLimitMs: 5000,
  createState: () => ({ sustainSince: null }),
  evaluate: (state, smoothed, baseline, now) => {
    if (!isNeutralPose(smoothed, baseline)) {
      state.sustainSince = null;
      return false;
    }
    if (state.sustainSince == null) state.sustainSince = now;
    return now - state.sustainSince >= THRESHOLDS.centerSustainMs;
  }
};

// Fixed order, every attempt: Blink -> Turn Left -> Center -> Turn Right.
// Blink stays mandatory and first so a static photo can't just be tilted
// left/right to pass. (The final return-to-center + capture, before face
// matching, is handled separately by useLivenessCheck's 'lookStraight' phase.)
export const CHALLENGE_SEQUENCE = [BLINK_ACTION, TURN_LEFT_ACTION, RETURN_CENTER_ACTION, TURN_RIGHT_ACTION];

export const generateChallengeSequence = () => [...CHALLENGE_SEQUENCE];

export const createChallengeSession = (qrSessionId) => ({
  challengeId: crypto.randomUUID(),
  qrSessionId,
  sequence: generateChallengeSequence(),
  createdAt: Date.now()
});

export const isChallengeValidForSession = (challenge, qrSessionId) =>
  Boolean(challenge && qrSessionId && challenge.qrSessionId === qrSessionId);
