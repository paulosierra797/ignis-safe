import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import * as zlib from 'node:zlib';
import { corsHeaders } from '../_shared/cors.ts';

// Backup & Recovery for the Super Admin Archive & Trash page.
//
// A backup is a ZIP (manifest, database records as JSON, uploaded files) that
// is stored as encrypted parts in the private `system-backups` bucket.
//
// An edge function request gets about 2 seconds of CPU, which is far less than
// a whole backup needs. So backups and restores run as a chain of short steps:
// each step writes (or checks) one part, saves its place in system_backups.job,
// reports what it really did in `progress` / `restore_progress`, then calls the
// next step. A step that dies leaves the saved place untouched, so the run can
// be resumed; a run that stops reporting is marked failed by the database.
//
// A backup is reported complete only after every part has been downloaded
// again, hash-checked, decrypted, and read back as valid ZIP entries
// (verifyPart), and the database has confirmed the parts exist (backup_complete).
// Restores check every part first, then only add what is missing.
//
// Part format: [IGNISBK2][part index u32][salt] then frames of
// [u32 length | flags][AES-256-GCM data][tag]. Each part has its own key (HKDF
// of the master key and the part's random salt). The part index and frame
// header are authenticated, the last frame of each part is flagged, and the
// last frame of the whole backup has a second flag, so parts cannot be
// swapped, cut short, or reordered. Parts end on ZIP entry boundaries, so the
// decrypted parts joined in order form one standard ZIP.
//
// Callers:
//   * scheduled: the monthly pg_cron job, authenticated by a vault token.
//   * step: this function calling itself, authenticated by the job's token.
//   * create / resume / download / csv / restore / status: a signed-in Super Admin.

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SELF_URL = `${SUPABASE_URL}/functions/v1/backup-recovery`;

const BUCKET = 'system-backups';
const MAGIC = Buffer.from('IGNISBK2');
const SALT_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 4 + SALT_LENGTH;
const TAG_LENGTH = 16;
const FRAME_SIZE = 1024 * 1024;
const PART_END = 0x80000000;
const BACKUP_END = 0x40000000;
const LENGTH_MASK = 0x3FFFFFFF;
const TABLE_PAGE_SIZE = 500;
const MAX_DATABASE_BYTES = 100 * 1024 * 1024;
const RESTORE_CHUNK_BYTES = 2 * 1024 * 1024;

// Work per step. Kept well under the CPU limit; a single larger file gets a step of its own.
const RECORDS_STEP_BYTES = 8 * 1024 * 1024;
const FILES_STEP_BYTES = 16 * 1024 * 1024;
const FILES_STEP_COUNT = 60;
const FILES_PARALLEL = 6;
const VERIFY_STEP_BYTES = 32 * 1024 * 1024;
const APPLY_STEP_BYTES = 16 * 1024 * 1024;
const STEP_RETRIES = 2;
const RESUME_AFTER_MS = 45 * 1000;
const MAX_RESUMES = 3;

const KEEP_SCHEDULED_BACKUPS = 3;
const DOWNLOAD_LINK_SECONDS = 900;
const MAX_NOTE_LENGTH = 500;

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class UserError extends Error {}

type Mode = 'backup' | 'restore';
type TableInfo = { table: string; parents: string[]; est_bytes?: number };
type FileInfo = { bucket: string; name: string; size: number; mimetype: string | null };
type PartInfo = { path: string; bytes: number; sha256: string; plain_bytes: number; plain_sha256: string };
type ZipEntry = { n: string; c: number; s: number; o: number };
type Admin = { admin_id: string };

type BaseJob = {
  mode: Mode;
  step: number;
  token: string;
  retries: number;
  resumes: number;
  verifyCursor: number;
  verifiedBytes: number;
  verifiedEntries: number;
  directoryEntries: number | null;
};
type BackupJob = BaseJob & {
  mode: 'backup';
  stage: 'prepare' | 'records' | 'files' | 'finish' | 'verify';
  kind: string;
  startedAt: string;
  workStartedAt: string | null;
  tables: TableInfo[];
  tableCursor: number;
  counts: Record<string, number>;
  recordBytes: number;
  files: FileInfo[];
  fileCursor: number;
  fileBytes: number;
  filesSaved: number;
  filesSkipped: number;
  entries: ZipEntry[];
  offset: number;
  parts: PartInfo[];
};
type RestoreTotals = {
  records_added: number; records_already_there: number; records_failed: number;
  files_added: number; files_already_there: number; files_failed: number;
};
type RestoreJob = BaseJob & {
  mode: 'restore';
  stage: 'verify' | 'apply';
  actor: string;
  workStartedAt: string;
  applyCursor: number;
  appliedBytes: number;
  allowed: Record<string, string | null>;
  totals: RestoreTotals;
  problems: string[];
};
type Job = BackupJob | RestoreJob;
type BackupRow = {
  backup_id: string; kind: string; status: string; restore_status: string | null; started_at: string;
  job: Job | Record<string, never>; progress: Record<string, unknown> | null;
  restore_progress: Record<string, unknown> | null; parts: PartInfo[];
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const authenticateSuperAdmin = async (request: Request): Promise<Admin | null> => {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return null;

  const { data: admin, error } = await serviceClient
    .from('admin')
    .select('admin_id, role, status, is_super_admin')
    .eq('admin_id', user.id)
    .maybeSingle();

  if (
    error
    || !admin
    || !admin.is_super_admin
    || String(admin.role || '').trim().toLowerCase() !== 'admin'
    || String(admin.status || '').trim().toLowerCase() !== 'active'
  ) return null;
  return admin as Admin;
};

const rpc = async <T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await serviceClient.rpc(name, args);
  if (error) throw error;
  return data as T;
};

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

