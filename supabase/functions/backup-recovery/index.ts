import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { corsHeaders } from '../_shared/cors.ts';

// Backup & Recovery for the Super Admin Archive & Trash page.
//
// A backup is a ZIP (manifest, database records as JSON, uploaded files) that
// is encrypted in 1 MiB AES-256-GCM frames and stored as a few parts in the
// private `system-backups` bucket. A backup is reported as complete only after
// every part has been downloaded again, hash-checked, decrypted, and read back
// as a valid ZIP (see verifyBackup), and the database has confirmed the parts
// exist (backup_complete). Restores only add what is missing.
//
// Callers:
//   * scheduled: the monthly pg_cron job, authenticated by a vault token.
//   * create / download / csv / restore: a signed-in Super Admin.

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const BUCKET = 'system-backups';
const MAGIC = Buffer.from('IGNISBK1');
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const FRAME_SIZE = 1024 * 1024;
const PART_TARGET = 24 * 1024 * 1024;
const LAST_FRAME_FLAG = 0x80000000;
const TABLE_PAGE_SIZE = 500;
const MAX_DATABASE_BYTES = 100 * 1024 * 1024;
const RESTORE_CHUNK_BYTES = 2 * 1024 * 1024;
const FILE_BATCH_BYTES = 24 * 1024 * 1024;
const FILE_BATCH_COUNT = 6;
const KEEP_SCHEDULED_BACKUPS = 3;
const DOWNLOAD_LINK_SECONDS = 900;
const MAX_NOTE_LENGTH = 500;

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class UserError extends Error {}

type TableInfo = { table: string; parents: string[] };
type FileInfo = { bucket: string; name: string; size: number; mimetype: string | null };
type PartInfo = { path: string; bytes: number; sha256: string };
type Manifest = { format?: string; backupId?: string; files?: FileInfo[] };
type Admin = { admin_id: string };

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

// ---------------------------------------------------------------------------
// Encryption: [magic][salt] then frames of [4-byte length|last flag][data][tag]
// ---------------------------------------------------------------------------

const masterKey = () => {
  const key = Buffer.from(Deno.env.get('BACKUP_ENCRYPTION_KEY') || '', 'base64');
  if (key.length !== 32) throw new UserError('Backup encryption is not set up yet. Ask the system owner to finish setup.');
  return key;
};

const deriveKey = (salt: Buffer) =>
  Buffer.from(hkdfSync('sha256', masterKey(), salt, 'ignis-safe-backup-v1', 32));

const frameNonce = (index: number) => {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE(index, 8);
  return nonce;
};

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

// Turns the ZIP byte stream into encrypted parts uploaded to Storage. Parts
// always end on a frame boundary, so they can be joined back into one file.
class EncryptedPartWriter {
  readonly parts: PartInfo[] = [];
  totalBytes = 0;
  plainBytes = 0;
  plainSha256 = '';
  private plainHash = createHash('sha256');
  private pending: Buffer = Buffer.alloc(0);
  private out: Buffer[] = [];
  private outLength = 0;
  private frameIndex = 0;
  private key: Buffer;

  constructor(private backupId: string) {
    const salt = randomBytes(SALT_LENGTH);
    this.key = deriveKey(salt);
    this.push(Buffer.concat([MAGIC, salt]));
  }

  private push(buffer: Buffer) {
    this.out.push(buffer);
    this.outLength += buffer.length;
  }

  private encryptFrame(plain: Buffer, last: boolean) {
    const head = Buffer.alloc(4);
    head.writeUInt32BE((plain.length | (last ? LAST_FRAME_FLAG : 0)) >>> 0);
    const cipher = createCipheriv('aes-256-gcm', this.key, frameNonce(this.frameIndex++));
    cipher.setAAD(head);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    this.push(head);
    this.push(encrypted);
    this.push(cipher.getAuthTag());
  }

  async write(chunk: Uint8Array) {
    if (!chunk.length) return;
    this.plainHash.update(chunk);
    this.plainBytes += chunk.length;
    const incoming = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.length);
    this.pending = this.pending.length ? Buffer.concat([this.pending, incoming]) : incoming;

