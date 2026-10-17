import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { FiMaximize2, FiX } from 'react-icons/fi';
import { useUser } from '../context/UserContext';
import {
  cancelImportJob,
  consumeImportModalRequest,
  dismissImportJob,
  isImportJobActive,
  loadActiveImportJob,
  requestImportModalOpen,
  useImportJob
} from '../utils/personnelImportJobs';
import './ImportProgressWidget.css';

const ACCOUNTS_PATH = '/dashboard/accounts';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function WidgetCard({ job }) {
  const navigate = useNavigate();
  const cardRef = useRef(null);
  const barRef = useRef(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = isImportJobActive(job);
  const percent = job.total ? Math.floor((job.processed / job.total) * 100) : 0;
  const title = active
    ? (job.status === 'cancelling' ? 'Stopping import…' : 'Creating accounts')
    : job.status === 'cancelled' ? 'Import cancelled'
      : job.status === 'lost' ? 'Import status unavailable'
        : 'Import complete';

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const tween = gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 28, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out' }
    );
    return () => tween.kill();
  }, []);

  useEffect(() => {
    if (!barRef.current) return;
    if (prefersReducedMotion()) barRef.current.style.width = `${percent}%`;
    else gsap.to(barRef.current, { width: `${percent}%`, duration: 0.5, ease: 'power2.out', overwrite: true });
  }, [percent]);

  const open = () => {
    requestImportModalOpen();
    navigate(ACCOUNTS_PATH);
  };

  const confirmCancel = async () => {
    setBusy(true);
    setError('');
    try {
      await cancelImportJob();
      setConfirming(false);
    } catch (cancelError) {
      setError(cancelError?.message || 'The cancellation request failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="iw-card" ref={cardRef} aria-label="Personnel import progress">
      <div className="iw-head">
        <p className="iw-title">{title}</p>
        {active ? (
          <span className="iw-percent">{percent}%</span>
        ) : (
          <button type="button" className="iw-icon-btn" onClick={dismissImportJob} aria-label="Dismiss import summary">
            <FiX aria-hidden="true" />
          </button>
        )}
      </div>

      {active && (
        <div className="iw-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Import progress">
          <div className="iw-bar-fill" ref={barRef} />
        </div>
      )}

      <p className="iw-meta" role="status">
        {active && <strong>{job.processed}/{job.total}</strong>}
        {active && ' · '}
        {job.created} created · {job.failed} failed
        {!active && job.cancelled > 0 && ` · ${job.cancelled} not created`}
      </p>

      {error && <p className="iw-error" role="alert">{error}</p>}

      {confirming ? (
        <div className="iw-confirm" role="alertdialog" aria-label="Cancel import">
          <p>Accounts already created are kept. Records not yet started won&apos;t be created.</p>
          <div className="iw-actions">
            <button type="button" className="iw-btn" autoFocus onClick={() => setConfirming(false)} disabled={busy}>Keep importing</button>
            <button type="button" className="iw-btn iw-btn-danger" onClick={confirmCancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Yes, cancel'}
            </button>
          </div>
        </div>
      ) : (
        <div className="iw-actions">
          {active && (
            <button
              type="button"
              className="iw-btn iw-btn-quiet"
              onClick={() => setConfirming(true)}
              disabled={job.status === 'cancelling'}
            >
              Cancel Import
            </button>
          )}
          <button type="button" className="iw-btn iw-btn-primary" onClick={open}>
            <FiMaximize2 aria-hidden="true" /> {active ? 'Expand' : 'View summary'}
          </button>
        </div>
      )}
    </aside>
  );
}

// Floats bottom-right on every admin page while a bulk import is minimized or finished.
export default function ImportProgressWidget() {
  const { currentUser } = useUser();
  const { job, modalOpen } = useImportJob();
  const isAdmin = String(currentUser?.role || '').toLowerCase() === 'admin';

  // After a page reload, pick up an import the server is still running.
  useEffect(() => {
    if (isAdmin) loadActiveImportJob();
  }, [isAdmin]);

  // A stale "open the dialog" request must not fire later if the import is gone.
  useEffect(() => {
    if (!job) consumeImportModalRequest();
  }, [job]);

  if (!isAdmin || !job || modalOpen) return null;
  return <WidgetCard job={job} />;
}
