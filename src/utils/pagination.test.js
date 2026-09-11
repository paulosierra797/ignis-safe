import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE, pageNumbers } from './pagination.js';
import { readAllRows } from './readAllRows.js';

test('all list pages use ten records', () => assert.equal(PAGE_SIZE, 10));
test('number windows include first, current and last pages without duplicates', () => {
  for (const total of [1, 2, 7, 8, 31, 150]) {
    for (let current = 1; current <= total; current++) {
      const pages = pageNumbers(current, total);
      const numbers = pages.filter(page => typeof page === 'number');
      assert.ok(numbers.includes(1) && numbers.includes(current) && numbers.includes(total));
      assert.equal(new Set(numbers).size, numbers.length);
      assert.ok(pages.length <= 7);
    }
  }
});
test('history loading traverses API batches without dropping older records', async () => {
  const source = Array.from({ length: 1031 }, (_, id) => ({ id }));
  const rows = await readAllRows(() => ({ range: async (start, end) => ({ data: source.slice(start, end + 1) }) }));
  assert.deepEqual(rows, source);
  const limited = await readAllRows(() => ({ range: async (start, end) => ({ data: source.slice(start, end + 1) }) }), 20);
  assert.equal(limited.length, 20);
});
test('history loading reports errors instead of returning an incomplete list', async () => {
  await assert.rejects(readAllRows(() => ({ range: async () => ({ error: { message: 'Access denied' } }) })), /Access denied/);
});
