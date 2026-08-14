import React, { useRef } from 'react';
import { useLivenessCheck } from '../hooks/useLivenessCheck';
import './LivenessCheck.css';

const PHASE_LABELS = {
  loading: 'Preparing face check...',
  centering: 'Center your face in the frame',
  calibrating: 'Look straight, relax your face',
  lookStraight: 'Return to center',
  passed: 'Liveness check passed ✓'
};

const REQUIRED_FAILURE_MESSAGE =
  'Live face verification failed. Please look directly at the camera and follow the instructions.';

// Renders the liveness instruction/progress UI. The live <video> element
// itself stays owned by AttendanceConfirm (same getUserMedia stream already
// opened in handleVerifyFace) - this component only reads from it via
// videoRef and drives useLivenessCheck's phase state machine.
const LivenessCheck = ({ videoRef, qrSessionId, onPassed, onFailed, onDebug }) => {
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

  const { phase, instruction, stepIndex, stepCount, countdownMs, failureLabel } = useLivenessCheck({
    videoRef,
    active: true,
    qrSessionId,
    onComplete: handleComplete,
    onDebug
  });

  const showProgress = phase === 'challenge' && stepCount > 0;
  const countdownSeconds = countdownMs != null ? Math.ceil(countdownMs / 1000) : null;

  return (
    <div className={`liveness-check liveness-check--${phase}`}>
      <div className="liveness-instruction" role="status">
        {phase === 'failed' ? REQUIRED_FAILURE_MESSAGE : instruction || PHASE_LABELS[phase] || ''}
      </div>

      {showProgress && (
        <div className="liveness-progress" aria-hidden="true">
          {Array.from({ length: stepCount }).map((_, i) => (
            <span
              key={i}
              className={`liveness-dot ${i < stepIndex ? 'done' : ''} ${i === stepIndex ? 'active' : ''}`}
            />
          ))}
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
