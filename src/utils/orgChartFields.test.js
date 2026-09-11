import test from 'node:test';
import assert from 'node:assert/strict';
import { separateOrgRank } from './orgChartFields.js';

test('separates existing standard and historical rank prefixes', () => {
  for (const rank of ['SFO3', 'FO1', 'CINSP', 'FCINSP', 'FSINSP']) {
    assert.deepEqual(separateOrgRank({ name: `${rank} Jane Doe` }), { rank, name: 'Jane Doe' });
  }
});

test('does not guess an unknown prefix or remove part of a name', () => {
  assert.deepEqual(separateOrgRank({ name: 'Jane Doe' }), { rank: '', name: 'Jane Doe' });
  assert.deepEqual(separateOrgRank({ name: 'Custom Jane Doe' }), { rank: '', name: 'Custom Jane Doe' });
});

test('preserves explicit custom and empty ranks on reload', () => {
  for (const rank of ['Station Officer', '']) {
    const node = { rank, name: 'Jane Doe' };
    assert.deepEqual(separateOrgRank(JSON.parse(JSON.stringify(node))), node);
  }
});

test('normalizing an existing record repeatedly does not strip its name again', () => {
  const result = separateOrgRank({ name: 'FCINSP Jane Doe' });
  assert.deepEqual(separateOrgRank(result), result);
});
