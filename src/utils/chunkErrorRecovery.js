// Vite emits content-hashed chunk filenames (e.g. Announcements-DyVZsVcs.js).
// After a new deploy, the old hashes are gone from the server. A browser tab
// that has been open since before the deploy - or one serving a stale cached
// index.html - will still try to import the old filename and get a 404,
// which surfaces as "Failed to fetch dynamically imported module". This is
// not a code bug, it's a deploy/cache-staleness race, so the correct recovery
// is a one-time hard reload to pick up the current index.html + chunk map.
const CHUNK_LOAD_ERROR_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk [\d]+ failed|loading css chunk/i;

const RELOAD_FLAG_KEY = 'ignis-safe:chunk-reload-attempted';

// A guard based on "has App mounted since" doesn't work: App's shell mounts
// and renders successfully *before* the lazy import (which is async) has a
// chance to reject, so clearing the guard on mount races the very error
// it's meant to guard against and produces a tight reload loop. Using a
// time window instead means: one auto-reload per genuinely new failure, and
// any failure that repeats within the window (including the reload loop
// case above) falls straight through to the manual-retry screen.
const RELOAD_DEBOUNCE_MS = 15000;

export function isChunkLoadError(error) {
  const message = (error && error.message) || String(error || '');
  return CHUNK_LOAD_ERROR_PATTERN.test(message);
}

export function hasAlreadyAttemptedReload() {
  try {
    const attemptedAt = Number(sessionStorage.getItem(RELOAD_FLAG_KEY));
    return Boolean(attemptedAt) && Date.now() - attemptedAt < RELOAD_DEBOUNCE_MS;
  } catch {
    return false;
  }
}

export function markReloadAttempted() {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode, etc) - reload still proceeds,
    // it just won't be guarded against looping.
  }
}
