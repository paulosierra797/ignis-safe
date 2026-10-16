import { supabase } from './supabaseClient';
import { readAllRows } from './readAllRows';

// Client for the global Archive & Trash lifecycle. Authorization, retention,
// backup, and dependency checks all run server-side; this module only calls
// the RPCs and the archive-maintenance edge function.

const DATA_CHANGED_EVENT = 'ignis-safe:data-changed';
const DAY_MS = 24 * 60 * 60 * 1000;

export const ARCHIVE_MODULE_ROUTES = {
  announcements: '/dashboard/announcements',
  reports: '/dashboard/reports',
  attendance: '/attendance-admin',
  leave_requests: '/dashboard/accounts',
  profile_change_requests: '/dashboard/accounts',
  visitor_conversations: '/dashboard/visitor-messages',
  mobile_users: '/dashboard/users',
  personnel_accounts: '/dashboard/accounts'
};

const emitDataChanged = (detail = {}) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { scope: 'archive', ...detail } }));
};

const toMessage = (error, fallback) => error?.message || error?.error_description || fallback;

export const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
};

export const getRemainingRecoveryDays = (purgeAfter, now = Date.now()) => {
  const target = new Date(purgeAfter).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.max(0, Math.ceil((target - now) / DAY_MS));
};

// Lifecycle status shown to admins, derived from the registry row.
export const getArchiveItemStatus = (item, now = Date.now()) => {
  if (item.status === 'restored') return { key: 'restored', label: 'Restored' };
  if (item.status === 'purged') return { key: 'purged', label: 'Deleted forever' };
  if (item.purge_state === 'purging') return { key: 'purging', label: 'Deleting now' };
  if (item.purge_state === 'awaiting_files') return { key: 'queued', label: 'Deleting soon' };
  if (item.purge_state === 'blocked') return { key: 'blocked', label: 'On hold' };
  if (new Date(item.purge_after).getTime() <= now) return { key: 'due', label: 'Ready to delete' };
  return item.disposition === 'soft_deleted'
    ? { key: 'soft_deleted', label: 'In Trash' }
    : { key: 'archived', label: 'Archived' };
};

export async function getArchivePolicies() {
  const { data, error } = await supabase
    .from('archive_policies')
    .select('*')
    .order('label');
  if (error) throw new Error(toMessage(error, "Couldn't load settings."));
  return data || [];
}

export async function getArchiveItems({ includeClosed = false } = {}) {
  return readAllRows(() => {
    let query = supabase
      .from('archive_items')
      .select('item_id, module, record_id, record_label, record_context, record_created_at, disposition, reason, actor_type, archived_by_name, archived_at, purge_after, status, storage_objects, purge_state, purge_block_reason, restored_at, restored_by_name, purged_at, purged_by_name, purge_reason')
      .order('archived_at', { ascending: false })
      .order('item_id');
    if (!includeClosed) query = query.eq('status', 'active');
    return query;
  });
}

export async function getArchiveEvents({ limit = 2000 } = {}) {
  return readAllRows(() => supabase
    .from('archive_events')
    .select('event_id, item_id, module, record_id, record_label, event_type, actor_type, actor_name, reason, details, occurred_at')
    .order('occurred_at', { ascending: false })
    .order('event_id', { ascending: false }), limit);
}

export async function getStorageOverview() {
  const { data, error } = await supabase.rpc('get_storage_overview');
  if (error) throw new Error(toMessage(error, "Couldn't load storage use."));
  return data || {};
}

export async function archiveRecord(module, recordId, reason = '') {
  const { data, error } = await supabase.rpc('archive_record', {
    p_module: module,
    p_record_id: String(recordId || ''),
    p_reason: String(reason || '').trim() || null
  });
  if (error) throw new Error(toMessage(error, "Couldn't archive this item."));
  // The database logs and rejects (returns null for) the protected official account.
  if (!data && (module === 'personnel_accounts' || module === 'mobile_users')) {
    throw new Error("This is the main IGNIS SAFE account. It's protected and can't be deleted.");
  }
  emitDataChanged({ action: 'archived', module, recordId });
  return data;
}

export async function restoreArchiveItem(itemId, note = '') {
  const { error } = await supabase.rpc('restore_archive_item', {
    p_item_id: itemId,
    p_note: String(note || '').trim() || null
  });
  if (error) throw new Error(toMessage(error, "Couldn't restore this item."));
  emitDataChanged({ action: 'restored', itemId });
}

// Restores by source record, for modules whose own screens know only the record id.
export async function restoreArchivedRecord(module, recordId, note = '') {
  const { data, error } = await supabase
    .from('archive_items')
    .select('item_id')
    .eq('module', module)
    .eq('record_id', String(recordId || ''))
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(toMessage(error, "Couldn't find this item."));
  if (!data) throw new Error('This item is no longer in Archive & Trash.');
  await restoreArchiveItem(data.item_id, note);
}

const readFunctionError = async (error) => {
  try {
    const payload = await error?.context?.json?.();
    return payload?.error || null;
  } catch {
    return null;
  }
};

// Irreversible. Runs in the archive-maintenance edge function so Storage
// files are removed and verified before the record is deleted.
export async function purgeArchiveItem(itemId, reason) {
  const { data, error } = await supabase.functions.invoke('archive-maintenance', {
    body: { action: 'purge', itemId, reason: String(reason || '').trim() }
  });
  if (error) {
    throw new Error((await readFunctionError(error)) || toMessage(error, "Couldn't delete this item."));
  }
  if (data?.error) throw new Error(data.error);
  emitDataChanged({ action: 'purged', itemId });
  return data?.data || null;
}

export async function updateArchivePolicy(module, { purgeEnabled, retentionDays }) {
  const days = retentionDays === '' || retentionDays == null ? null : Number(retentionDays);
  const { error } = await supabase.rpc('update_archive_policy', {
    p_module: module,
    p_purge_enabled: Boolean(purgeEnabled),
    p_retention_days: Number.isFinite(days) ? Math.round(days) : null
  });
  if (error) throw new Error(toMessage(error, "Couldn't save settings."));
}

export async function confirmArchiveBackup(note = '') {
  const { data, error } = await supabase.rpc('confirm_archive_backup', {
    p_note: String(note || '').trim() || null
  });
  if (error) throw new Error(toMessage(error, "Couldn't confirm the backup."));
  return data;
}
