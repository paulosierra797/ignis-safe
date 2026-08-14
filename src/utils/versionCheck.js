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

// Best-effort clear of any Cache Storage entries / service worker
// registrations (defensive - the app doesn't currently register either, but
// this keeps "Refresh Now" correct if one is ever added) before reloading.
// The reload itself is what actually picks up the new index.html and its
// current chunk map; Vercel serves index.html as non-immutable/revalidate,
// so a plain reload already bypasses stale hashed-asset caching.
export async function applyUpdate() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // best-effort only
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // best-effort only
  }

  window.location.reload();
}
