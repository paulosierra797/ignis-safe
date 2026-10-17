import test from 'node:test';
import assert from 'node:assert/strict';
import { hasWorkspacePermission } from '../src/utils/accountAccess.js';

test('Super Admin permissions do not depend on the ordinary admin checkbox list', () => {
  const root = { role: 'admin', status: 'Active', is_super_admin: true, permissions: [] };
  for (const permission of ['manage_users', 'view_accounts', 'view_audit_logs']) {
    assert.equal(hasWorkspacePermission(root, permission), true);
  }
});

test('ordinary admins keep their explicit permission limits', () => {
  const admin = { role: 'admin', status: 'Active', permissions: ['view_accounts'] };
  assert.equal(hasWorkspacePermission(admin, 'view_accounts'), true);
  assert.equal(hasWorkspacePermission(admin, 'manage_users'), false);
  assert.equal(hasWorkspacePermission({ ...admin, permissions: null }, 'view_accounts'), false);
});

test('inactive accounts, non-admin roles and non-boolean flags cannot gain root access', () => {
  const root = { role: 'admin', status: 'Active', is_super_admin: true, permissions: [] };
  for (const status of ['Inactive', 'Suspended', 'Archived']) {
    assert.equal(hasWorkspacePermission({ ...root, status }, 'manage_users'), false);
  }
  assert.equal(hasWorkspacePermission({ ...root, role: 'personnel' }, 'manage_users'), false);
  assert.equal(hasWorkspacePermission({ ...root, is_super_admin: 'true' }, 'manage_users'), false);
  assert.equal(hasWorkspacePermission(null, 'manage_users'), false);
});
