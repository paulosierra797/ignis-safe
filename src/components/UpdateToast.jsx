import { useCallback, useEffect, useState } from 'react';
import { FiRefreshCw, FiX } from 'react-icons/fi';
import { startVersionPolling, markDismissed, applyUpdate } from '../utils/versionCheck';
import { isReloadGuardActive, bypassNextReloadGuard } from '../utils/reloadGuard';
import ReloadGuardDialog from './ReloadGuardDialog';
import './UpdateToast.css';

// Mounted as a sibling of <RouterProvider> in main.jsx (not inside App), so a
// route crashing into RouteErrorBoundary can't take this down with it - the
// current page stays visible and this toast keeps working independently.
export default function UpdateToast() {
  const [availableBuildId, setAvailableBuildId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Shown instead of reloading straight away when attendance Face/Location
  // verification is in progress (see src/utils/reloadGuard.js) - reload here
  // would otherwise trip the same native beforeunload prompt as a real
  // browser refresh, which can't be restyled.
  const [showReloadGuard, setShowReloadGuard] = useState(false);

  useEffect(() => {
    const stopPolling = startVersionPolling((buildId) => {
      setAvailableBuildId((current) => current ?? buildId);
    });
    return stopPolling;
  }, []);

  const handleLater = useCallback(() => {
    if (availableBuildId) markDismissed(availableBuildId);
    setAvailableBuildId(null);
  }, [availableBuildId]);

  const handleRefreshNow = useCallback(() => {
    if (isReloadGuardActive()) {
      setShowReloadGuard(true);
      return;
    }
    setRefreshing(true);
    applyUpdate();
  }, []);

  const handleReloadGuardContinue = useCallback(() => {
    setShowReloadGuard(false);
    bypassNextReloadGuard();
    setRefreshing(true);
    applyUpdate();
  }, []);

  const handleReloadGuardStay = useCallback(() => {
    setShowReloadGuard(false);
  }, []);

  if (!availableBuildId) return null;

  return (
    <>
      <div className="update-toast" role="status" aria-live="polite">
        <div className="update-toast-icon" aria-hidden="true">
          <FiRefreshCw className={refreshing ? 'update-toast-spin' : ''} />
        </div>
        <div className="update-toast-body">
          <p className="update-toast-title">New version available</p>
          <p className="update-toast-message">
            A new version of IGNIS SAFE is available. Refresh to load the latest version.
          </p>
          <div className="update-toast-actions">
            <button
              type="button"
              className="update-toast-btn update-toast-btn-primary"
              onClick={handleRefreshNow}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh Now'}
            </button>
            <button
              type="button"
              className="update-toast-btn update-toast-btn-secondary"
              onClick={handleLater}
              disabled={refreshing}
            >
              Later
            </button>
          </div>
        </div>
        <button
          type="button"
          className="update-toast-close"
          onClick={handleLater}
          disabled={refreshing}
          aria-label="Dismiss update notification"
        >
          <FiX />
        </button>
      </div>
      {showReloadGuard && (
        <ReloadGuardDialog
          onStay={handleReloadGuardStay}
          onContinue={handleReloadGuardContinue}
        />
      )}
    </>
  );
}