// Reads the 32-byte key from the secret. Accepts base64 or 64-character hex, ignoring
// stray spaces, line breaks, or wrapping quotes. Returns null when it is not a valid key.
// Only lengths are ever logged, never the key.
const readMasterKey = (): Buffer | null => {
  const raw = (Deno.env.get('BACKUP_ENCRYPTION_KEY') || '').trim().replace(/^(["'])(.*)\1$/s, '$2').replace(/\s+/g, '');
  if (!raw) return null;
  const candidates = [
    /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : null,
    Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
  ];
  const key = candidates.find((candidate) => candidate && candidate.length === 32) || null;
  if (!key) console.error(`BACKUP_ENCRYPTION_KEY is set but is not a 32-byte key (text length ${raw.length}).`);
  return key;
};

const masterKey = () => {
  const key = readMasterKey();
  if (!key) throw new UserError('Backup encryption is not set up yet. Ask the system owner to finish setup.');
  return key;
};

const partKey = (salt: Buffer) =>
  Buffer.from(hkdfSync('sha256', masterKey(), salt, 'ignis-safe-backup-v2', 32));

const frameNonce = (index: number) => {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE(index, 8);
  return nonce;
};

const frameAad = (partIndex: number, head: Buffer) => {
  const aad = Buffer.alloc(8);
  aad.writeUInt32BE(partIndex, 0);
  head.copy(aad, 4);
  return aad;
};

const encryptPart = (plain: Buffer, partIndex: number, finalPart: boolean) => {
  const salt = randomBytes(SALT_LENGTH);
  const key = partKey(salt);
  const header = Buffer.alloc(HEADER_LENGTH);
  MAGIC.copy(header, 0);
  header.writeUInt32BE(partIndex, MAGIC.length);
  salt.copy(header, MAGIC.length + 4);

  const out: Buffer[] = [header];
  for (let frame = 0, offset = 0; ; frame += 1, offset += FRAME_SIZE) {
    const chunk = plain.subarray(offset, offset + FRAME_SIZE);
    const last = offset + FRAME_SIZE >= plain.length;
    const head = Buffer.alloc(4);
    head.writeUInt32BE((chunk.length | (last ? PART_END : 0) | (last && finalPart ? BACKUP_END : 0)) >>> 0);
    const cipher = createCipheriv('aes-256-gcm', key, frameNonce(frame));
    cipher.setAAD(frameAad(partIndex, head));
    out.push(head, cipher.update(chunk), cipher.final(), cipher.getAuthTag());
    if (last) break;
  }
  return Buffer.concat(out);
};

// Any change, reordering, truncation, or part from another position fails.
const decryptPart = (data: Buffer, partIndex: number, finalPart: boolean) => {
  if (
    data.length < HEADER_LENGTH
    || !data.subarray(0, MAGIC.length).equals(MAGIC)
    || data.readUInt32BE(MAGIC.length) !== partIndex
  ) throw new UserError('This is not a valid IGNIS SAFE backup.');
  const key = partKey(data.subarray(MAGIC.length + 4, HEADER_LENGTH));
  const damaged = () => new UserError('This backup is damaged.');

  const chunks: Buffer[] = [];
  let offset = HEADER_LENGTH;
  let ended = false;
  for (let frame = 0; offset < data.length; frame += 1) {
    if (ended || offset + 4 + TAG_LENGTH > data.length) throw damaged();
    const head = data.subarray(offset, offset + 4);
    const raw = head.readUInt32BE(0);
    const length = raw & LENGTH_MASK;
    const partEnd = (raw & PART_END) !== 0;
    const backupEnd = (raw & BACKUP_END) !== 0;
    if (length > FRAME_SIZE || offset + 4 + length + TAG_LENGTH > data.length) throw damaged();
    if (backupEnd && !partEnd) throw damaged();
    if (partEnd && backupEnd !== finalPart) throw new UserError('This backup is incomplete.');

    const encrypted = data.subarray(offset + 4, offset + 4 + length);
    const tag = data.subarray(offset + 4 + length, offset + 4 + length + TAG_LENGTH);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, frameNonce(frame));
      decipher.setAAD(frameAad(partIndex, head));
      decipher.setAuthTag(tag);
      chunks.push(decipher.update(encrypted), decipher.final());
    } catch {
      throw new UserError('This backup could not be unlocked. It may be damaged, or the backup key has changed.');
    }
    offset += 4 + length + TAG_LENGTH;
    ended = partEnd;
  }
  if (!ended) throw new UserError('This backup is incomplete.');
  return Buffer.concat(chunks);
};

// ---------------------------------------------------------------------------
// Minimal ZIP (stored, no compression) writer and reader
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const jsCrc32 = (data: Uint8Array) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

// The runtime's native CRC-32 is much cheaper on CPU; it is used only if it gives the standard result.
const nativeCrc32 = (zlib as unknown as { crc32?: (data: Uint8Array) => number }).crc32;
const crc32 = (() => {
  try {
    if (nativeCrc32 && nativeCrc32(Buffer.from('123456789')) >>> 0 === 0xCBF43926) {
      return (data: Uint8Array) => nativeCrc32(data) >>> 0;
    }
  } catch { /* use the JavaScript version */ }
  return jsCrc32;
})();

type ZipState = { entries: ZipEntry[]; offset: number };

// Local file entries for `items`, placed at the state's current offset.
const zipEntries = (items: { name: string; data: Buffer }[], state: ZipState) => {
  const pieces: Buffer[] = [];
  for (const { name, data } of items) {
    if (data.length >= 0xFFFFFFFF) throw new UserError('A file is too large to back up.');
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(0, 8); // stored
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12); // 1980-01-01
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    pieces.push(header, nameBytes, data);
    state.entries.push({ n: name, c: crc, s: data.length, o: state.offset });
    state.offset += 30 + nameBytes.length + data.length;
  }
  if (state.offset >= 0xFFFFFFFF) throw new UserError('The backup is too large for one file.');
  return Buffer.concat(pieces);
};

