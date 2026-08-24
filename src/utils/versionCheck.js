// Vite/Vercel builds emit a distinct build id per deployment (see
// vite.config.js): __APP_BUILD_ID__ is baked into this bundle, and the same
// id is mirrored into dist/version.json, served live at /version.json. A tab
// left open across a deploy can therefore detect the mismatch by polling
// version.json, without needing a service worker.
const CURRENT_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
// Guards both the interval and the focus/visibility listeners so rapid tab
// switching can't turn into a burst of requests.
const MIN_CHECK_GAP_MS = 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 10000;

const DISMISSED_KEY = 'ignis-safe:dismissed-build-id';
const UPDATE_QUERY_PARAM = '_ignis_update';
const CLEANUP_TIMEOUT_MS = 1500;

export function getCurrentBuildId() {
  return CURRENT_BUILD_ID;
}

export function isDismissed(buildId) {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === buildId;
  } catch {
    return false;
  }
}

export function markDismissed(buildId) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, buildId);
  } catch {
    // sessionStorage unavailable (private mode, etc) - worst case the toast
    // can reappear after "Later", which is harmless.
  }
}

export function clearUpdateMarker() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(UPDATE_QUERY_PARAM)) return;

    url.searchParams.delete(UPDATE_QUERY_PARAM);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch {
    // A malformed or restricted URL should never prevent the app from loading.
  }
}

async function fetchLatestBuildId() {
  const response = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  return data && typeof data.buildId === 'string' ? data.buildId : null;
}

// Polls /version.json on an interval and whenever the tab regains focus, and
// calls onUpdateAvailable(buildId) the first time a build id shows up that
// differs from the one this tab is running and hasn't already been
// dismissed. Returns a cleanup function.
//
// No-ops in dev: `vite dev` never emits version.json, so every request would
// just 404, and HMR already handles updates there.
export function startVersionPolling(onUpdateAvailable) {
  if (import.meta.env.DEV) return () => {};

  let cancelled = false;
  let lastCheckAt = 0;

  const check = async () => {
    const now = Date.now();
    if (now - lastCheckAt < MIN_CHECK_GAP_MS) return;
    lastCheckAt = now;

    try {
      const latestBuildId = await fetchLatestBuildId();
      if (cancelled || !latestBuildId) return;
      if (latestBuildId !== CURRENT_BUILD_ID && !isDismissed(latestBuildId)) {
        onUpdateAvailable(latestBuildId);
      }
    } catch {
      // Offline / network hiccup - the next interval or focus event retries.
    }
  };

  const intervalId = setInterval(check, POLL_INTERVAL_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') check();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', check);
  const initialTimeoutId = setTimeout(check, INITIAL_CHECK_DELAY_MS);

  return () => {
    cancelled = true;
    clearInterval(intervalId);
    clearTimeout(initialTimeoutId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', check);
  };
}

// Best-effort clear of Cache Storage and service worker registrations before
// navigating to a unique URL. The cleanup is time-bounded so a browser API
// cannot leave the refresh button waiting forever. The query marker forces a
// fresh document request and is removed from the address bar on startup.
export async function applyUpdate({ fallbackToHome = false } = {}) {
  const cleanupBrowserCaches = async () => {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  };

  const unregisterServiceWorkers = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  };

  const cleanup = Promise.allSettled([
    cleanupBrowserCaches(),
    unregisterServiceWorkers()
  ]);

  await Promise.race([
    cleanup,
    new Promise((resolve) => window.setTimeout(resolve, CLEANUP_TIMEOUT_MS))
  ]);

  // A route whose lazy chunk was removed by a deployment can keep failing
  // when that exact history entry is reloaded. Manual recovery can return to
  // the stable application entry point while still requesting a unique URL.
  const url = fallbackToHome
    ? new URL('/', window.location.origin)
    : new URL(window.location.href);
  url.searchParams.set(UPDATE_QUERY_PARAM, String(Date.now()));
  window.location.replace(url.toString());
}
