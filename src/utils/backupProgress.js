import { useEffect, useState } from 'react';

// Reads the progress the backup service saves after each real step. Nothing here is
// simulated: the only local counting is the clock (elapsed time, countdown to the estimate).

// No new progress for this long means the last step probably stopped.
const STALL_MS = 60 * 1000;
// An estimate needs this much measured work first.
const ETA_MIN_WORK_MS = 20 * 1000;
const ETA_MIN_SHARE = 0.03;
const ETA_MIN_STEPS = 3;

export const progressOf = (kind, backup) => (kind === 'restore' ? backup?.restore_progress : backup?.progress) || {};

// Share of real work done, 0–99 while running (100 is shown only once it is verified and saved).
export const percentOf = (progress) => {
  const total = Number(progress?.total_bytes) || 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(99, Math.floor((Number(progress.done_bytes) || 0) * 100 / total)));
};

export const formatDuration = (ms) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

export const formatClock = (ms) => new Date(ms).toLocaleTimeString('en-PH', {
  timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit'
});

export function useNow(intervalMs = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}

// Turns the saved progress into what the admin sees.
export function readProgress(kind, backup, jobs, now) {
  const progress = progressOf(kind, backup);
  const total = Number(progress.total_bytes) || 0;
  const done = Math.min(Number(progress.done_bytes) || 0, total);
  const offset = jobs.clockOffset || 0;
  const startedAt = kind === 'restore' ? backup.restore_started_at : backup.started_at;
  const elapsedMs = Math.max(0, now - (new Date(startedAt).getTime() + offset));

  // Estimate from the measured rate since the real work began, only once enough is measured.
  let finishAt = null;
  const workStart = progress.work_started_at ? new Date(progress.work_started_at).getTime() : 0;
  const updated = progress.updated_at ? new Date(progress.updated_at).getTime() : 0;
  const workMs = updated - workStart;
  if (workStart && updated && total > 0 && done > 0 && done < total
    && workMs >= ETA_MIN_WORK_MS && done / total >= ETA_MIN_SHARE && Number(progress.step) >= ETA_MIN_STEPS) {
    finishAt = updated + (total - done) / (done / workMs) + offset;
  }

  const beat = jobs.heartbeats?.[`${kind}:${backup.backup_id}`];
  const quietMs = beat ? now - beat.at : 0;
  return {
    progress,
    percent: percentOf(progress),
    elapsedMs,
    finishAt,
    remainingMs: finishAt === null ? null : finishAt - now,
    quietMs,
    stalled: quietMs >= STALL_MS,
  };
}

