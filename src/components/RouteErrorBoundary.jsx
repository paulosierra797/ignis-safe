import { FiAlertCircle } from 'react-icons/fi';

// Replaces React Router's default development-style error output with a
// user-facing fallback for genuine route failures.
export default function RouteErrorBoundary() {
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
        <FiAlertCircle />
      </div>
      <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>Something went wrong</h1>
      <p style={{ margin: 0, color: '#4b5563', maxWidth: '28rem' }}>
        This page could not be opened. Return to the home page and try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.replace('/')}
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
        Return to home
      </button>
    </div>
  );
}
