import { useSyncExternalStore } from 'react';
import { createBackup, getBackups, resumeBackupJob } from './backupService';

// Watches the real system_backups rows so backup progress survives tab switches,
// page navigation and refreshes. The backup itself runs in the edge function; this
// module only reads the progress it reports. It lives outside React for that reason.

const POLL_MS = 3000;

export const isRunningBackup = (backup) => backup?.status === 'running';
export const isRunningRestore = (backup) => backup?.restore_status === 'running';

let state = {
  backups: [], loaded: false, loadError: '', running: null, finished: null, minimized: false, dismissedId: '',
  // When each run's progress last changed, by this computer's clock (so a wrong clock never looks like a stall).
  heartbeats: {},
  // This computer's clock minus the server's, learned from progress updates as they arrive.
  clockOffset: 0,
  offsetKnown: false,
};
let timer = null;
let watchers = 0;
let loading = null;
let previous = null;
const listeners = new Set();
const finishListeners = new Set();

const emit = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

const schedule = () => {
  window.clearTimeout(timer);
  timer = null;
  const working = state.backups.some((backup) => isRunningBackup(backup) || isRunningRestore(backup));
  if (watchers > 0 && working) timer = window.setTimeout(refreshBackups, POLL_MS);
};

// Notes when each running job last reported, and learns the server clock offset
// from updates seen arriving (the smallest gap is closest to the real offset).
const trackHeartbeats = (backups) => {
  const now = Date.now();
  const heartbeats = {};
  let offset = state.clockOffset;
  let { offsetKnown } = state;
  backups.forEach((backup) => {
    [['backup', isRunningBackup(backup) && backup.progress], ['restore', isRunningRestore(backup) && backup.restore_progress]]
      .forEach(([kind, progress]) => {
        if (!progress) return;
        const key = `${kind}:${backup.backup_id}`;
        const stamp = progress.updated_at || '';
        const seen = state.heartbeats[key];
        if (seen && seen.stamp === stamp) {
          heartbeats[key] = seen;
          return;
        }
        heartbeats[key] = { stamp, at: now };
        if (seen && stamp) {
          const gap = now - new Date(stamp).getTime();
          offset = offsetKnown ? Math.min(offset, gap) : gap;
          offsetKnown = true;
        }
      });
  });
  return { heartbeats, clockOffset: offset, offsetKnown };
};

export function refreshBackups() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const backups = await getBackups();
      const statuses = new Map(backups.map((backup) => [backup.backup_id, backup.status]));
      const running = backups.find(isRunningBackup) || null;
      const patch = { backups, loaded: true, loadError: '', running, ...trackHeartbeats(backups) };

      // Only a run this tab saw in progress counts as "finished", so old rows never raise a notice.
      if (previous) {
        const ended = backups.find((backup) => previous.get(backup.backup_id) === 'running' && backup.status !== 'running');
        if (ended) {
          patch.finished = {
            id: ended.backup_id,
            status: ended.status === 'completed' ? 'success' : 'failed',
            error: ended.error || '',
            size: ended.size_bytes || 0,
            note: ended.note || '',
          };
          patch.minimized = false;
          patch.dismissedId = '';
          finishListeners.forEach((listener) => listener(patch.finished));
        }
      }
      previous = statuses;
      if (running && state.running?.backup_id !== running.backup_id) {
        patch.minimized = false;
        patch.dismissedId = '';
        patch.finished = null;
      }
      emit(patch);
    } catch (error) {
      emit({ loadError: error.message, loaded: true });
    } finally {
      loading = null;
      schedule();
    }
  })();
  return loading;
}

// Starts watching while a consumer is mounted. Returns a function that stops it.
export function watchBackups() {
  watchers += 1;
  if (watchers === 1) refreshBackups();
  else schedule();
  return () => {
    watchers -= 1;
    if (watchers === 0) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}

export const onBackupFinished = (listener) => {
  finishListeners.add(listener);
  return () => finishListeners.delete(listener);
};

export const setBackupMinimized = (minimized) => emit({ minimized });
export const dismissBackupWidget = () => emit({ dismissedId: state.running?.backup_id || state.finished?.id || '', finished: null });

// Starts a new backup after one failed. A new backup always starts from the beginning.
export async function retryBackup(note = '') {
  await createBackup(note);
  emit({ finished: null, dismissedId: '' });
  await refreshBackups();
}

// Continues a stalled run from its last saved step.
export async function resumeJob(backupId) {
  const result = await resumeBackupJob(backupId);
  await refreshBackups();
  return result;
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useBackupJobs = () => useSyncExternalStore(subscribe, () => state);
