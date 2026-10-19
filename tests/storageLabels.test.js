import test from 'node:test';
import assert from 'node:assert/strict';
import { storageLabel } from '../src/utils/storageLabels.js';

test('storage labels explain the contents without exposing bucket identifiers', () => {
  assert.equal(storageLabel('system-backups'), 'System backups');
  assert.equal(storageLabel('report_files'), 'Report attachments');
  assert.equal(storageLabel('profile_pic'), 'Profile photos');
  assert.equal(storageLabel('leave_supporting_documents'), 'Leave documents');
  assert.equal(storageLabel('attendance_verifications'), 'Attendance verification files');
});

test('new storage identifiers have a readable fallback', () => {
  assert.equal(storageLabel('new_upload-area'), 'New upload area');
  assert.equal(storageLabel(null), 'Other files');
});
