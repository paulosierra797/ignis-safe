import React, { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import './UnsavedChangesPrompt.css';
import './AppDialog.css';
import { ConfirmationDialog } from './ui/Controls';

export function UnsavedChangesDialog({
  title = 'Leave without saving?',
  message = 'You have unsaved changes. Are you sure you want to leave?',
  stayLabel = 'Keep Editing',
  leaveLabel = 'Leave Page',
  onStay,
  onLeave,
}) {
  return (
    <ConfirmationDialog title={title} message={message} cancelLabel={stayLabel}
      confirmLabel={leaveLabel} onCancel={onStay} onConfirm={onLeave} />
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
