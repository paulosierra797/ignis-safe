// One-off provisioning for the station's Admin and Super Admin back-office
// accounts. Uses the Supabase Admin Auth API (never writes auth.users directly)
// and mirrors the admin-row shape created by analytics_api/app/admin_users.py.
//
// Secrets are read from environment variables only and are never printed:
//   SUPABASE_SERVICE_ROLE_KEY     (required)
//   ADMIN_ACCOUNT_PASSWORD        (required with --apply when creating/resetting the Admin)
//   SUPER_ADMIN_ACCOUNT_PASSWORD  (required with --apply when creating/resetting the Super Admin)
//   SUPABASE_URL / SUPABASE_ANON_KEY (optional; default to VITE_* values in .env)
//
// Usage:
//   node scripts/provision-backoffice-accounts.mjs                 # dry run (no changes)
//   node scripts/provision-backoffice-accounts.mjs --apply         # create missing accounts/rows
//   node scripts/provision-backoffice-accounts.mjs --apply --reset-existing-passwords
//
// Super Admin privileges are NOT granted here: the database only allows that
// through supabase/migrations/20261014120000_add_super_admin_role.sql (or the
// set_super_admin_privilege RPC). Apply that migration after this script.
import { readFileSync, existsSync } from 'node:fs';

const ACCOUNTS = [
  {
    label: 'Admin',
    email: 'fatimaklyesierra081005@gmail.com',
    firstName: 'Fatima Klye',
    lastName: 'Sierra',
    passwordEnv: 'ADMIN_ACCOUNT_PASSWORD',
    expectSuperAdmin: false
  },
  {
    label: 'Super Admin',
    email: 'ignissafe.bfpdasmarinas@gmail.com',
    firstName: 'BFP',
    lastName: 'Dasmariñas',
    passwordEnv: 'SUPER_ADMIN_ACCOUNT_PASSWORD',
    expectSuperAdmin: true
  }
];

// Same defaults as analytics_api/app/admin_users.py for role "admin".
const ADMIN_PERMISSIONS = [
  'view_dashboard',
  'view_charts',
  'view_attendance',
  'view_accounts',
  'manage_users',
  'view_analytics',
  'view_progress',
  'view_audit_logs',
  'view_reports',
  'manage_reports'
];
const ACTIVATABLE_STATUSES = new Set(['pending activation', 'pending verification']);

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const RESET_PASSWORDS = args.has('--reset-existing-passwords');

const readDotEnv = () => {
  const path = new URL('../.env', import.meta.url);
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
};

