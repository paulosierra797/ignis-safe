import { lazy } from 'react';

// Vite emits content-hashed chunk filenames (e.g. Announcements-DyVZsVcs.js).
// After a new deploy the old hashes are gone from the server, so a tab that
// has been open since before the deploy - or one that navigated to a route
// whose chunk had not been fetched yet - tries to import a filename that now
// 404s (Vercel's SPA rewrite serves index.html for it, so the browser reports
// a MIME/parse failure). It is not a code bug and the user has not lost
// access: the fix is to re-fetch the current index.html and its up-to-date
// chunk map with a single hard reload.
//
// That recovery lives in the error boundaries (AppErrorBoundary /
// RouteErrorBoundary), which first confirm against /version.json that a newer
// deployment actually exists before reloading - so a transient network blip or
// a genuinely missing asset on the current build shows a normal retry screen
// instead of an endless reload loop. This module only rides out transient
// failures with a few quick retries and otherwise lets the error through.
const CHUNK_LOAD_ERROR_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk [\d]+ failed|loading css chunk/i;

export function isChunkLoadError(error) {
  const message = (error && (error.message || error.toString())) || String(error || '');
  return CHUNK_LOAD_ERROR_PATTERN.test(message);
}

// Drop-in replacement for React.lazy that retries a failed import a few times
// to ride out a transient network blip. A failure that survives the retries is
// re-thrown for the nearest error boundary to classify and recover from.
export function lazyWithRetry(factory, { retries = 2, interval = 350 } = {}) {
  return lazy(() => {
    const attempt = (remaining) =>
      factory().catch((error) => {
        if (remaining > 0) {
          return new Promise((resolve) => setTimeout(resolve, interval))
            .then(() => attempt(remaining - 1));
        }

        throw error;
      });

    return attempt(retries);
  });
}
