import { lazy } from 'react';
import { bypassNextReloadGuard } from './reloadGuard';

// Vite emits content-hashed chunk filenames (e.g. Announcements-DyVZsVcs.js).
// After a new deploy the old hashes are gone from the server, so a tab that
// has been open since before the deploy - or one that navigated to a route
// whose chunk had not been fetched yet - tries to import a filename that now
// 404s. The browser surfaces this as "Failed to fetch dynamically imported
// module". It is not a code bug and the user has not lost access: the fix is
// to re-fetch the current index.html (and its up-to-date chunk map) with a
// single hard reload. Only if that reload also fails do we let the error
// through to the error screen.
const CHUNK_LOAD_ERROR_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk [\d]+ failed|loading css chunk/i;

const RELOAD_FLAG_KEY = 'ignis-safe:chunk-reload-attempted';

// One auto-reload per genuinely new failure. A failure that repeats within
// this window (e.g. the chunk is really gone and not just stale cache, or a
// reload loop) falls straight through to the manual-retry screen instead.
const RELOAD_DEBOUNCE_MS = 15000;

export function isChunkLoadError(error) {
  const message = (error && (error.message || error.toString())) || String(error || '');
  return CHUNK_LOAD_ERROR_PATTERN.test(message);
}

function hasReloadedRecently() {
  try {
    const attemptedAt = Number(sessionStorage.getItem(RELOAD_FLAG_KEY));
    return Boolean(attemptedAt) && Date.now() - attemptedAt < RELOAD_DEBOUNCE_MS;
  } catch {
    return false;
  }
}

// Exported so the outer error boundary can perform the same one-time recovery
// for a chunk error that reached it through a path other than a lazy import.
export function reloadOnceForStaleChunk() {
  if (hasReloadedRecently()) return false;
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode, etc) - the reload still
    // proceeds, it just will not be guarded against looping.
  }
  bypassNextReloadGuard();
  window.location.reload();
  return true;
}

// Drop-in replacement for React.lazy that (1) retries a failed import a few
// times to ride out a transient network blip, and (2) treats a persistent
// stale-chunk failure as a deploy race and heals it with one hard reload,
// instead of dead-ending the whole app on the router error screen.
export function lazyWithRetry(factory, { retries = 2, interval = 350 } = {}) {
  return lazy(() => {
    const attempt = (remaining) =>
      factory().catch((error) => {
        if (remaining > 0) {
          return new Promise((resolve) => setTimeout(resolve, interval))
            .then(() => attempt(remaining - 1));
        }

        if (isChunkLoadError(error) && reloadOnceForStaleChunk()) {
          // The reload is already underway; keep Suspense pending so nothing
          // renders (and no error is thrown) before the navigation happens.
          return new Promise(() => {});
        }

        throw error;
      });

    return attempt(retries);
  });
}
