import React from 'react';
import ArchiveConfirmDialog from './ArchiveConfirmDialog';
import './ReloadGuardDialog.css';

// Styled stand-in for the browser's native "Reload site?" dialog, shown for
// in-app reload/navigation actions while Face/Location verification is
// unfinished. Real browser refresh (F5/Ctrl+R) and tab close still fall
// through to the native beforeunload prompt, which can't be restyled.
export default function ReloadGuardDialog({
  onStay,
  onContinue,
  continueLabel = 'Continue',
}) {
  return (
    <ArchiveConfirmDialog open tone="danger" title="Leave verification?"
      description="Your current verification progress will be lost."
      showReason={false} cancelLabel="Stay" confirmLabel={continueLabel}
      onClose={onStay} onConfirm={onContinue} />
  );
}
