import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DASMARINAS_LOCATION,
  OUTSIDE_DASMARINAS_LOCATION,
  getMobileUserLocation,
} from '../src/utils/mobileUserLocation.js';

test('an empty legacy address is unspecified, not automatically outside the city', () => {
  assert.equal(getMobileUserLocation({}).key, 'unspecified');
  assert.equal(getMobileUserLocation({ city: 'Other city' }).key, 'unspecified');
});

test('an explicit outside choice is displayed without a local address', () => {
  assert.deepEqual(getMobileUserLocation({}, ` ${OUTSIDE_DASMARINAS_LOCATION} `), {
    key: 'outside', label: OUTSIDE_DASMARINAS_LOCATION,
  });
});

test('existing city registrations work without the new metadata choice', () => {
  assert.equal(getMobileUserLocation({ city: 'Dasmariñas City', province: 'Cavite', barangay: 'Salawag' }).key, 'dasmarinas');
  assert.equal(getMobileUserLocation({}, DASMARINAS_LOCATION).key, 'dasmarinas');
});

test('a saved local address takes precedence over conflicting outside metadata', () => {
  assert.equal(getMobileUserLocation({ city: 'Dasmariñas City', province: 'Cavite' }, OUTSIDE_DASMARINAS_LOCATION).key, 'dasmarinas');
});
