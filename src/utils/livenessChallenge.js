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

// The <video> element itself is drawn raw - see AttendanceConfirm.jsx/
// useLivenessCheck.js, where MediaPipe's detectForVideo(video, ...) and the
// capture canvas's drawImage(video, 0, 0) both read the decoded video frame
// directly. CSS applied to the <video> element (AttendanceConfirm.css mirrors
// it for on-screen display, matching a normal front-camera app) is a
// rendering-only transform and does not affect that underlying frame data, so
// MediaPipe's yaw is still computed against the unflipped camera frame.
// decomposeYawPitchRoll's atan2(m13, m33) is +θ when the canonical face's
// forward (+Z, facing the camera) axis rotates toward image +X (screen
// right). Since the raw frame is unmirrored, image-right is the subject's OWN
// LEFT (as in a normal photo of someone facing the camera, not a mirror) - so
// raw yawDeg is positive when the person turns their own left, negative when
// they turn their own right. TURN_LEFT/TURN_RIGHT below are written expecting
// the opposite sign (negative = left, positive = right), so this must be -1
// to match on a real device. This is the single knob to flip if "turn
// left"/"turn right" ever feel swapped - re-derive the matrix math only as a
// last resort, and don't "fix" it by touching the CSS mirror instead (that
// only changes what the preview looks like, not the frame math).
const TURN_YAW_SIGN = -1;

// --- Blink extraction ------------------------------------------------------
// No longer a challenge step on its own, but still feeds isNeutralPose below
// so a "settled, facing forward" reading can't be satisfied with eyes closed.

export const getBlinkScore = (blendshapeCategories = []) => {
  const byName = new Map(blendshapeCategories.map((c) => [c.categoryName, c.score]));
  const left = byName.get('eyeBlinkLeft') || 0;
  const right = byName.get('eyeBlinkRight') || 0;
  return (left + right) / 2;
};

// --- Thresholds --------------------------------------------------------

export const THRESHOLDS = {
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

export const isNeutralPose = (smoothed, baseline, thresholds = THRESHOLDS) => {
  if (!smoothed || !baseline) return false;
  const yawDelta = Math.abs(smoothed.yawDeg - baseline.yawDeg);
  const pitchDelta = Math.abs(smoothed.pitchDeg - baseline.pitchDeg);
  return (
    yawDelta <= thresholds.neutralYawToleranceDeg &&
    pitchDelta <= thresholds.neutralPitchToleranceDeg &&
    smoothed.blinkScore <= thresholds.neutralBlinkMax
  );
};

// --- Challenge actions -------------------------------------------------
//
// evaluate(state, smoothed, baseline, now) is called every tracked frame
// while the step is active; `now` is a performance.now() timestamp used for
// sustain windows (a threshold must be genuinely held, not just brushed).

const makeTurnAction = (id, instruction, direction, thresholds = THRESHOLDS) => ({
  id,
  instruction,
  // Exposed so the UI can render a smooth in-step progress fraction
  // (elapsed sustain hold / sustainMs) - display only, doesn't affect
  // evaluate()'s pass/fail decision below.
  sustainMs: thresholds.turnSustainMs,
  createState: () => ({ sustainSince: null }),
  evaluate: (state, smoothed, baseline, now) => {
    const relativeYaw = TURN_YAW_SIGN * (smoothed.yawDeg - baseline.yawDeg);
    const isPastThreshold = direction === 'left'
      ? relativeYaw < -thresholds.turnYawDeg
      : relativeYaw > thresholds.turnYawDeg;
    if (!isPastThreshold) {
      state.sustainSince = null;
      return false;
    }
    if (state.sustainSince == null) state.sustainSince = now;
    return now - state.sustainSince >= thresholds.turnSustainMs;
  }
});

export const TURN_LEFT_ACTION = makeTurnAction(
  'turn_left',
  'Turn head LEFT',
  'left'
);

export const TURN_RIGHT_ACTION = makeTurnAction(
  'turn_right',
  'Turn head RIGHT',
  'right'
);

// Not inserted into CHALLENGE_SEQUENCE because it is a capture-preparation
// phase rather than a randomized challenge action. useLivenessCheck presents
// it to the user after Turn Right so the match frame is never captured at a
// side angle.
export const createReturnCenterAction = (thresholdOverrides = {}) => {
  const thresholds = { ...THRESHOLDS, ...thresholdOverrides };

  return {
    id: 'return_center',
    instruction: 'Return to center',
    timeLimitMs: 5000,
    sustainMs: thresholds.centerSustainMs,
    createState: () => ({ sustainSince: null }),
    evaluate: (state, smoothed, baseline, now) => {
      if (!isNeutralPose(smoothed, baseline, thresholds)) {
        state.sustainSince = null;
        return false;
      }
      if (state.sustainSince == null) state.sustainSince = now;
      return now - state.sustainSince >= thresholds.centerSustainMs;
    }
  };
};

export const RETURN_CENTER_ACTION = createReturnCenterAction();

// Fixed order, every attempt: Turn Left -> Turn Right. Each turn action
// already requires a sustained hold past turnYawDeg (see makeTurnAction)
// before it counts as done, so a quick pass-through on the way to the other
// side can't satisfy either step - that sustain gate is what keeps this
// spoof-resistant without an explicit "return to center" step in between.
// After the final Turn Right hold, useLivenessCheck visibly asks the user to
// return to center before capturing the match frame.
export const CHALLENGE_SEQUENCE = [TURN_LEFT_ACTION, TURN_RIGHT_ACTION];

export const generateChallengeSequence = (thresholdOverrides = {}) => {
  const thresholds = { ...THRESHOLDS, ...thresholdOverrides };
  return [
    makeTurnAction('turn_left', 'Turn head LEFT', 'left', thresholds),
    makeTurnAction('turn_right', 'Turn head RIGHT', 'right', thresholds)
  ];
};

export const createChallengeSession = (qrSessionId, thresholdOverrides = {}) => ({
  challengeId: crypto.randomUUID(),
  qrSessionId,
  sequence: generateChallengeSequence(thresholdOverrides),
  createdAt: Date.now()
});

export const isChallengeValidForSession = (challenge, qrSessionId) =>
  Boolean(challenge && qrSessionId && challenge.qrSessionId === qrSessionId);