    let offset = 0;
    // Strictly greater: at least one byte stays back for the final frame.
    while (this.pending.length - offset > FRAME_SIZE) {
      this.encryptFrame(this.pending.subarray(offset, offset + FRAME_SIZE), false);
      offset += FRAME_SIZE;
      if (this.outLength >= PART_TARGET) await this.flushPart();
    }
    this.pending = this.pending.subarray(offset);
  }

  async finish() {
    this.encryptFrame(this.pending, true);
    this.pending = Buffer.alloc(0);
    this.plainSha256 = this.plainHash.digest('hex');
    await this.flushPart();
  }

  private async flushPart() {
    if (!this.out.length) return;
    const data = Buffer.concat(this.out);
    this.out = [];
    this.outLength = 0;
    const path = `${this.backupId}/part-${String(this.parts.length + 1).padStart(4, '0')}.bin`;

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await serviceClient.storage.from(BUCKET).upload(path, data, {
        contentType: 'application/octet-stream',
        upsert: true,
      });
      if (!error) {
        this.parts.push({ path, bytes: data.length, sha256: sha256(data) });
        this.totalBytes += data.length;
        return;
      }
      lastError = error;
    }
    throw lastError;
  }
}

const downloadPart = async (part: PartInfo): Promise<Buffer> => {
  const { data, error } = await serviceClient.storage.from(BUCKET).download(part.path);
  if (error || !data) throw new Error(`Could not read ${part.path}: ${error?.message || 'missing'}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length !== part.bytes || sha256(buffer) !== part.sha256) {
    throw new UserError('This backup is damaged: a stored file does not match its checksum.');
  }
  return buffer;
};

// Yields the decrypted ZIP bytes. Any change, reordering, or missing frame fails.
async function* decryptParts(parts: PartInfo[]): AsyncGenerator<Buffer> {
  let key: Buffer | null = null;
  let frameIndex = 0;
  let sawLast = false;

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const data = await downloadPart(parts[partIndex]);
    let offset = 0;
    if (partIndex === 0) {
      if (data.length < MAGIC.length + SALT_LENGTH || !data.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new UserError('This is not a valid IGNIS SAFE backup.');
      }
      key = deriveKey(data.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH));
      offset = MAGIC.length + SALT_LENGTH;
    }
    if (!key) throw new UserError('This is not a valid IGNIS SAFE backup.');

    while (offset < data.length) {
      if (sawLast) throw new UserError('This backup is damaged: it has extra data at the end.');
      if (offset + 4 > data.length) throw new UserError('This backup is damaged.');
      const head = data.subarray(offset, offset + 4);
      const raw = head.readUInt32BE(0);
      const last = (raw & LAST_FRAME_FLAG) !== 0;
      const length = (raw & ~LAST_FRAME_FLAG) >>> 0;
      offset += 4;
      if (length > FRAME_SIZE || offset + length + TAG_LENGTH > data.length) {
        throw new UserError('This backup is damaged.');
      }
      const encrypted = data.subarray(offset, offset + length);
      const tag = data.subarray(offset + length, offset + length + TAG_LENGTH);
      offset += length + TAG_LENGTH;

      let plain: Buffer;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, frameNonce(frameIndex));
        decipher.setAAD(head);
        decipher.setAuthTag(tag);
        plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      } catch {
        throw new UserError('This backup could not be unlocked. It may be damaged, or the backup key has changed.');
      }
      frameIndex += 1;
      sawLast = last;
      yield plain;
    }
  }
  if (!sawLast) throw new UserError('This backup is incomplete.');
}

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

const crc32 = (data: Uint8Array) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

type ZipSink = { write(chunk: Uint8Array): Promise<void> | void };

class ZipWriter {
  private entries: { name: Buffer; crc: number; size: number; offset: number }[] = [];
  private offset = 0;
  count = 0;

  constructor(private sink: ZipSink) {}

  async add(name: string, data: Uint8Array) {
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
    await this.sink.write(header);
    await this.sink.write(nameBytes);
    await this.sink.write(data);
    this.entries.push({ name: nameBytes, crc, size: data.length, offset: this.offset });
    this.offset += 30 + nameBytes.length + data.length;
    this.count += 1;
  }

  async finish() {
    if (this.entries.length > 0xFFFE) throw new UserError('Too many files to back up in one backup.');
    const directoryStart = this.offset;
    let directorySize = 0;
    for (const entry of this.entries) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt16LE(0x21, 14);
      header.writeUInt32LE(entry.crc, 16);
      header.writeUInt32LE(entry.size, 20);
      header.writeUInt32LE(entry.size, 24);
      header.writeUInt16LE(entry.name.length, 28);
      header.writeUInt32LE(entry.offset, 42);
      await this.sink.write(header);
      await this.sink.write(entry.name);
      directorySize += 46 + entry.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(directorySize, 12);
    end.writeUInt32LE(directoryStart, 16);
    await this.sink.write(end);
  }
}

class ByteReader {
  private queue: Buffer[] = [];
  private length = 0;
  private ended = false;

  constructor(private source: AsyncIterator<Buffer>) {}

  private async fill(count: number) {
    while (this.length < count && !this.ended) {
      const next = await this.source.next();
      if (next.done) this.ended = true;
      else {
        this.queue.push(next.value);
        this.length += next.value.length;
      }
    }
    return this.length >= count;
  }

  async take(count: number): Promise<Buffer | null> {
    if (count === 0) return Buffer.alloc(0);
    if (!(await this.fill(count))) return null;
    const joined = this.queue.length === 1 ? this.queue[0] : Buffer.concat(this.queue);
    const rest = joined.subarray(count);
    this.queue = rest.length ? [rest] : [];
    this.length = rest.length;
    return joined.subarray(0, count);
  }

  // Reads the remaining bytes so the whole stream is authenticated.
  async drain() {
    while (!this.ended) {
      const next = await this.source.next();
      if (next.done) this.ended = true;
    }
  }
}

const readZip = async (
  source: AsyncIterator<Buffer>,
  onEntry: (name: string, data: Buffer) => Promise<void>,
) => {
  const reader = new ByteReader(source);
  const damaged = () => new UserError('This backup is damaged: its contents cannot be read.');

  for (;;) {
    const signature = await reader.take(4);
    if (!signature) throw damaged();
    const value = signature.readUInt32LE(0);
    if (value === 0x02014b50 || value === 0x06054b50) break;
    if (value !== 0x04034b50) throw damaged();

    const header = await reader.take(26);
    if (!header) throw damaged();
    const flags = header.readUInt16LE(2);
    const method = header.readUInt16LE(4);
    const crc = header.readUInt32LE(10);
    const compressed = header.readUInt32LE(14);
    const size = header.readUInt32LE(18);
    const nameLength = header.readUInt16LE(22);
    const extraLength = header.readUInt16LE(24);
    if (method !== 0 || (flags & 8) !== 0 || compressed !== size) throw damaged();

    const name = await reader.take(nameLength);
    const extra = await reader.take(extraLength);
    const data = await reader.take(size);
    if (!name || !extra || !data) throw damaged();
    if (crc32(data) !== crc) throw damaged();
    await onEntry(name.toString('utf8'), data);
  }
  await reader.drain();
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
// Create a backup
// ---------------------------------------------------------------------------

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

// Re-reads the stored backup from Storage and proves it is whole.
const verifyBackup = async (parts: PartInfo[], expectedBytes: number, expectedSha: string, expectedEntries?: number) => {
  const hash = createHash('sha256');
  let plainBytes = 0;
  const source = (async function* () {
    for await (const chunk of decryptParts(parts)) {
      hash.update(chunk);
      plainBytes += chunk.length;
      yield chunk;
    }
  })();

  let entries = 0;
  let manifestSeen = false;
  await readZip(source, async (name, data) => {
    entries += 1;
    if (name === 'manifest.json') {
      JSON.parse(data.toString('utf8'));
      manifestSeen = true;
    }
  });

  if (
    !manifestSeen
    || plainBytes !== expectedBytes
    || hash.digest('hex') !== expectedSha
    || (expectedEntries !== undefined && entries !== expectedEntries)
  ) {
    throw new UserError('The backup could not be verified, so it was not saved.');
  }
};

const removeBackupParts = async (parts: PartInfo[]) => {
  const paths = parts.map((part) => part.path);
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await serviceClient.storage.from(BUCKET).remove(paths.slice(index, index + 100));
    if (error) console.error('Could not remove backup files:', error.message);
  }
};

const pruneScheduledBackups = async () => {
  const { data, error } = await serviceClient
    .from('system_backups')
    .select('backup_id, parts')
    .eq('kind', 'scheduled')
    .eq('status', 'completed')
    .order('started_at', { ascending: false });
  if (error || !data) return;
  for (const old of data.slice(KEEP_SCHEDULED_BACKUPS)) {
    await removeBackupParts((old.parts || []) as PartInfo[]);
    await serviceClient.from('system_backups').delete().eq('backup_id', old.backup_id);
  }
};

const runBackup = async (backupId: string, kind: string, startedAt: string) => {
  const writer = new EncryptedPartWriter(backupId);
  try {
    const tableInfo = sortTables(await rpc<TableInfo[]>('backup_table_info'));
    const tables: { name: string; parents: string[]; rows: number; json: Buffer }[] = [];
    let databaseBytes = 0;
    for (const info of tableInfo) {
      const rows = await readTable(info.table);
      const json = Buffer.from(JSON.stringify(rows), 'utf8');
      databaseBytes += json.length;
      if (databaseBytes > MAX_DATABASE_BYTES) throw new UserError('The database is too large to back up in one step.');
      tables.push({ name: info.table, parents: info.parents, rows: rows.length, json });
    }
    const files = await rpc<FileInfo[]>('backup_file_list');

    const manifest = {
      format: 'ignis-safe-backup',
      version: 1,
      backupId,
      kind,
      startedAt,
      tables: tables.map((table) => ({ name: table.name, rows: table.rows, parents: table.parents })),
      files,
    };

    const zip = new ZipWriter(writer);
    await zip.add('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));
    await zip.add('README.txt', Buffer.from(README_TEXT, 'utf8'));
    for (const table of tables) await zip.add(`database/${table.name}.json`, table.json);

    let fileBytes = 0;
    for (let index = 0; index < files.length;) {
      const batch: FileInfo[] = [];
      let batchBytes = 0;
      while (
        index < files.length
        && batch.length < FILE_BATCH_COUNT
        && (batch.length === 0 || batchBytes + files[index].size <= FILE_BATCH_BYTES)
      ) {
        batch.push(files[index]);
        batchBytes += files[index].size;
        index += 1;
      }
      const downloaded = await Promise.all(batch.map(async (file) => {
        const { data, error } = await serviceClient.storage.from(file.bucket).download(file.name);
        if (error || !data) {
          // A file removed while the backup runs would make the manifest wrong: retry later.
          if (isMissingObject(error)) throw new UserError('Some files changed while the backup was running. Please try again.');
          throw new Error(`Could not read ${file.bucket}/${file.name}: ${error?.message}`);
        }
        return Buffer.from(await data.arrayBuffer());
      }));
      for (let position = 0; position < batch.length; position += 1) {
        await zip.add(`files/${batch[position].bucket}/${batch[position].name}`, downloaded[position]);
        fileBytes += downloaded[position].length;
      }
    }

    await zip.finish();
    await writer.finish();

    await verifyBackup(writer.parts, writer.plainBytes, writer.plainSha256, zip.count);

    const countOf = (name: string) => tables.find((table) => table.name === name)?.rows ?? 0;
    const contents = {
      tables: tables.length,
      records: tables.reduce((total, table) => total + table.rows, 0),
      files: files.length,
      file_bytes: fileBytes,
      assessment_attempts: countOf('assessment_attempts'),
      attendance_records: countOf('attendance_records'),
      reports: countOf('reports'),
      learners: countOf('profiles'),
      staff_accounts: countOf('admin'),
    };

    await rpc('backup_complete', {
      p_backup_id: backupId,
      p_parts: writer.parts,
      p_size: writer.totalBytes,
      p_plain_bytes: writer.plainBytes,
      p_plain_sha256: writer.plainSha256,
      p_contents: contents,
    });

    if (kind === 'scheduled') await pruneScheduledBackups();
  } catch (error) {
    console.error('Backup failed:', error);
    await removeBackupParts(writer.parts);
    await rpc('backup_fail', {
      p_backup_id: backupId,
      p_error: toUserMessage(error, 'Something went wrong while saving the backup. Please try again.'),
    }).catch((failError) => console.error('Could not record the failed backup:', failError));
  }
};

const startBackup = async (kind: 'manual' | 'scheduled', actorId: string | null, note: string | null) => {
  const backupId = await rpc<string>('backup_start', { p_kind: kind, p_actor: actorId, p_note: note });
  const { data } = await serviceClient.from('system_backups').select('started_at').eq('backup_id', backupId).single();
  EdgeRuntime.waitUntil(runBackup(backupId, kind, data?.started_at || new Date().toISOString()));
  return backupId;
};

// ---------------------------------------------------------------------------
// Restore a backup (adds what is missing; never overwrites)
// ---------------------------------------------------------------------------

const runRestore = async (backupId: string, actorId: string) => {
  const totals = {
    records_added: 0, records_already_there: 0, records_failed: 0,
    files_added: 0, files_already_there: 0, files_failed: 0,
  };
  const problems: string[] = [];
  try {
    const { data: backup, error } = await serviceClient
      .from('system_backups')
      .select('parts, plain_bytes, plain_sha256')
      .eq('backup_id', backupId)
      .single();
    if (error || !backup) throw new UserError('Backup not found.');
    const parts = backup.parts as PartInfo[];

    // Pass 1: prove the whole backup is intact before touching any data.
    await verifyBackup(parts, Number(backup.plain_bytes), String(backup.plain_sha256));

    // Pass 2: add whatever is missing. Tables come first, in dependency order.
    let ready = false;
    const allowedFiles = new Map<string, FileInfo>();

    await readZip(decryptParts(parts), async (name, data) => {
      if (name === 'manifest.json') {
        const manifest = JSON.parse(data.toString('utf8')) as Manifest;
        if (manifest.format !== 'ignis-safe-backup' || manifest.backupId !== backupId) {
          throw new UserError('This backup does not match its record.');
        }
        for (const file of manifest.files || []) allowedFiles.set(`files/${file.bucket}/${file.name}`, file);
        ready = true;
        return;
      }
      if (!ready) throw new UserError('This backup is damaged: its contents cannot be read.');

      if (name.startsWith('database/') && name.endsWith('.json')) {
        const table = name.slice('database/'.length, -'.json'.length);
        const rows = JSON.parse(data.toString('utf8')) as Record<string, unknown>[];
        let chunk: Record<string, unknown>[] = [];
        let chunkBytes = 0;
        const flush = async () => {
          if (!chunk.length) return;
          const result = await rpc<{ added: number; already_there: number; failed: number; error: string | null }>(
            'backup_restore_rows', { p_table: table, p_rows: chunk },
          );
          totals.records_added += result.added;
          totals.records_already_there += result.already_there;
          totals.records_failed += result.failed;
          if (result.failed && problems.length < 5) problems.push(`${table}: ${result.error || 'some records could not be restored'}`);
          chunk = [];
          chunkBytes = 0;
        };
        for (const row of rows) {
          chunk.push(row);
          chunkBytes += JSON.stringify(row).length;
          if (chunkBytes >= RESTORE_CHUNK_BYTES || chunk.length >= 500) await flush();
        }
        await flush();
        return;
      }

      const file = allowedFiles.get(name);
      if (!file) return;
      const { error: uploadError } = await serviceClient.storage.from(file.bucket).upload(file.name, data, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });
      if (!uploadError) totals.files_added += 1;
      else if (/already exists|duplicate/i.test(uploadError.message) || (uploadError as { statusCode?: string }).statusCode === '409') {
        totals.files_already_there += 1;
      } else {
        totals.files_failed += 1;
        if (problems.length < 5) problems.push(`${file.bucket}/${file.name}: ${uploadError.message}`);
      }
    });

    await rpc('backup_restore_finish', { p_backup_id: backupId, p_actor: actorId, p_ok: true, p_summary: { ...totals, problems } });
  } catch (error) {
    console.error('Restore failed:', error);
    await rpc('backup_restore_finish', {
      p_backup_id: backupId,
      p_actor: actorId,
      p_ok: false,
      p_summary: {
        ...totals,
        problems,
        error: toUserMessage(error, 'Something went wrong while restoring. Existing data was not changed.'),
      },
    }).catch((finishError) => console.error('Could not record the failed restore:', finishError));
  }
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

class MemorySink implements ZipSink {
  chunks: Buffer[] = [];
  write(chunk: Uint8Array) {
    this.chunks.push(Buffer.from(chunk));
  }
}

const buildCsvZip = async () => {
  const sink = new MemorySink();
  const zip = new ZipWriter(sink);
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
    await zip.add(`${info.table}.csv`, Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8'));
  }
  await zip.add('README.txt', Buffer.from([
    'IGNIS SAFE records (CSV)',
    '',
    'One spreadsheet file per table, with the records as they are right now.',
    'Passwords, one-time codes, and other secrets are left out.',
    'This is for reading only. It is not a full backup and cannot restore uploaded files.',
    empty.length ? `\nNo records yet: ${empty.join(', ')}` : '',
  ].join('\n'), 'utf8'));
  await zip.finish();
  return Buffer.concat(sink.chunks);
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
      const keyBytes = Buffer.from(Deno.env.get('BACKUP_ENCRYPTION_KEY') || '', 'base64');
      return jsonResponse({ data: { encryptionReady: keyBytes.length === 32 }, error: null });
    }

    if (action === 'create') {
      const note = String(body?.note || '').trim();
      if (note.length > MAX_NOTE_LENGTH) return jsonResponse({ error: `The note must be ${MAX_NOTE_LENGTH} characters or fewer.` }, 400);
      masterKey();
      const backupId = await startBackup('manual', admin.admin_id, note || null);
      return jsonResponse({ data: { backupId }, error: null }, 202);
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
      await rpc('backup_restore_begin', { p_backup_id: body.backupId, p_actor: admin.admin_id });
      EdgeRuntime.waitUntil(runRestore(body.backupId, admin.admin_id));
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
