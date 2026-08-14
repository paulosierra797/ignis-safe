import React, { useEffect, useRef } from 'react';
import { useLivenessCheck } from '../hooks/useLivenessCheck';
import './LivenessCheck.css';

const PHASE_LABELS = {
  loading: 'Preparing face check...',
  centering: 'Center your face in the circle',
  calibrating: 'Look straight, relax your face',
  passed: 'Liveness check passed ✓'
};

const REQUIRED_FAILURE_MESSAGE =
  'Live face verification failed. Please look directly at the camera and follow the instructions.';

// Renders the liveness instruction/progress UI. The live <video> element
// itself stays owned by AttendanceConfirm (same getUserMedia stream already
// opened in handleVerifyFace) - this component only reads from it via
// videoRef and drives useLivenessCheck's phase state machine.
const LivenessCheck = ({ videoRef, qrSessionId, onPassed, onFailed, onDebug, onPhaseChange }) => {
  const handledRef = useRef(false);

  const handleComplete = (result) => {
    if (handledRef.current) return;
    handledRef.current = true;
    if (result.passed) {
      onPassed({ canvas: result.canvas, challengeId: result.challengeId, sequenceIds: result.sequenceIds });
    } else {
      onFailed(result.reason);
    }
  };

  const { phase, instruction, countdownMs, progressPercent, failureLabel } = useLivenessCheck({
    videoRef,
    active: true,
    qrSessionId,
    onComplete: handleComplete,
    onDebug
  });

  // Purely cosmetic - lets AttendanceConfirm tint the circular face-guide
  // ring to match phase (e.g. green once centered). Doesn't feed back into
  // any liveness/matching logic.
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const showProgress = phase === 'centering' || phase === 'calibrating' || phase === 'challenge' || phase === 'passed';
  const displayPercent = Math.round(phase === 'passed' ? 100 : progressPercent);
  const countdownSeconds = countdownMs != null ? Math.ceil(countdownMs / 1000) : null;

  return (
    <div className={`liveness-check liveness-check--${phase}`}>
      <div className="liveness-instruction" role="status">
        {phase === 'failed' ? REQUIRED_FAILURE_MESSAGE : instruction || PHASE_LABELS[phase] || ''}
      </div>

      {showProgress && (
        <div
          className="liveness-progress"
          role="progressbar"
          aria-valuenow={displayPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="liveness-progress-track">
            <div className="liveness-progress-fill" style={{ width: `${displayPercent}%` }} />
          </div>
          <span className="liveness-progress-label">{displayPercent}%</span>
        </div>
      )}

      {phase === 'challenge' && countdownSeconds != null && (
        <div className="liveness-countdown">{countdownSeconds}s</div>
      )}

      {import.meta.env.DEV && phase === 'failed' && failureLabel && (
        <div className="liveness-fail-detail">{failureLabel}</div>
      )}
    </div>
  );
};

export default LivenessCheck;