const dotEnv = readDotEnv();
const SUPABASE_URL = String(process.env.SUPABASE_URL || dotEnv.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || dotEnv.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('SUPABASE_URL, SUPABASE_ANON_KEY (or the VITE_* values in .env) and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const serviceHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

const request = async (path, { method = 'GET', headers = serviceHeaders, body } = {}) => {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.msg || data?.message || data?.error_description || data?.error || response.statusText;
    throw new Error(`${method} ${path.split('?')[0]} failed (${response.status}): ${detail}`);
  }
  return data;
};

const findAuthUsersByEmail = async (email) => {
  const matches = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const data = await request(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
    const users = data?.users || [];
    matches.push(...users.filter((user) => String(user.email || '').toLowerCase() === email));
    if (users.length < perPage) return matches;
  }
};

const getAdminRows = async (filter) =>
  request(`/rest/v1/admin?${filter}&select=admin_id,email,role,status,permissions`);

const verifyLogin = async (email, password) => {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, reason: data?.error_description || data?.msg || `HTTP ${response.status}` };
  }
  // Sign out only this verification session, not the user's other sessions.
  await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${data.access_token}` }
  });
  return { ok: true };
};

const readSuperAdminFlag = async (adminId) => {
  try {
    const rows = await request(`/rest/v1/admin?admin_id=eq.${adminId}&select=is_super_admin`);
    return rows[0]?.is_super_admin;
  } catch {
    return undefined; // Column not present yet: Super Admin migration not applied.
  }
};

const provision = async (account) => {
  const email = account.email.toLowerCase();
  const password = process.env[account.passwordEnv] || '';
  const issues = [];
  console.log(`\n== ${account.label}: ${email}`);

  // 1. Supabase Auth user
  const authUsers = await findAuthUsersByEmail(email);
  if (authUsers.length > 1) {
    console.log(`  !! ${authUsers.length} auth users share this email; refusing to continue for this account.`);
    return { ok: false };
  }

  let authUser = authUsers[0] || null;
  if (!authUser) {
    if (!APPLY) {
      console.log('  auth user: missing (would be created with --apply)');
    } else if (!password) {
      console.log(`  !! auth user missing and ${account.passwordEnv} is not set; cannot create.`);
      return { ok: false };
    } else {
      authUser = await request('/auth/v1/admin/users', {
        method: 'POST',
        body: {
          email,
          password,
          email_confirm: true,
          user_metadata: { first_name: account.firstName, last_name: account.lastName, role: 'admin' }
        }
      });
      console.log(`  auth user: created (${authUser.id}), email confirmed`);
    }
  } else {
    console.log(`  auth user: exists (${authUser.id}), email_confirmed=${Boolean(authUser.email_confirmed_at)}, banned=${Boolean(authUser.banned_until && new Date(authUser.banned_until) > new Date())}`);
    if (RESET_PASSWORDS) {
      if (!APPLY) {
        console.log('  password: would be reset with --apply');
      } else if (!password) {
        console.log(`  !! ${account.passwordEnv} is not set; password not reset.`);
        issues.push('password not reset');
      } else {
        await request(`/auth/v1/admin/users/${authUser.id}`, {
          method: 'PUT',
          body: { password, email_confirm: true }
        });
        console.log('  password: reset to the provided value; email confirmed');
      }
    } else if (!authUser.email_confirmed_at) {
      issues.push('email not confirmed (rerun with --reset-existing-passwords to confirm it)');
    }
  }

  if (!authUser) return { ok: !APPLY };

  // 2. public.admin row linked by admin_id = auth user id
  const [byId, byEmail] = await Promise.all([
    getAdminRows(`admin_id=eq.${authUser.id}`),
    getAdminRows(`email=ilike.${encodeURIComponent(email)}`)
  ]);
  const conflicting = byEmail.filter((row) => row.admin_id !== authUser.id);
  if (conflicting.length) {
    console.log(`  !! admin row(s) with this email are linked to a different id (${conflicting.map((r) => r.admin_id).join(', ')}). Not modified; resolve manually.`);
    return { ok: false };
  }

  let adminRow = byId[0] || null;
  if (!adminRow) {
    if (!APPLY) {
      console.log('  admin row: missing (would be created as role=admin, status=Active)');
    } else {
      [adminRow] = await request('/rest/v1/admin', {
        method: 'POST',
        headers: { ...serviceHeaders, Prefer: 'return=representation' },
        body: [{
          admin_id: authUser.id,
          email,
          first_name: account.firstName,
          last_name: account.lastName,
          role: 'admin',
          status: 'Active',
          permissions: ADMIN_PERMISSIONS
        }]
      });
      console.log('  admin row: created (role=admin, status=Active)');
    }
  } else {
    const updates = {};
    const role = String(adminRow.role || '').trim().toLowerCase();
    const status = String(adminRow.status || '').trim().toLowerCase();
    if (role !== 'admin') {
      updates.role = 'admin';
      updates.permissions = ADMIN_PERMISSIONS;
    }
    if (ACTIVATABLE_STATUSES.has(status)) updates.status = 'Active';
    else if (status !== 'active') issues.push(`status is "${adminRow.status}" (left unchanged; login requires Active)`);

    if (!Object.keys(updates).length) {
      console.log(`  admin row: exists (role=${adminRow.role}, status=${adminRow.status})`);
    } else if (!APPLY) {
      console.log(`  admin row: exists, would update ${JSON.stringify({ ...updates, permissions: updates.permissions ? '[admin defaults]' : undefined })}`);
    } else {
      [adminRow] = await request(`/rest/v1/admin?admin_id=eq.${authUser.id}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders, Prefer: 'return=representation' },
        body: { ...updates, updated_at: new Date().toISOString() }
      });
      console.log(`  admin row: updated (role=${adminRow.role}, status=${adminRow.status})`);
    }
  }

  // 3. Super Admin flag (read-only here; enforced by the migration)
  const isSuperAdmin = await readSuperAdminFlag(authUser.id);
  if (isSuperAdmin === undefined) {
    console.log('  super admin flag: column not present yet (apply the Super Admin migration next)');
  } else {
    console.log(`  super admin flag: ${isSuperAdmin}`);
    if (isSuperAdmin !== account.expectSuperAdmin) {
      issues.push(account.expectSuperAdmin
        ? 'not yet Super Admin (apply/rerun the Super Admin migration)'
        : 'unexpectedly flagged as Super Admin (revoke via the Accounts page)');
    }
  }

  // 4. Password login check (only when a password was provided)
  if (password) {
    const login = await verifyLogin(email, password);
    console.log(`  login with provided password: ${login.ok ? 'OK' : `FAILED (${login.reason})`}`);
    if (!login.ok) issues.push('login failed with the provided password');
  } else {
    console.log(`  login check: skipped (${account.passwordEnv} not set)`);
  }

  issues.forEach((issue) => console.log(`  note: ${issue}`));
  return { ok: issues.length === 0 };
};

console.log(APPLY ? 'Mode: APPLY' : 'Mode: DRY RUN (no changes; pass --apply to make changes)');
let allOk = true;
for (const account of ACCOUNTS) {
  try {
    const { ok } = await provision(account);
    allOk = allOk && ok;
  } catch (error) {
    allOk = false;
    console.log(`  !! ${error.message}`);
  }
}
console.log(allOk ? '\nDone.' : '\nFinished with items that need attention (see above).');
process.exit(allOk ? 0 : 1);
