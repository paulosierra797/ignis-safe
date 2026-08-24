import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { FiRefreshCw } from 'react-icons/fi';
import {
  isChunkLoadError,
  hasAlreadyAttemptedReload,
  markReloadAttempted
} from '../utils/chunkErrorRecovery';
import { applyUpdate } from '../utils/versionCheck';

// Replaces React Router's default "Unexpected Application Error" screen.
// A failed dynamic import (stale chunk hash from a previous deploy) is
// recoverable with a single hard reload, which re-fetches the current
// index.html and its up-to-date chunk map - so we do that automatically
// instead of showing a dead end. Any other error, or a chunk error that
// persists after the reload, falls through to a friendly manual-retry screen.
export default function RouteErrorBoundary() {
  const error = useRouteError();

  const chunkError = !isRouteErrorResponse(error) && isChunkLoadError(error);
  // Read synchronously at render time (not derived state) so it stays
  // consistent between this render and the effect below without setState.
  const willAutoReload = chunkError && !hasAlreadyAttemptedReload();

  useEffect(() => {
    if (willAutoReload) {
      markReloadAttempted();
      void applyUpdate();
    }
  }, [willAutoReload]);

  if (willAutoReload) {
    return null;
  }

  // This only renders once the one-time auto-reload above has already been
  // tried and the page is still broken - a genuinely unusable build, not the
  // routine "a deploy happened" case (that's UpdateToast's job).
  const title = chunkError ? 'Update needed' : 'Something went wrong';
  const message = chunkError
    ? "A new version of IGNIS SAFE was just deployed and this tab couldn't load it automatically. Refresh to continue."
    : 'An unexpected error occurred while loading this page.';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: 'inherit'
      }}
    >
      <div
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          color: '#fff',
          fontSize: '1.5rem'
        }}
        aria-hidden="true"
      >
        <FiRefreshCw />
      </div>
      <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>{title}</h1>
      <p style={{ margin: 0, color: '#4b5563', maxWidth: '28rem' }}>{message}</p>
      <button
        type="button"
        onClick={() => applyUpdate()}
        style={{
          padding: '0.65rem 1.5rem',
          borderRadius: '8px',
          border: 'none',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          color: '#fff',
          fontWeight: 700,
          fontFamily: 'inherit',
          fontSize: '0.9rem',
          cursor: 'pointer',
          boxShadow: '0 10px 22px rgba(153, 27, 27, 0.3)'
        }}
      >
        Refresh page
      </button>
    </div>
  );
}
