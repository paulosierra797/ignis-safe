import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccountTier, planAccountRoleChange } from '../src/utils/accountRoleChanges.js';

test('ordinary Admin can be planned for demotion to Personnel', () => {
  assert.deepEqual(planAccountRoleChange({ role: 'Admin', is_super_admin: false }, 'personnel'), {
    kind: 'demote', label: 'Admin to Personnel',
  });
});

test('Super Admin must first become Admin; Personnel cannot skip directly to Super Admin', () => {
  assert.equal(planAccountRoleChange({ role: 'admin', is_super_admin: true }, 'personnel').kind, 'invalid');
  assert.equal(planAccountRoleChange({ role: 'personnel' }, 'super_admin').kind, 'invalid');
  assert.equal(planAccountRoleChange({ role: 'admin', is_super_admin: true }, 'admin').kind, 'demote');
});

test('existing promotions and unchanged roles remain supported', () => {
  assert.equal(planAccountRoleChange({ role: 'personnel' }, 'admin').kind, 'promote');
  assert.equal(planAccountRoleChange({ role: 'admin' }, 'super_admin').kind, 'promote');
  assert.equal(planAccountRoleChange({ role: 'admin' }, 'admin').kind, 'none');
  assert.equal(getAccountTier({ role: ' Admin ', is_super_admin: 'false' }), 'admin');
});
