import { Component } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import { isChunkLoadError } from '../utils/lazyWithRetry';
import { returnToRoleHome } from '../utils/appRecovery';
import ChunkErrorFallback from './ChunkErrorFallback';

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

const buttonStyle = {
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

// Catches render errors thrown *inside* the routed page tree so a single
// failing page (a crashed widget, a component that assumed data an API did
// not return) shows a local, recoverable message instead of unmounting the
// whole app - providers, session and all - into the router's top-level error
// screen. A stale-chunk failure from a deploy is delegated to
// ChunkErrorFallback, which verifies a newer deployment exists before
// reloading. `resetKey` (the current pathname) clears the error when the user
// navigates away, so a transient failure on one page does not strand the whole
// session.
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (!isChunkLoadError(error)) {
      console.error('AppErrorBoundary caught an error:', error);
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (isChunkLoadError(error)) {
      return <ChunkErrorFallback onRetryInPlace={this.handleRetry} />;
    }

    return (
      <div style={wrapStyle} role="alert">
        <div style={iconStyle} aria-hidden="true">
          <FiAlertCircle />
        </div>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>
          This page ran into a problem
        </h1>
        <p style={{ margin: 0, color: '#4b5563', maxWidth: '28rem' }}>
          Something went wrong while displaying this page. Your session is still active - try again, or head back to a page that works.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={this.handleRetry} style={buttonStyle}>
            Try again
          </button>
          <button
            type="button"
            onClick={() => { void returnToRoleHome(); }}
            style={{ ...buttonStyle, background: '#fff', color: '#991b1b', border: '1px solid #f3c9c9', boxShadow: 'none' }}
          >
            Return to home
          </button>
        </div>
      </div>
    );
  }
}
