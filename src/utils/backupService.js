import { supabase } from './supabaseClient';

// Client for Backup & Recovery. Creating, downloading, and restoring backups
// all run in the backup-recovery edge function, which checks that the caller is
// an active Super Admin. Backup files never pass through the browser unless
// they are downloaded, and then only through short-lived private links.

const STALE_MINUTES = 45;

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
  'restore_completed_at', 'restored_by_name', 'restore_summary'
].join(', ');

// A run that stopped without reporting back should not look "in progress" forever.
export const isStaleRun = (startedAt) => Date.now() - new Date(startedAt).getTime() > STALE_MINUTES * 60 * 1000;

export async function getBackups() {
  const { data, error } = await supabase
    .from('system_backups')
    .select(BACKUP_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(toMessage(error, "Couldn't load backups."));
  return data || [];
}

export async function createBackup(note = '') {
  return callBackupFunction({ action: 'create', note: String(note || '').trim() }, "Couldn't start the backup.");
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
