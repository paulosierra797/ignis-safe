import { useEffect, useState } from 'react';
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { planChunkErrorRecovery } from '../utils/deployVersion';
import { hardReloadToLatest, returnToRoleHome } from '../utils/appRecovery';

const wrapStyle = {
  minHeight: '60vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  padding: '2rem',
  textAlign: 'center',
  fontFamily: 'inherit'
};

const iconStyle = {
  display: 'inline-grid',
  placeItems: 'center',
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
  color: '#fff',
  fontSize: '1.5rem'
};

const primaryButtonStyle = {
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
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: '#fff',
  color: '#991b1b',
  border: '1px solid #f3c9c9',
  boxShadow: 'none'
};

// Shown when a lazy route/component chunk fails to load. Before deciding what
// to tell the user, it checks /version.json (planChunkErrorRecovery):
//
//   - 'reload'           -> a genuinely newer deployment exists and we have not
//                           auto-reloaded yet: hard-reload once, preserving the
//                           current route.
//   - 'update-available' -> newer deployment, but we already auto-reloaded once
//                           this build: show the manual "Update available"
//                           screen. No further automatic reload.
//   - 'load-failed'      -> no newer deployment: a transient/asset load failure,
//                           not a deploy. Offer a plain retry - never a reload
//                           loop, never the "Update available" wording.
//
// `onRetryInPlace`, when provided (AppErrorBoundary), lets "Try again" reset the
// boundary and re-attempt the import without a full document reload.
export default function ChunkErrorFallback({ onRetryInPlace }) {
  const [phase, setPhase] = useState('checking');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let plan = 'load-failed';
      try {
        plan = await planChunkErrorRecovery();
      } catch {
        plan = 'load-failed';
      }
      if (cancelled) return;

      if (plan === 'reload') {
        setPhase('updating');
        await hardReloadToLatest();
        return;
      }
      setPhase(plan === 'update-available' ? 'update-available' : 'load-failed');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'checking' || phase === 'updating') {
    return (
      <div style={wrapStyle} role="status" aria-label="Loading the latest version">
        <div style={{ ...iconStyle, animation: 'none' }} aria-hidden="true">
          <FiRefreshCw />
        </div>
        <p style={{ margin: 0, color: '#4b5563', maxWidth: '28rem' }}>
          {phase === 'updating'
            ? 'Loading the latest version…'
            : 'Checking for updates…'}
        </p>
      </div>
    );
  }

  const isUpdate = phase === 'update-available';

  return (
    <div style={wrapStyle} role="alert">
      <div style={iconStyle} aria-hidden="true">
        {isUpdate ? <FiRefreshCw /> : <FiAlertCircle />}
      </div>
      <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>
        {isUpdate ? 'Update available' : 'This page didn’t load'}
      </h1>
      <p style={{ margin: 0, color: '#4b5563', maxWidth: '28rem' }}>
        {isUpdate
          ? 'A newer version of this app was just released. Refresh to load the latest version.'
          : 'Something interrupted loading this page. Your session is still active — try again, or head back to a page that works.'}
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => {
            if (isUpdate) {
              void hardReloadToLatest();
            } else if (onRetryInPlace) {
              onRetryInPlace();
            } else {
              window.location.reload();
            }
          }}
          style={primaryButtonStyle}
        >
          {isUpdate ? 'Refresh page' : 'Try again'}
        </button>
        <button
          type="button"
          onClick={() => { void returnToRoleHome(); }}
          style={secondaryButtonStyle}
        >
          Return to home
        </button>
      </div>
    </div>
  );
}
