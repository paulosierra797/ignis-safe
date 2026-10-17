import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { FiAlertTriangle, FiCheck, FiRefreshCw } from 'react-icons/fi';
import { useBackupJobs } from '../utils/backupJobs';
import { formatClock, formatDuration, readProgress, useNow } from '../utils/backupProgress';
import './BackupProgressView.css';

// Live progress for a backup or restore. Everything shown comes from the progress
// the backup service saves after each real step; nothing here is simulated. The
// only local counting is the clock (elapsed time and the countdown to the estimate).

const BACKUP_STAGES = [
  { key: 'prepare', label: 'Prepare' },
  { key: 'records', label: 'Records' },
  { key: 'files', label: 'Files' },
  { key: 'encrypt', label: 'Encrypt' },
  { key: 'verify', label: 'Verify' },
];
const STAGE_ORDER = { prepare: 0, records: 1, files: 2, finish: 3, verify: 4, done: 5 };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const count = (value) => Number(value || 0).toLocaleString('en-PH');

const partOf = (progress) => {
  const total = Number(progress.parts_total) || 0;
  return total ? ` · part ${count(Math.min(Number(progress.parts_done || 0) + 1, total))} of ${count(total)}` : '';
};

const activityText = (kind, progress) => {
  if (kind === 'restore') {
    if (progress.activity === 'restoring') return `Adding back missing data${partOf(progress)}`;
    if (progress.activity === 'completing') return 'Finishing up';
    return `Checking the backup${partOf(progress)}`;
  }
  switch (progress.activity) {
    case 'records':
      return `Saving records · ${count(progress.tables_done)} of ${count(progress.tables_total)} tables`;
    case 'files':
      return `Backing up files · ${count(progress.files_done)} of ${count(progress.files_total)}`;
    case 'encrypting':
      return `Encrypting and saving part ${count(Number(progress.parts_written || 0) + 1)}`;
    case 'verifying':
      return `Verifying the saved copy${partOf(progress)}`;
    case 'completing':
      return 'Finishing up';
    default:
      return 'Preparing data';
  }
};

const stageState = (stage, progress) => {
  const at = STAGE_ORDER[progress.stage] ?? 0;
  if (stage.key === 'encrypt') {
    if (at >= STAGE_ORDER.verify) return 'done';
    return progress.stage === 'finish' || progress.activity === 'encrypting' ? 'active' : 'pending';
  }
  const own = STAGE_ORDER[stage.key];
  if (at > own) return 'done';
  return at === own ? 'active' : 'pending';
};

const timeLeftText = (remainingMs) => {
  if (remainingMs === null) return 'Estimating…';
  if (remainingMs <= 0) return 'Almost done';
  if (remainingMs < 60 * 1000) return 'Under 1 min';
  return `About ${Math.ceil(remainingMs / 60000)} min`;
};

export default function BackupProgressView({ kind = 'backup', backup, compact = false, onResume, resuming = false, resumeError = '' }) {
  const jobs = useBackupJobs();
  const now = useNow();
  const info = readProgress(kind, backup, jobs, now);
  const { progress, percent } = info;
  const fillRef = useRef(null);
  const numberRef = useRef(null);
  const shown = useRef({ value: percent });
  const activity = activityText(kind, progress);
  const activityRef = useRef(null);

  // The bar and number glide between real values; they never move on their own.
  useLayoutEffect(() => {
    const fill = fillRef.current;
    const number = numberRef.current;
    if (!fill || !number) return undefined;
    const render = () => { number.textContent = String(Math.round(shown.current.value)); };
    if (prefersReducedMotion()) {
      gsap.set(fill, { scaleX: percent / 100 });
      shown.current.value = percent;
      render();
      return undefined;
    }
    const tweens = [
      gsap.to(fill, { scaleX: percent / 100, duration: 0.9, ease: 'power3.out' }),
      gsap.to(shown.current, { value: percent, duration: 0.9, ease: 'power3.out', onUpdate: render }),
    ];
    return () => tweens.forEach((tween) => tween.kill());
  }, [percent]);

  useLayoutEffect(() => {
    if (prefersReducedMotion() || !activityRef.current) return undefined;
    const tween = gsap.fromTo(activityRef.current, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' });
    return () => tween.kill();
  }, [activity]);

  return (
    <div className={`bpv${compact ? ' bpv--compact' : ''}${info.stalled ? ' bpv--stalled' : ''}`}>
      <div className="bpv-top">
        <p className="bpv-activity" aria-live="polite">
          <span className="bpv-live" aria-hidden="true" />
          <span ref={activityRef}>{activity}</span>
        </p>
        <span className="bpv-percent" aria-hidden="true"><span ref={numberRef}>{percent}</span>%</span>
      </div>

      <div
        className="bpv-track"
        role="progressbar"
        aria-label={kind === 'restore' ? 'Restore progress' : 'Backup progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% · ${activity}`}
      >
        <span className="bpv-fill" ref={fillRef} />
      </div>

      {kind === 'backup' && (
        <ol className="bpv-stages" aria-label="Backup steps">
          {BACKUP_STAGES.map((stage) => {
            const state = stageState(stage, progress);
            return (
              <li key={stage.key} className={`bpv-stage bpv-stage--${state}`}>
                <span className="bpv-dot" aria-hidden="true">{state === 'done' && <FiCheck />}</span>
                <span>{stage.label}</span>
                <span className="bpv-sr">{state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : ''}</span>
              </li>
            );
          })}
        </ol>
      )}

      <dl className="bpv-meta">
        <div>
          <dt>Elapsed</dt>
          <dd>{formatDuration(info.elapsedMs)}</dd>
        </div>
        <div title={info.finishAt === null ? 'Shown once enough real progress has been measured.' : undefined}>
          <dt>Time left</dt>
          <dd className={info.finishAt === null ? 'bpv-muted' : ''}>{timeLeftText(info.remainingMs)}</dd>
        </div>
        <div>
          <dt>Done by</dt>
          <dd className={info.finishAt === null ? 'bpv-muted' : ''}>{info.finishAt === null ? '—' : formatClock(info.finishAt)}</dd>
        </div>
      </dl>

      {info.stalled && (
        <div className="bpv-stall" role="alert">
          <FiAlertTriangle aria-hidden="true" />
          <p>
            <strong>No progress for {formatDuration(info.quietMs)}.</strong>
            <span>The last step may have stopped. Continuing picks up from the last saved step. Nothing is lost.</span>
            {resumeError && <span className="bpv-error">{resumeError}</span>}
          </p>
          {onResume && (
            <button type="button" className="bpv-btn" onClick={onResume} disabled={resuming}>
              <FiRefreshCw aria-hidden="true" className={resuming ? 'bpv-spin' : ''} /> {resuming ? 'Continuing…' : 'Continue'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
