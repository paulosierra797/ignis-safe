import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMobileUserAge, normalizeMobileUserAge } from '../src/utils/mobileUserAge.js';

test('formats actual ages without exposing a birth date', () => {
  assert.equal(formatMobileUserAge(22), '22 years old');
  assert.equal(formatMobileUserAge(' 35 '), '35 years old');
  assert.equal(formatMobileUserAge(1), '1 year old');
  assert.equal(formatMobileUserAge(0), '0 years old');
});

test('missing registration ages remain unknown instead of becoming zero', () => {
  for (const value of [null, undefined, '', ' ', false, true, [], {}, 'Not recorded']) {
    assert.equal(normalizeMobileUserAge(value), null);
    assert.equal(formatMobileUserAge(value), 'Not recorded');
  }
});

test('rejects malformed, fractional, negative and implausible registration ages', () => {
  for (const value of [-1, 131, 22.5, NaN, Infinity, '22.0', '2e1', '0x14', '22 years', '2004-10-17']) {
    assert.equal(normalizeMobileUserAge(value), null);
  }
  assert.equal(normalizeMobileUserAge(130), 130);
});
