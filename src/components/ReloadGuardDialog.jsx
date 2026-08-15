import React from 'react';
import './ReloadGuardDialog.css';

// Styled stand-in for the browser's native "Reload site?" dialog, shown for
// in-app reload/navigation actions while Face/Location verification is
// unfinished. Real browser refresh (F5/Ctrl+R) and tab close still fall
// through to the native beforeunload prompt, which can't be restyled.
export default function ReloadGuardDialog({
  onStay,
  onContinue,
  continueLabel = 'Continue / Refresh',
}) {
  return (
    <div className="reload-guard-overlay" role="presentation">
      <div
        className="reload-guard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reloadGuardTitle"
        aria-describedby="reloadGuardMessage"
      >
        <div className="reload-guard-icon" aria-hidden="true">!</div>
        <h2 id="reloadGuardTitle">Verification in progress</h2>
        <p id="reloadGuardMessage">
          Are you sure you want to leave or refresh? Your current verification progress will be lost.
        </p>
        <div className="reload-guard-actions">
          <button type="button" className="reload-guard-btn reload-guard-btn--stay" onClick={onStay}>
            Stay
          </button>
          <button type="button" className="reload-guard-btn reload-guard-btn--continue" onClick={onContinue}>
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
