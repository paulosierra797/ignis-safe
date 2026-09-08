import React, { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import './UnsavedChangesPrompt.css';
import './AppDialog.css';

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
      className="unsaved-changes-overlay app-unsaved-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsavedChangesTitle"
      aria-describedby="unsavedChangesDescription"
    >
      <div className="unsaved-changes-modal app-unsaved-dialog">
        <div className="unsaved-changes-icon app-unsaved-icon" aria-hidden="true">!</div>
        <h2 id="unsavedChangesTitle" className="app-unsaved-title">{title}</h2>
        <p id="unsavedChangesDescription" className="app-unsaved-message">{message}</p>
        <div className="unsaved-changes-actions app-unsaved-actions">
          <button
            type="button"
            className="unsaved-changes-stay app-unsaved-button app-unsaved-button--cancel"
            onClick={onStay}
          >
            {stayLabel}
          </button>
          <button
            type="button"
            className="unsaved-changes-leave app-unsaved-button app-unsaved-button--discard"
            onClick={onLeave}
          >
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
