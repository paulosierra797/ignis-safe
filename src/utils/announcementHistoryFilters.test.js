import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSpecificRecipient } from './announcementHistoryFilters.js';

const announcement = { audience_type: 'specific_personnel', target_personnel_ids: ['p1'], target_personnel_names: ['SFO3 Jane Doe'] };
test('recipient search matches target names and current account email', () => {
  assert.equal(matchesSpecificRecipient(announcement, ' jane '), true);
  assert.equal(matchesSpecificRecipient(announcement, 'jane@example.com', [{ admin_id: 'p1', email: 'jane@example.com' }]), true);
});
test('recipient search never matches public or all-personnel messages', () => {
  for (const audience_type of ['public', 'all_personnel']) {
    assert.equal(matchesSpecificRecipient({ ...announcement, audience_type }, 'Jane'), false);
  }
});
test('matches historical tracked accounts and legacy single-recipient records', () => {
  assert.equal(matchesSpecificRecipient({ audience_type: 'specific_personnel', acknowledgement_tracking: [{ name: 'Former Account', email: 'old@example.com' }] }, 'old@example'), true);
  assert.equal(matchesSpecificRecipient({ audience_type: 'specific_personnel', target_personnel_id: 'p1' }, 'Jane', [{ admin_id: 'p1', name: 'Jane' }]), true);
});
test('ignores unrelated directory accounts and names only present in message content', () => {
  assert.equal(matchesSpecificRecipient({ ...announcement, content: 'Call John' }, 'John', [{ admin_id: 'p2', name: 'John' }]), false);
  assert.equal(matchesSpecificRecipient(announcement, ''), true);
});
