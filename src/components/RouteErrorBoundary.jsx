import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import {
  isChunkLoadError,
  hasAlreadyAttemptedReload,
  markReloadAttempted
} from '../utils/chunkErrorRecovery';

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
      window.location.reload();
    }
  }, [willAutoReload]);

  if (willAutoReload) {
    return null;
  }

  const title = chunkError ? 'Update available' : 'Something went wrong';
  const message = chunkError
    ? 'A new version of this app was just deployed. Please refresh the page to load the latest version.'
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
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{title}</h1>
      <p style={{ margin: 0, color: '#555', maxWidth: '28rem' }}>{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '0.6rem 1.4rem',
          borderRadius: '8px',
          border: 'none',
          background: '#dc2626',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        Refresh page
      </button>
    </div>
  );
}
