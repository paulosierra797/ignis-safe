import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = await readFile(new URL('../supabase/functions/archive-maintenance/index.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source
  .replace("import { createClient } from 'npm:@supabase/supabase-js@2.97.0';", '')
  .replace("import { corsHeaders } from '../_shared/cors.ts';", ''));
const itemId = '00000000-0000-4000-8000-000000000801';

function fixture({ superAdmin = true } = {}) {
  let handler;
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'qa-super-admin' } }, error: null }) },
    from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() {
      return { data: { admin_id: 'qa-super-admin', role: 'admin', status: 'Active', is_super_admin: superAdmin }, error: null };
    } }),
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { ok: true, files: [] }, error: null };
    },
  };
  vm.runInNewContext(executable, {
    createClient: () => client,
    corsHeaders: {},
    Deno: { env: { get: () => 'sample' }, serve: callback => { handler = callback; } },
    Response, console,
  });
  return { calls, request: (body, authenticated = true) => handler(new Request('https://example.invalid/archive-maintenance', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer sample' } : {}) },
    body: JSON.stringify({ action: 'purge', itemId, ...body }),
  })) };
}

test('permanent deletion accepts an omitted or blank reason and records null', async () => {
  for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
    const service = fixture();
    assert.equal((await service.request(body)).status, 200);
    const finalized = service.calls.find(call => call.name === 'archive_purge_finalize');
    assert.equal(finalized.args.p_reason, null);
    assert.equal(finalized.args.p_manual, true);
  }
});

test('provided reason is trimmed and preserved', async () => {
  const service = fixture();
  assert.equal((await service.request({ reason: '  Duplicate  ' })).status, 200);
  assert.equal(service.calls.at(-1).args.p_reason, 'Duplicate');
});

test('overlong reason or invalid item cannot reach purge operations', async () => {
  for (const body of [{ reason: 'x'.repeat(501) }, { itemId: 'invalid' }]) {
    const service = fixture();
    assert.equal((await service.request(body)).status, 400);
    assert.equal(service.calls.length, 0);
  }
});

test('optional reason does not weaken Super Admin authentication', async () => {
  const anonymous = fixture();
  assert.equal((await anonymous.request({}, false)).status, 403);
  assert.equal(anonymous.calls.length, 0);
  const ordinary = fixture({ superAdmin: false });
  assert.equal((await ordinary.request({})).status, 403);
  assert.equal(ordinary.calls.length, 0);
});
