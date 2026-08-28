import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { isChunkLoadError, reloadOnceForStaleChunk } from '../utils/lazyWithRetry';
import { hardReloadToLatest, returnToRoleHome } from '../utils/appRecovery';

// Last-resort net for errors that reach the router itself (e.g. a failure
// during initial route resolution) rather than being handled by the in-app
// AppErrorBoundary. A failed dynamic import here is still just a stale chunk
// from a recent deploy, so we heal it with one guarded hard reload instead of
// dead-ending. Anything else - or a chunk error that survived the reload -
// falls through to the friendly manual-retry screen.
export default function RouteErrorBoundary() {
  const error = useRouteError();
  const chunkError = !isRouteErrorResponse(error) && isChunkLoadError(error);

  useEffect(() => {
    if (chunkError) {
      // Returns false if a reload was already attempted for this - then we
      // just show the screen below rather than looping.
      reloadOnceForStaleChunk();
    }
  }, [chunkError]);

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
        {chunkError ? <FiRefreshCw /> : <FiAlertCircle />}
      </div>
      <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>
        {chunkError ? 'Update available' : 'Something went wrong'}
      </h1>
      <p style={{ margin: 0, color: '#4b5563', maxWidth: '28rem' }}>
        {chunkError
          ? 'A newer version of this app was just released. Refresh to load the latest version.'
          : 'This page could not be opened. Return to the home page and try again.'}
      </p>
      <button
        type="button"
        onClick={() => { void (chunkError ? hardReloadToLatest() : returnToRoleHome()); }}
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
          position: 'relative',
          zIndex: 1,
          touchAction: 'manipulation',
          boxShadow: '0 10px 22px rgba(153, 27, 27, 0.3)'
        }}
      >
        {chunkError ? 'Refresh page' : 'Return to home'}
      </button>
    </div>
  );
}