const zipDirectory = (state: ZipState) => {
  if (state.entries.length > 0xFFFE) throw new UserError('Too many files to back up in one backup.');
  const pieces: Buffer[] = [];
  let size = 0;
  for (const entry of state.entries) {
    const name = Buffer.from(entry.n, 'utf8');
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(entry.c, 16);
    header.writeUInt32LE(entry.s, 20);
    header.writeUInt32LE(entry.s, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(entry.o, 42);
    pieces.push(header, name);
    size += 46 + name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(state.entries.length, 8);
  end.writeUInt16LE(state.entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(state.offset, 16);
  pieces.push(end);
  return Buffer.concat(pieces);
};

const damagedZip = () => new UserError('This backup is damaged: its contents cannot be read.');

// Reads the whole local entries in one decrypted part, checking each CRC.
const readEntries = (plain: Buffer) => {
  const entries: { name: string; data: Buffer }[] = [];
  let offset = 0;
  while (offset < plain.length) {
    if (offset + 30 > plain.length || plain.readUInt32LE(offset) !== 0x04034b50) throw damagedZip();
    const flags = plain.readUInt16LE(offset + 6);
    const method = plain.readUInt16LE(offset + 8);
    const crc = plain.readUInt32LE(offset + 14);
    const compressed = plain.readUInt32LE(offset + 18);
    const size = plain.readUInt32LE(offset + 22);
    const nameLength = plain.readUInt16LE(offset + 26);
    const extraLength = plain.readUInt16LE(offset + 28);
    if (method !== 0 || (flags & 8) !== 0 || compressed !== size) throw damagedZip();
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + size;
    if (dataEnd > plain.length) throw damagedZip();
    const data = plain.subarray(dataStart, dataEnd);
    if (crc32(data) !== crc) throw damagedZip();
    entries.push({ name: plain.subarray(nameStart, nameStart + nameLength).toString('utf8'), data });
    offset = dataEnd;
  }
  return entries;
};

// The last part holds only the central directory. Returns how many entries it lists.
const readDirectoryCount = (plain: Buffer) => {
  const end = plain.length - 22;
  if (end < 0 || plain.readUInt32LE(end) !== 0x06054b50) throw damagedZip();
  if (plain.readUInt32LE(end + 12) !== end) throw damagedZip();
  if (end > 0 && plain.readUInt32LE(0) !== 0x02014b50) throw damagedZip();
  return plain.readUInt16LE(end + 10);
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const uploadWithRetry = async (path: string, data: Buffer) => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await serviceClient.storage.from(BUCKET).upload(path, data, {
      contentType: 'application/octet-stream',
      upsert: true,
    });
    if (!error) return;
    lastError = error;
  }
  throw lastError;
};

// Encrypts one part and stores it. The path is unique per attempt, so a retried
// step never overwrites a part that another attempt already recorded.
const storePart = async (backupId: string, index: number, plain: Buffer, finalPart: boolean): Promise<PartInfo> => {
  const data = encryptPart(plain, index, finalPart);
  const path = `${backupId}/part-${String(index + 1).padStart(4, '0')}-${randomBytes(4).toString('hex')}.bin`;
  await uploadWithRetry(path, data);
  return { path, bytes: data.length, sha256: sha256(data), plain_bytes: plain.length, plain_sha256: sha256(plain) };
};

const downloadPart = async (part: PartInfo): Promise<Buffer> => {
  const { data, error } = await serviceClient.storage.from(BUCKET).download(part.path);
  if (error || !data) throw new Error(`Could not read ${part.path}: ${error?.message || 'missing'}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length !== part.bytes || sha256(buffer) !== part.sha256) {
    throw new UserError('This backup is damaged: a stored file does not match its checksum.');
  }
  return buffer;
};

const openPart = async (parts: PartInfo[], index: number) => {
  const part = parts[index];
  const plain = decryptPart(await downloadPart(part), index, index === parts.length - 1);
  if (plain.length !== part.plain_bytes || sha256(plain) !== part.plain_sha256) {
    throw new UserError('The backup could not be verified.');
  }
  return plain;
};

// Proves one stored part is whole. Returns its manifest when it is the first part.
const verifyPart = async (job: BaseJob, parts: PartInfo[], index: number, backupId: string) => {
  const plain = await openPart(parts, index);
  if (index === parts.length - 1) {
    job.directoryEntries = readDirectoryCount(plain);
    return null;
  }
  const entries = readEntries(plain);
  job.verifiedEntries += entries.length;
  if (index !== 0) return null;
  const manifestEntry = entries[0];
  if (manifestEntry?.name !== 'manifest.json') throw damagedZip();
  const manifest = JSON.parse(manifestEntry.data.toString('utf8'));
  if (manifest.format !== 'ignis-safe-backup' || manifest.version !== 2 || manifest.backupId !== backupId) {
    throw new UserError('This backup does not match its record.');
  }
  return manifest as { files?: FileInfo[] };
};

const removePaths = async (paths: string[]) => {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await serviceClient.storage.from(BUCKET).remove(paths.slice(index, index + 100));
    if (error) console.error('Could not remove backup files:', error.message);
  }
};

// Removes stored parts of a backup, except those in `keep`.
const cleanBackupFolder = async (backupId: string, keep: Set<string> = new Set()) => {
  const { data, error } = await serviceClient.storage.from(BUCKET).list(backupId, { limit: 1000 });
  if (error || !data) return;
  await removePaths(data.map((item) => `${backupId}/${item.name}`).filter((path) => !keep.has(path)));
};

// Failed or stopped runs can leave parts behind; remove them before a new backup.
const cleanFailedBackups = async () => {
  const { data } = await serviceClient
    .from('system_backups')
    .select('backup_id')
    .eq('status', 'failed')
    .is('job->>cleaned', null)
    .limit(20);
  for (const row of data || []) {
    await cleanBackupFolder(row.backup_id);
    await serviceClient.from('system_backups').update({ job: { cleaned: true } }).eq('backup_id', row.backup_id);
  }
};

// ---------------------------------------------------------------------------
// Reading the system
// ---------------------------------------------------------------------------

const sortTables = (tables: TableInfo[]) => {
  const names = new Set(tables.map((table) => table.table));
  const done = new Set<string>();
  const ordered: TableInfo[] = [];
  let remaining = [...tables];
  while (remaining.length) {
    const ready = remaining.filter((table) =>
      table.parents.every((parent) => !names.has(parent) || done.has(parent) || parent === table.table));
    // A circular reference cannot be ordered: take what is left.
    const batch = ready.length ? ready : remaining;
    for (const table of batch) {
      ordered.push(table);
      done.add(table.table);
    }
    remaining = remaining.filter((table) => !done.has(table.table));
  }
  return ordered;
};

const readTable = async (table: string): Promise<Record<string, unknown>[]> => {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += TABLE_PAGE_SIZE) {
    const page = await rpc<Record<string, unknown>[]>('backup_read_table', {
      p_table: table, p_offset: offset, p_limit: TABLE_PAGE_SIZE,
    });
    rows.push(...page);
    if (page.length < TABLE_PAGE_SIZE) return rows;
  }
};

const isMissingObject = (error: { message?: string } | null) => /not found|does not exist/i.test(error?.message || '');

const toUserMessage = (error: unknown, fallback: string) => {
  if (error instanceof UserError) return error.message;
  if ((error as { code?: string })?.code === '55006') return (error as Error).message;
  return fallback;
};

// ---------------------------------------------------------------------------
// Job chain
// ---------------------------------------------------------------------------

const newToken = () => {
  const token = randomBytes(32).toString('hex');
  return { token, hash: sha256(token) };
};

const loadRow = async (backupId: string): Promise<BackupRow | null> => {
  const { data, error } = await serviceClient
    .from('system_backups')
    .select('backup_id, kind, status, restore_status, started_at, job, progress, restore_progress, parts')
    .eq('backup_id', backupId)
    .maybeSingle();
  if (error) throw error;
  return data as BackupRow | null;
};

const saveStep = (backupId: string, mode: Mode, expectedStep: number, job: Job | null, progress: Record<string, unknown> | null) =>
  rpc<boolean>('backup_step_save', {
    p_backup_id: backupId, p_mode: mode, p_expected_step: expectedStep, p_job: job, p_progress: progress,
  });

// Starts the next step as its own request (and so with its own CPU allowance).
const kick = async (backupId: string, token: string) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(SELF_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
        body: JSON.stringify({ action: 'step', backupId, token }),
        signal: AbortSignal.timeout(15000),
      });
      await response.body?.cancel();
      if (response.status === 202) return true;
      console.error(`Next backup step was refused (${response.status}).`);
    } catch (error) {
      console.error('Could not start the next backup step:', error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  return false;
};

const backupProgress = (job: BackupJob, activity: string) => {
  const remainingRecords = job.tables.slice(job.tableCursor).reduce((total, table) => total + Number(table.est_bytes || 0), 0);
  const remainingFiles = job.files.slice(job.fileCursor).reduce((total, file) => total + Number(file.size || 0), 0);
  const planned = job.stage === 'verify'
    ? job.parts.reduce((total, part) => total + part.plain_bytes, 0)
    : job.offset + remainingRecords + remainingFiles;
  return {
    stage: job.stage,
    activity,
    step: job.step,
    done_bytes: (job.stage === 'verify' ? planned : job.offset) + job.verifiedBytes,
    total_bytes: 2 * planned,
    tables_done: job.tableCursor,
    tables_total: job.tables.length,
    files_done: job.fileCursor,
    files_total: job.files.length,
    parts_written: job.parts.length,
    parts_done: job.verifyCursor,
    parts_total: job.stage === 'verify' ? job.parts.length : null,
    work_started_at: job.workStartedAt,
  };
};

const restoreProgress = (job: RestoreJob, parts: PartInfo[], activity: string) => {
  const planned = parts.reduce((total, part) => total + part.plain_bytes, 0);
  return {
    stage: job.stage,
    activity,
    step: job.step,
    done_bytes: job.verifiedBytes + job.appliedBytes,
    total_bytes: 2 * planned,
    parts_done: job.stage === 'verify' ? job.verifyCursor : job.applyCursor,
    parts_total: parts.length,
    work_started_at: job.workStartedAt,
  };
};

const README_TEXT = [
  'IGNIS SAFE backup',
  '',
  'manifest.json   What this backup contains.',
  'database/       Every record, one JSON file per table.',
  'files/          Uploaded files, in folders named after their storage bucket.',
  '',
  'This ZIP is stored encrypted. Use Restore Backup on the Archive & Trash page to recover it.',
  'Login passwords are managed by Supabase Auth and are not part of this backup.',
].join('\n');

type StepResult = { job: Job; activity: string; written?: PartInfo; finished?: boolean };

// Encrypts and stores one part, telling the page first so "Encrypting" is shown while it happens.
const writeBackupPart = async (backupId: string, job: BackupJob, plain: Buffer, finalPart = false) => {
  await saveStep(backupId, 'backup', job.step, null, backupProgress(job, 'encrypting'));
  const part = await storePart(backupId, job.parts.length, plain, finalPart);
  job.parts.push(part);
  return part;
};

const backupStep = async (row: BackupRow, job: BackupJob): Promise<StepResult> => {
  const backupId = row.backup_id;

  if (job.stage === 'prepare') {
    const tables = sortTables(await rpc<TableInfo[]>('backup_table_info'));
    const files = await rpc<FileInfo[]>('backup_file_list');
    job.tables = tables;
    job.files = files;
    const manifest = {
      format: 'ignis-safe-backup',
      version: 2,
      backupId,
      kind: job.kind,
      startedAt: job.startedAt,
      tables: tables.map((table) => ({ name: table.table, parents: table.parents })),
      files,
    };
    const plain = zipEntries([
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest), 'utf8') },
      { name: 'README.txt', data: Buffer.from(README_TEXT, 'utf8') },
    ], job);
    const written = await writeBackupPart(backupId, job, plain);
    job.stage = 'records';
    job.workStartedAt = new Date().toISOString();
    return { job, activity: 'records', written };
  }

  if (job.stage === 'records') {
    const items: { name: string; data: Buffer }[] = [];
    let bytes = 0;
    while (job.tableCursor < job.tables.length && (items.length === 0 || bytes < RECORDS_STEP_BYTES)) {
      const info = job.tables[job.tableCursor];
      const rows = await readTable(info.table);
      const json = Buffer.from(JSON.stringify(rows), 'utf8');
      job.recordBytes += json.length;
      if (job.recordBytes > MAX_DATABASE_BYTES) throw new UserError('The database is too large to back up in one backup.');
      job.counts[info.table] = rows.length;
      items.push({ name: `database/${info.table}.json`, data: json });
      bytes += json.length;
      job.tableCursor += 1;
    }
    const written = items.length ? await writeBackupPart(backupId, job, zipEntries(items, job)) : undefined;
    if (job.tableCursor >= job.tables.length) job.stage = job.files.length ? 'files' : 'finish';
    return { job, activity: job.stage === 'records' ? 'records' : job.stage === 'files' ? 'files' : 'encrypting', written };
  }

  if (job.stage === 'files') {
    const batch: FileInfo[] = [];
    let batchBytes = 0;
    while (
      job.fileCursor + batch.length < job.files.length
      && batch.length < FILES_STEP_COUNT
      && (batch.length === 0 || batchBytes + job.files[job.fileCursor + batch.length].size <= FILES_STEP_BYTES)
    ) {
      const file = job.files[job.fileCursor + batch.length];
      batch.push(file);
      batchBytes += file.size;
    }

    const items: { name: string; data: Buffer }[] = [];
    for (let start = 0; start < batch.length; start += FILES_PARALLEL) {
      const group = batch.slice(start, start + FILES_PARALLEL);
      const downloaded = await Promise.all(group.map(async (file) => {
        const { data, error } = await serviceClient.storage.from(file.bucket).download(file.name);
        if (error || !data) {
          // Deleted while the backup ran: the backup reflects that, as it would a moment later.
          if (isMissingObject(error)) return null;
          throw new Error(`Could not read ${file.bucket}/${file.name}: ${error?.message}`);
        }
        return Buffer.from(await data.arrayBuffer());
      }));
      group.forEach((file, position) => {
        const data = downloaded[position];
        if (!data) {
          job.filesSkipped += 1;
          return;
        }
        items.push({ name: `files/${file.bucket}/${file.name}`, data });
        job.fileBytes += data.length;
        job.filesSaved += 1;
      });
    }
    job.fileCursor += batch.length;
    const written = items.length ? await writeBackupPart(backupId, job, zipEntries(items, job)) : undefined;
    if (job.fileCursor >= job.files.length) job.stage = 'finish';
    return { job, activity: job.stage === 'files' ? 'files' : 'encrypting', written };
  }

  if (job.stage === 'finish') {
    const written = await writeBackupPart(backupId, job, zipDirectory(job), true);
    job.stage = 'verify';
    return { job, activity: 'verifying', written };
  }

  // verify
  let bytes = 0;
  while (job.verifyCursor < job.parts.length && (bytes === 0 || bytes < VERIFY_STEP_BYTES)) {
    await verifyPart(job, job.parts, job.verifyCursor, backupId);
    const size = job.parts[job.verifyCursor].plain_bytes;
    bytes += size;
    job.verifiedBytes += size;
    job.verifyCursor += 1;
  }
  if (job.verifyCursor < job.parts.length) return { job, activity: 'verifying' };
  if (job.verifiedEntries !== job.entries.length || job.directoryEntries !== job.entries.length) {
    throw new UserError('The backup could not be verified, so it was not saved.');
  }
  return { job, activity: 'completing', finished: true };
};

const completeBackup = async (row: BackupRow, job: BackupJob) => {
  const countOf = (name: string) => job.counts[name] ?? 0;
  const contents = {
    tables: job.tables.length,
    records: Object.values(job.counts).reduce((total, count) => total + count, 0),
    files: job.filesSaved,
    files_skipped: job.filesSkipped,
    file_bytes: job.fileBytes,
    assessment_attempts: countOf('assessment_attempts'),
    attendance_records: countOf('attendance_records'),
    reports: countOf('reports'),
    learners: countOf('profiles'),
    staff_accounts: countOf('admin'),
  };
  await rpc('backup_complete', {
    p_backup_id: row.backup_id,
    p_parts: job.parts,
    p_size: job.parts.reduce((total, part) => total + part.bytes, 0),
    p_plain_bytes: job.parts.reduce((total, part) => total + part.plain_bytes, 0),
    // One hash over every part's checked plaintext hash, in order.
    p_plain_sha256: sha256(job.parts.map((part) => part.plain_sha256).join('')),
    p_contents: contents,
  });
  // Parts from retried steps that were never recorded.
  await cleanBackupFolder(row.backup_id, new Set(job.parts.map((part) => part.path)));
  if (job.kind === 'scheduled') await pruneScheduledBackups();
};

const pruneScheduledBackups = async () => {
  const { data, error } = await serviceClient
    .from('system_backups')
    .select('backup_id')
    .eq('kind', 'scheduled')
    .eq('status', 'completed')
    .order('started_at', { ascending: false });
  if (error || !data) return;
  for (const old of data.slice(KEEP_SCHEDULED_BACKUPS)) {
    await cleanBackupFolder(old.backup_id);
    await serviceClient.from('system_backups').delete().eq('backup_id', old.backup_id);
  }
};

const restoreStep = async (row: BackupRow, job: RestoreJob): Promise<StepResult> => {
  const parts = row.parts;

  if (job.stage === 'verify') {
    // Pass 1: prove the whole backup is intact before touching any data.
    let bytes = 0;
    while (job.verifyCursor < parts.length && (bytes === 0 || bytes < VERIFY_STEP_BYTES)) {
      const manifest = await verifyPart(job, parts, job.verifyCursor, row.backup_id);
      if (manifest) {
        job.allowed = Object.fromEntries((manifest.files || []).map((file) => [`files/${file.bucket}/${file.name}`, file.mimetype]));
      }
      bytes += parts[job.verifyCursor].plain_bytes;
      job.verifiedBytes += parts[job.verifyCursor].plain_bytes;
      job.verifyCursor += 1;
    }
    if (job.verifyCursor < parts.length) return { job, activity: 'verifying' };
    if (job.directoryEntries !== job.verifiedEntries) throw new UserError('The backup could not be verified.');
    job.stage = 'apply';
    return { job, activity: 'restoring' };
  }

  // Pass 2: add whatever is missing. Records come first, in dependency order.
  let bytes = 0;
  while (job.applyCursor < parts.length - 1 && (bytes === 0 || bytes < APPLY_STEP_BYTES)) {
    for (const { name, data } of readEntries(await openPart(parts, job.applyCursor))) {
      if (name.startsWith('database/') && name.endsWith('.json')) {
        await restoreRows(job, name.slice('database/'.length, -'.json'.length), data);
        continue;
      }
      if (!(name in job.allowed)) continue;
      const slash = name.indexOf('/', 'files/'.length);
      const bucket = name.slice('files/'.length, slash);
      const path = name.slice(slash + 1);
      const { error } = await serviceClient.storage.from(bucket).upload(path, data, {
        contentType: job.allowed[name] || 'application/octet-stream',
        upsert: false,
      });
      if (!error) job.totals.files_added += 1;
      else if (/already exists|duplicate/i.test(error.message) || (error as { statusCode?: string }).statusCode === '409') {
        job.totals.files_already_there += 1;
      } else {
        job.totals.files_failed += 1;
        if (job.problems.length < 5) job.problems.push(`${bucket}/${path}: ${error.message}`);
      }
    }
    bytes += parts[job.applyCursor].plain_bytes;
    job.appliedBytes += parts[job.applyCursor].plain_bytes;
    job.applyCursor += 1;
  }
  if (job.applyCursor < parts.length - 1) return { job, activity: 'restoring' };
  job.appliedBytes += parts[parts.length - 1].plain_bytes; // the directory part has nothing to add
  job.applyCursor = parts.length;
  return { job, activity: 'completing', finished: true };
};

const restoreRows = async (job: RestoreJob, table: string, data: Buffer) => {
  const rows = JSON.parse(data.toString('utf8')) as Record<string, unknown>[];
  let chunk: Record<string, unknown>[] = [];
  let chunkBytes = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const result = await rpc<{ added: number; already_there: number; failed: number; error: string | null }>(
      'backup_restore_rows', { p_table: table, p_rows: chunk },
    );
    job.totals.records_added += result.added;
    job.totals.records_already_there += result.already_there;
    job.totals.records_failed += result.failed;
    if (result.failed && job.problems.length < 5) job.problems.push(`${table}: ${result.error || 'some records could not be restored'}`);
    chunk = [];
    chunkBytes = 0;
  };
  for (const row of rows) {
    chunk.push(row);
    chunkBytes += JSON.stringify(row).length;
    if (chunkBytes >= RESTORE_CHUNK_BYTES || chunk.length >= 500) await flush();
  }
  await flush();
};

const failJob = async (row: BackupRow, job: Job, error: unknown) => {
  if (job.mode === 'backup') {
    const message = toUserMessage(error, 'Something went wrong while saving the backup. Please try again.');
    const failed = await rpc<boolean>('backup_fail', { p_backup_id: row.backup_id, p_error: message })
      .catch((failError) => { console.error('Could not record the failed backup:', failError); return false; });
    // Only remove files of a run this call really ended.
    if (failed) {
      await cleanBackupFolder(row.backup_id);
      await serviceClient.from('system_backups').update({ job: { cleaned: true } }).eq('backup_id', row.backup_id);
    }
    return;
  }
  await rpc('backup_restore_finish', {
    p_backup_id: row.backup_id,
    p_actor: job.actor,
    p_ok: false,
    p_summary: {
      ...job.totals,
      problems: job.problems,
      error: toUserMessage(error, 'Something went wrong while restoring. Nothing that exists now was changed or replaced.'),
    },
  }).catch((finishError) => console.error('Could not record the failed restore:', finishError));
};

const isActive = (row: BackupRow, job: Job) =>
  job.mode === 'backup' ? row.status === 'running' : row.restore_status === 'running';

// Runs one step, saves it, then starts the next one.
const runStep = async (backupId: string, token: string) => {
  const row = await loadRow(backupId).catch((error) => { console.error('Could not load the backup job:', error); return null; });
  const job = row?.job as Job | undefined;
  if (!row || !job?.mode || !isActive(row, job) || !sameHash(job.token, sha256(token))) return;

  const startedFrom = job.step;
  let result: StepResult;
  try {
    const working = structuredClone(job);
    result = working.mode === 'backup' ? await backupStep(row, working) : await restoreStep(row, working);
  } catch (error) {
    if (!(error instanceof UserError) && job.retries < STEP_RETRIES) {
      console.error('Backup step failed; trying it again:', error);
      const saved = await saveStep(backupId, job.mode, startedFrom, { ...job, retries: job.retries + 1 }, null).catch(() => false);
      if (saved && await kick(backupId, token)) return;
    }
    console.error('Backup step failed:', error);
    await failJob(row, job, error);
    return;
  }

  const next = result.job;
  next.step = startedFrom + 1;
  next.retries = 0;
  const progress = next.mode === 'backup'
    ? backupProgress(next, result.activity)
    : restoreProgress(next, row.parts, result.activity);

  let saved = false;
  try {
    saved = await saveStep(backupId, next.mode, startedFrom, next, progress);
  } catch (error) {
    console.error('Could not save the backup step:', error);
  }
  if (!saved) {
    // Another attempt already moved on (or the run was stopped): drop this attempt's part.
    if (result.written) await removePaths([result.written.path]);
    return;
  }

  if (result.finished) {
    try {
      if (next.mode === 'backup') await completeBackup(row, next);
      else {
        await rpc('backup_restore_finish', {
          p_backup_id: backupId, p_actor: next.actor, p_ok: true, p_summary: { ...next.totals, problems: next.problems },
        });
      }
    } catch (error) {
      console.error('Could not finish the backup job:', error);
      await failJob(row, next, error);
    }
    return;
  }

  if (!(await kick(backupId, token))) {
    await failJob(row, next, new UserError('The backup could not continue. Please try again.'));
  }
};

// Saves a new job and starts its first step. Returns false when the step could not be started.
const beginJob = async (backupId: string, mode: Mode, job: Job, progress: Record<string, unknown>, token: string) => {
  const saved = await saveStep(backupId, mode, -1, job, progress);
  if (!saved) throw new UserError('This could not be started. Please try again.');
  return kick(backupId, token);
};

const startBackup = async (kind: 'manual' | 'scheduled', actorId: string | null, note: string | null) => {
  const backupId = await rpc<string>('backup_start', { p_kind: kind, p_actor: actorId, p_note: note });
  // After backup_start, so runs it just marked as stopped are cleaned too.
  await cleanFailedBackups().catch((error) => console.error('Could not clean old backup files:', error));
  const { data } = await serviceClient.from('system_backups').select('started_at').eq('backup_id', backupId).single();
  const { token, hash } = newToken();
  const job: BackupJob = {
    mode: 'backup', stage: 'prepare', step: 0, token: hash, retries: 0, resumes: 0,
    kind, startedAt: data?.started_at || new Date().toISOString(), workStartedAt: null,
    tables: [], tableCursor: 0, counts: {}, recordBytes: 0,
    files: [], fileCursor: 0, fileBytes: 0, filesSaved: 0, filesSkipped: 0,
    entries: [], offset: 0, parts: [],
    verifyCursor: 0, verifiedBytes: 0, verifiedEntries: 0, directoryEntries: null,
  };
  const row = { backup_id: backupId } as BackupRow;
  try {
    if (!(await beginJob(backupId, 'backup', job, backupProgress(job, 'preparing'), token))) {
      throw new UserError('The backup could not be started. Please try again.');
    }
  } catch (error) {
    await failJob(row, job, error);
    throw error;
  }
  return backupId;
};

const startRestore = async (backupId: string, actorId: string) => {
  await rpc('backup_restore_begin', { p_backup_id: backupId, p_actor: actorId });
  const row = await loadRow(backupId);
  if (!row) throw new UserError('Backup not found.');
  const { token, hash } = newToken();
  const job: RestoreJob = {
    mode: 'restore', stage: 'verify', step: 0, token: hash, retries: 0, resumes: 0, actor: actorId,
    workStartedAt: new Date().toISOString(),
    verifyCursor: 0, verifiedBytes: 0, verifiedEntries: 0, directoryEntries: null,
    applyCursor: 0, appliedBytes: 0, allowed: {},
    totals: { records_added: 0, records_already_there: 0, records_failed: 0, files_added: 0, files_already_there: 0, files_failed: 0 },
    problems: [],
  };
  try {
    if (!(await beginJob(backupId, 'restore', job, restoreProgress(job, row.parts, 'verifying'), token))) {
      throw new UserError('The restore could not be started. Please try again.');
    }
  } catch (error) {
    await failJob(row, job, error);
    throw error;
  }
};

// Continues a run whose step stopped without reporting back. Steps are safe to
// repeat: a step only counts once it is saved, and every attempt writes its own part.
const resumeJob = async (backupId: string) => {
  const row = await loadRow(backupId);
  const job = row?.job as Job | undefined;
  if (!row || !job?.mode || !isActive(row, job)) throw new UserError('This backup or restore is no longer running.');
  const progress = (job.mode === 'backup' ? row.progress : row.restore_progress) || {};
  const quietMs = Date.now() - new Date(String(progress.updated_at || row.started_at)).getTime();
  if (quietMs < RESUME_AFTER_MS) return { resumed: false };
  if (job.resumes >= MAX_RESUMES) {
    await failJob(row, job, new UserError('It kept stopping, so it was stopped. Please try again.'));
    return { resumed: false, stopped: true };
  }
  // A new token also retires any earlier step chain that is still running somewhere.
  const { token, hash } = newToken();
  const saved = await saveStep(backupId, job.mode, job.step, { ...job, token: hash, retries: 0, resumes: job.resumes + 1 }, null);
  if (!saved) return { resumed: false };
  if (!(await kick(backupId, token))) {
    await failJob(row, job, new UserError('It could not be continued. Please try again.'));
    return { resumed: false, stopped: true };
  }
  return { resumed: true };
};

// ---------------------------------------------------------------------------
// Readable records (CSV)
// ---------------------------------------------------------------------------

// Hashes, one-time codes, and secrets never leave the database in a CSV.
const SENSITIVE_COLUMN = /password|_hash$|^hash$|secret|otp|token/i;

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Stops spreadsheet programs from running text that starts like a formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildCsvZip = async () => {
  const state: ZipState = { entries: [], offset: 0 };
  const pieces: Buffer[] = [];
  const empty: string[] = [];

  for (const info of await rpc<TableInfo[]>('backup_table_info')) {
    const rows = await readTable(info.table);
    if (!rows.length) {
      empty.push(info.table);
      continue;
    }
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((column) => !SENSITIVE_COLUMN.test(column));
    const lines = [columns.map(csvCell).join(',')];
    for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','));
    pieces.push(zipEntries([{ name: `${info.table}.csv`, data: Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8') }], state));
  }
  pieces.push(zipEntries([{
    name: 'README.txt',
    data: Buffer.from([
      'IGNIS SAFE records (CSV)',
      '',
      'One spreadsheet file per table, with the records as they are right now.',
      'Passwords, one-time codes, and other secrets are left out.',
      'This is for reading only. It is not a full backup and cannot restore uploaded files.',
      empty.length ? `\nNo records yet: ${empty.join(', ')}` : '',
    ].join('\n'), 'utf8'),
  }], state));
  pieces.push(zipDirectory(state));
  return Buffer.concat(pieces);
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    // The next step of a running job, sent by this function itself.
    if (action === 'step') {
      if (!isUuid(body?.backupId) || typeof body?.token !== 'string' || !body.token) {
        return jsonResponse({ error: 'Invalid step.' }, 400);
      }
      const row = await loadRow(body.backupId);
      const job = row?.job as Job | undefined;
      if (!row || !job?.token || !sameHash(job.token, sha256(body.token))) return jsonResponse({ error: 'Unauthorized.' }, 401);
      EdgeRuntime.waitUntil(runStep(body.backupId, body.token));
      return jsonResponse({ data: { accepted: true }, error: null }, 202);
    }

    if (action === 'scheduled') {
      const token = request.headers.get('x-maintenance-token') || '';
      const { data: tokenValid, error: tokenError } = await serviceClient.rpc('archive_verify_maintenance_token', { p_token: token });
      if (tokenError || tokenValid !== true) return jsonResponse({ error: 'Unauthorized.' }, 401);
      masterKey();
      const backupId = await startBackup('scheduled', null, 'Monthly backup');
      return jsonResponse({ data: { backupId }, error: null }, 202);
    }

    const admin = await authenticateSuperAdmin(request);
    if (!admin) return jsonResponse({ error: 'Only an active Super Admin can manage backups.' }, 403);

    // Read-only setup check. Only reports whether the key is valid, never the key.
    if (action === 'status') {
      return jsonResponse({ data: { encryptionReady: readMasterKey() !== null }, error: null });
    }

    if (action === 'create') {
      const note = String(body?.note || '').trim();
      if (note.length > MAX_NOTE_LENGTH) return jsonResponse({ error: `The note must be ${MAX_NOTE_LENGTH} characters or fewer.` }, 400);
      masterKey();
      const backupId = await startBackup('manual', admin.admin_id, note || null);
      return jsonResponse({ data: { backupId }, error: null }, 202);
    }

    if (action === 'resume') {
      if (!isUuid(body?.backupId)) return jsonResponse({ error: 'Invalid backup.' }, 400);
      masterKey();
      return jsonResponse({ data: await resumeJob(body.backupId), error: null });
    }

    if (action === 'download') {
      if (!isUuid(body?.backupId)) return jsonResponse({ error: 'Invalid backup.' }, 400);
      const { data: backup } = await serviceClient
        .from('system_backups')
        .select('backup_id, status, verified_at, parts, started_at')
        .eq('backup_id', body.backupId)
        .maybeSingle();
      if (!backup || backup.status !== 'completed' || !backup.verified_at) {
        return jsonResponse({ error: 'Only a completed, verified backup can be downloaded.' }, 409);
      }
      const parts = backup.parts as PartInfo[];
      const { data: links, error: linkError } = await serviceClient.storage
        .from(BUCKET).createSignedUrls(parts.map((part) => part.path), DOWNLOAD_LINK_SECONDS);
      if (linkError || !links || links.some((link) => !link.signedUrl)) throw linkError || new Error('No download links.');
      await rpc('backup_log_download', { p_backup_id: backup.backup_id, p_actor: admin.admin_id, p_what: 'backup' });
      const day = new Date(backup.started_at).toISOString().slice(0, 10);
      return jsonResponse({
        data: {
          filename: `ignis-safe-backup-${day}.zip.enc`,
          parts: links.map((link, index) => ({ url: link.signedUrl, bytes: parts[index].bytes })),
        },
        error: null,
      });
    }

    if (action === 'csv') {
      const bytes = await buildCsvZip();
      await rpc('backup_log_download', { p_backup_id: null, p_actor: admin.admin_id, p_what: 'csv' });
      return new Response(bytes, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/octet-stream' },
      });
    }

    if (action === 'restore') {
      if (!isUuid(body?.backupId)) return jsonResponse({ error: 'Invalid backup.' }, 400);
      if (body?.confirm !== 'RESTORE') return jsonResponse({ error: 'Please type RESTORE to confirm.' }, 400);
      masterKey();
      await startRestore(body.backupId, admin.admin_id);
      return jsonResponse({ data: { backupId: body.backupId }, error: null }, 202);
    }

    return jsonResponse({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (error instanceof UserError) return jsonResponse({ error: error.message }, 400);
    if (code === '55006' || code === '55000') return jsonResponse({ error: (error as Error).message }, 409);
    console.error('Backup request failed:', error);
    return jsonResponse({ error: 'The backup service ran into a problem. Please try again.' }, 500);
  }
});
