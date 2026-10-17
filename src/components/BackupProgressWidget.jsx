import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { FiAlertTriangle, FiCheckCircle, FiDownload, FiHardDrive, FiMinus, FiRotateCcw, FiX } from 'react-icons/fi';
import { useUser } from '../context/UserContext';
import {
  dismissBackupWidget, onBackupFinished, resumeJob, retryBackup, setBackupMinimized, useBackupJobs, watchBackups
} from '../utils/backupJobs';
import { downloadBackup } from '../utils/backupService';
import { formatBytes } from '../utils/archiveService';
import BackupProgressView from './BackupProgressView';
import { formatDuration, readProgress, useNow } from '../utils/backupProgress';
import ToastMessage from './ToastMessage';
import './BackupProgressWidget.css';

const ARCHIVE_PATH = '/dashboard/archive-trash';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function WidgetCard({ running, finished, minimized }) {
  const navigate = useNavigate();
  const jobs = useBackupJobs();
  const cardRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');

  const mode = finished ? finished.status : 'running';
  const view = `${mode}:${minimized}`;
  const now = useNow(1000, mode === 'running');
  const live = mode === 'running' ? readProgress('backup', running, jobs, now) : null;

  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const tween = gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 24, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power3.out', clearProps: 'transform,opacity' }
    );
    return () => tween.kill();
  }, [view]);

  // Success clears itself; a failure stays until it has been read.
  useEffect(() => {
    if (mode !== 'success') return undefined;
    const timer = window.setTimeout(dismissBackupWidget, 20000);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const run = async (kind, action) => {
    setBusy(kind);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy('');
    }
  };

  const open = () => navigate(ARCHIVE_PATH, { state: { tab: 'settings', at: Date.now() } });

  if (minimized && mode === 'running') {
    return (
      <aside className="bw-root">
        <button
          type="button"
          ref={cardRef}
          className={`bw-pill${live.stalled ? ' bw-pill--stalled' : ''}`}
          onClick={() => setBackupMinimized(false)}
          aria-label={`Backup ${live.percent}% done${live.stalled ? ', needs attention' : ''}. Expand details`}
        >
          {live.stalled ? <FiAlertTriangle className="bw-pill-warn" aria-hidden="true" /> : <span className="bw-spinner" aria-hidden="true" />}
          <span className="bw-pill-text">Backup {live.percent}%</span>
          <span className="bw-time">{formatDuration(live.elapsedMs)}</span>
        </button>
      </aside>
    );
  }

  const title = mode === 'running'
    ? (live.stalled ? 'Backup needs attention' : 'Creating your backup')
    : mode === 'success' ? 'Backup ready' : "Backup didn't finish";
  const Icon = mode === 'success' ? FiCheckCircle : mode === 'failed' || live?.stalled ? FiAlertTriangle : FiHardDrive;
  const cardTone = mode === 'running' && live.stalled ? 'stalled' : mode;

  return (
    <aside className="bw-root">
      <div className={`bw-card bw-card--${cardTone}`} ref={cardRef} aria-label="Backup progress">
        <div className="bw-head">
          <span className="bw-icon" aria-hidden="true"><Icon /></span>
          <button type="button" className="bw-main" onClick={open} aria-label={`${title}. View backup details`}>
            <span className="bw-title">{title}</span>
            <span className="bw-detail">
              {mode === 'running' && 'Safe to leave this page. It keeps running.'}
              {mode === 'success' && `Verified · ${formatBytes(finished.size)} · ready to download`}
              {mode === 'failed' && 'Nothing was saved. Your data is unchanged.'}
            </span>
          </button>
          {mode === 'running' && (
            <button type="button" className="bw-icon-btn" onClick={() => setBackupMinimized(true)} aria-label="Minimize backup progress">
              <FiMinus aria-hidden="true" />
            </button>
          )}
          <button type="button" className="bw-icon-btn" onClick={dismissBackupWidget} aria-label="Dismiss backup progress">
            <FiX aria-hidden="true" />
          </button>
        </div>

        {mode === 'running' && (
          <BackupProgressView
            compact
            backup={running}
            onResume={() => run('resume', () => resumeJob(running.backup_id))}
            resuming={busy === 'resume'}
            resumeError={actionError}
          />
        )}

        {mode === 'failed' && (
          <>
            <p className="bw-error" role="alert">{finished.error || 'The backup stopped before it finished.'}</p>
            {actionError && <p className="bw-error">{actionError}</p>}
            <div className="bw-actions">
              <button type="button" className="bw-btn bw-btn--primary" onClick={() => run('retry', () => retryBackup(finished.note))} disabled={Boolean(busy)}>
                <FiRotateCcw aria-hidden="true" /> {busy === 'retry' ? 'Starting…' : 'Try again'}
              </button>
              <button type="button" className="bw-btn" onClick={open}>Details</button>
            </div>
          </>
        )}

        {mode === 'success' && (
          <>
            {actionError && <p className="bw-error" role="alert">{actionError}</p>}
            <div className="bw-actions">
              <button type="button" className="bw-btn bw-btn--primary" onClick={() => run('download', () => downloadBackup(finished.id))} disabled={Boolean(busy)}>
                <FiDownload aria-hidden="true" /> {busy === 'download' ? 'Preparing…' : 'Download'}
              </button>
              <button type="button" className="bw-btn" onClick={open}>View history</button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// Floats bottom-right on every page while a backup runs, and reports how it ended.
export default function BackupProgressWidget() {
  const { isSuperAdmin } = useUser();
  const { running, finished, minimized, dismissedId } = useBackupJobs();
  const [toast, setToast] = useState({ type: '', text: '' });

  useEffect(() => (isSuperAdmin ? watchBackups() : undefined), [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    return onBackupFinished((result) => setToast(result.status === 'success'
      ? { type: 'success', text: 'Backup created and verified. It is ready to download.' }
      : { type: 'error', text: `The backup didn't finish. ${result.error}`.trim() }));
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;
  const showRunning = running && running.backup_id !== dismissedId;

  return (
    <>
      <ToastMessage message={toast.text} type={toast.type || 'info'} />
      {(finished || showRunning) && <WidgetCard running={running} finished={finished} minimized={minimized} />}
    </>
  );
}
