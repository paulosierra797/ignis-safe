import { createClient } from 'npm:@supabase/supabase-js@2.97.0';
import { corsHeaders } from '../_shared/cors.ts';

// Permanent deletion for the global Archive & Trash lifecycle.
//
// Storage files cannot be deleted from SQL, so purges of records that own
// files run here: the database validates and locks the item
// (archive_purge_prepare), this function removes the files through the
// Storage API, and the database deletes the record only after verifying every
// file is gone (archive_purge_finalize). Two callers:
//   * process_queue: the daily pg_cron job, authenticated by a vault token.
//   * purge: a signed-in Super Admin deleting one item early.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MAX_REASON_LENGTH = 500;
const QUEUE_BATCH_SIZE = 25;

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isUuid = (value: unknown) =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

type StorageFile = { bucket: string; path: string };
type PurgeResult = { ok: boolean; reason?: string };

const authenticateSuperAdmin = async (request: Request) => {
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
  return admin;
};

// Failures are not thrown: finalize re-checks storage.objects and records a
// purge_failed event for any file that is still present.
const removeFiles = async (files: StorageFile[]) => {
  const pathsByBucket = new Map<string, string[]>();
  for (const file of files) {
    if (!file?.bucket || !file?.path) continue;
    pathsByBucket.set(file.bucket, [...(pathsByBucket.get(file.bucket) || []), file.path]);
  }

  for (const [bucket, paths] of pathsByBucket) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await serviceClient.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (error) console.error(`Storage removal failed for bucket ${bucket}:`, error.message);
    }
  }
};

const purgeItem = async (
  itemId: string,
  actorId: string | null,
  manual: boolean,
  reason: string | null,
): Promise<PurgeResult> => {
  const { data: prepared, error: prepareError } = await serviceClient.rpc('archive_purge_prepare', {
    p_item_id: itemId,
    p_actor: actorId,
    p_manual: manual,
  });
  if (prepareError) throw prepareError;
  if (!prepared?.ok) return { ok: false, reason: prepared?.reason || 'This item cannot be deleted yet.' };

  await removeFiles(Array.isArray(prepared.files) ? prepared.files : []);

  const { data: finalized, error: finalizeError } = await serviceClient.rpc('archive_purge_finalize', {
    p_item_id: itemId,
    p_actor: actorId,
    p_manual: manual,
    p_reason: reason,
  });
  if (finalizeError) throw finalizeError;
  return finalized?.ok ? { ok: true } : { ok: false, reason: finalized?.reason || 'Permanent deletion failed.' };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'process_queue') {
      const token = request.headers.get('x-maintenance-token') || '';
      const { data: tokenValid, error: tokenError } = await serviceClient.rpc('archive_verify_maintenance_token', {
        p_token: token,
      });
      if (tokenError || tokenValid !== true) return jsonResponse({ error: 'Unauthorized.' }, 401);

      const { data: queue, error: queueError } = await serviceClient.rpc('archive_purge_queue', {
        p_limit: QUEUE_BATCH_SIZE,
      });
      if (queueError) throw queueError;

      const summary = { processed: 0, purged: 0, held: 0, failed: 0 };
      for (const itemId of (queue || []) as string[]) {
        summary.processed += 1;
        try {
          const result = await purgeItem(itemId, null, false, null);
          if (result.ok) summary.purged += 1;
          else summary.held += 1;
        } catch (error) {
          summary.failed += 1;
          console.error(`Scheduled purge failed for ${itemId}:`, error);
        }
      }
      return jsonResponse({ data: summary, error: null });
    }

    if (action === 'purge') {
      const admin = await authenticateSuperAdmin(request);
      if (!admin) return jsonResponse({ error: 'Only an active Super Admin can permanently delete records.' }, 403);

      const itemId = body?.itemId;
      const reason = String(body?.reason || '').trim();
      if (!isUuid(itemId)) return jsonResponse({ error: 'Invalid item.' }, 400);
      if (reason.length > MAX_REASON_LENGTH) {
        return jsonResponse({ error: `The reason must be ${MAX_REASON_LENGTH} characters or fewer.` }, 400);
      }

      const result = await purgeItem(itemId, admin.admin_id, true, reason || null);
      if (!result.ok) return jsonResponse({ error: result.reason }, 409);
      return jsonResponse({ data: { itemId, purged: true }, error: null });
    }

    return jsonResponse({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    console.error('Archive maintenance failed:', error);
    return jsonResponse({ error: 'Archive maintenance failed. Please try again.' }, 500);
  }
});
