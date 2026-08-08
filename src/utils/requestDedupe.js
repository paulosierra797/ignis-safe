// Single-flight request cache: if the same keyed request is already in
// flight, callers await the same promise instead of firing a duplicate
// round trip. The entry is cleared as soon as the request settles, so the
// next call (e.g. a later refresh) always gets a fresh fetch.
const inFlightRequests = new Map();

export const dedupeRequest = (key, factory) => {
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const promise = factory().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
};
