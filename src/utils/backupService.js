import { supabase } from './supabaseClient';

// Client for Backup & Recovery. Creating, downloading, and restoring backups
// all run in the backup-recovery edge function, which checks that the caller is
// an active Super Admin. Backup files never pass through the browser unless
// they are downloaded, and then only through short-lived private links.

const toMessage = (error, fallback) => error?.message || error?.error_description || fallback;

const readFunctionError = async (error) => {
  try {
    const payload = await error?.context?.json?.();
    return payload?.error || null;
  } catch {
    return null;
  }
};

async function callBackupFunction(body, fallback) {
  const { data, error } = await supabase.functions.invoke('backup-recovery', { body });
  if (error) throw new Error((await readFunctionError(error)) || toMessage(error, fallback));
  if (data?.error) throw new Error(data.error);
  return data;
}

const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export const BACKUP_COLUMNS = [
  'backup_id', 'kind', 'status', 'created_by_name', 'note', 'started_at', 'completed_at', 'verified_at',
  'size_bytes', 'contents', 'storage_location', 'error', 'restore_status', 'restore_started_at',
  'restore_completed_at', 'restored_by_name', 'restore_summary', 'progress', 'restore_progress'
].join(', ');

export async function getBackups() {
  // Marks runs that stopped reporting as failed first, so nothing looks busy forever.
  await supabase.rpc('backup_expire_stalled');
  const { data, error } = await supabase
    .from('system_backups')
    .select(BACKUP_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(toMessage(error, "Couldn't load backups."));
  return data || [];
}

export const isEncryptionSetupError = (message) => /encryption is not set up/i.test(message || '');

// Asks the backend whether the encryption key is configured (never returns the key).
// Resolves to null when it can't be determined, so callers keep the current state.
export async function checkEncryptionReady() {
  try {
    const data = await callBackupFunction({ action: 'status' }, "Couldn't check the setup.");
    return typeof data?.data?.encryptionReady === 'boolean' ? data.data.encryptionReady : null;
  } catch {
    return null;
  }
}

export async function createBackup(note = '') {
  return callBackupFunction({ action: 'create', note: String(note || '').trim() }, "Couldn't start the backup.");
}

// Continues a backup or restore whose last step stopped without reporting back.
export async function resumeBackupJob(backupId) {
  const data = await callBackupFunction({ action: 'resume', backupId }, "Couldn't continue.");
  return data?.data || {};
}

export async function restoreBackup(backupId) {
  return callBackupFunction({ action: 'restore', backupId, confirm: 'RESTORE' }, "Couldn't start the restore.");
}

// The backup is stored in a few encrypted parts; joined in order they form one file.
export async function downloadBackup(backupId) {
  const data = await callBackupFunction({ action: 'download', backupId }, "Couldn't prepare the download.");
  const blobs = [];
  for (const part of data.data.parts) {
    const response = await fetch(part.url);
    if (!response.ok) throw new Error("Couldn't download the backup. Please try again.");
    blobs.push(await response.blob());
  }
  saveBlob(new Blob(blobs, { type: 'application/octet-stream' }), data.data.filename);
}

export async function downloadRecordsCsv() {
  const { data, error } = await supabase.functions.invoke('backup-recovery', { body: { action: 'csv' } });
  if (error) throw new Error((await readFunctionError(error)) || toMessage(error, "Couldn't export the records."));
  if (!(data instanceof Blob)) throw new Error((data && data.error) || "Couldn't export the records.");
  saveBlob(data, `ignis-safe-records-${new Date().toISOString().slice(0, 10)}.zip`);
}
