import React, { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import './UnsavedChangesPrompt.css';

export function UnsavedChangesDialog({
  title = 'Leave without saving?',
  message = 'You have unsaved changes. Are you sure you want to leave?',
  stayLabel = 'Keep Editing',
  leaveLabel = 'Leave Page',
  onStay,
  onLeave,
}) {
  return (
    <div
      className="unsaved-changes-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsavedChangesTitle"
      aria-describedby="unsavedChangesDescription"
    >
      <div className="unsaved-changes-modal">
        <div className="unsaved-changes-icon" aria-hidden="true">!</div>
        <h2 id="unsavedChangesTitle">{title}</h2>
        <p id="unsavedChangesDescription">{message}</p>
        <div className="unsaved-changes-actions">
          <button type="button" className="unsaved-changes-stay" onClick={onStay}>
            {stayLabel}
          </button>
          <button type="button" className="unsaved-changes-leave" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UnsavedChangesPrompt({
  when,
  title,
  message,
  stayLabel,
  leaveLabel,
}) {
  const blocker = useBlocker(Boolean(when));

  useEffect(() => {
    if (!when) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [when]);

  if (blocker.state !== 'blocked') return null;

  return (
    <UnsavedChangesDialog
      title={title}
      message={message}
      stayLabel={stayLabel}
      leaveLabel={leaveLabel}
      onStay={() => blocker.reset()}
      onLeave={() => blocker.proceed()}
    />
  );
}
