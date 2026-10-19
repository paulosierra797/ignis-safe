import React, { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import ArchiveConfirmDialog from './ArchiveConfirmDialog';
import './UnsavedChangesPrompt.css';
import './AppDialog.css';

export function UnsavedChangesDialog({
  title = 'Leave without saving?',
  message = 'Your unsaved changes will be lost.',
  stayLabel = 'Stay',
  leaveLabel = 'Leave',
  onStay,
  onLeave,
}) {
  return (
    <ArchiveConfirmDialog open tone="danger" title={title} description={message}
      showReason={false} cancelLabel={stayLabel} confirmLabel={leaveLabel}
      onClose={onStay} onConfirm={onLeave} />
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
