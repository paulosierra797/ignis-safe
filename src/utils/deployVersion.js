// Deployment-version detection for the "Update available" screen.
//
// `__APP_BUILD_ID__` is replaced at build time (see vite.config.js) with the
// id of the deployment this bundle belongs to. The same id is written to
// dist/version.json and served live at /version.json. When a lazy chunk fails
// to load we compare the two: only a real mismatch means "a newer deployment
// exists" - anything else (offline, version.json unreachable, same id) is a
// genuine load failure, not a deploy, and must NOT trigger a reload loop.

const RUNNING_BUILD_ID =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

// One automatic hard-reload per running build id. Keyed by the id we are
// running now, so once the reload lands us on the new build the guard for
// that new id is unset and the flag self-expires when the tab closes.
const RELOAD_GUARD_PREFIX = 'ignis-safe:deploy-reload-attempted:';

export function getRunningBuildId() {
  return RUNNING_BUILD_ID;
}

function guardKey() {
  return `${RELOAD_GUARD_PREFIX}${RUNNING_BUILD_ID}`;
}

export function hasAutoReloadedForThisBuild() {
  try {
    return sessionStorage.getItem(guardKey()) === '1';
  } catch {
    return false;
  }
}

export function markAutoReloadedForThisBuild() {
  try {
    sessionStorage.setItem(guardKey(), '1');
  } catch {
    // sessionStorage unavailable (private mode) - worst case we skip the one
    // automatic reload and fall straight to the manual "Update available"
    // screen, which is still safe (no loop).
  }
}

// Fetches the currently deployed build id from /version.json. Returns null on
// any failure (dev server with no version.json, offline, malformed body) so
// callers treat "unknown" as "not a new deployment".
export async function fetchDeployedBuildId() {
  try {
    const response = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data.buildId === 'string' ? data.buildId : null;
  } catch {
    return null;
  }
}

// True only when we can positively confirm the deployed build differs from the
// one running in this tab.
export async function isNewerDeploymentAvailable() {
  const deployedBuildId = await fetchDeployedBuildId();
  if (!deployedBuildId) return false;
  return deployedBuildId !== RUNNING_BUILD_ID;
}

// Decide what to do when a lazy chunk fails to load and the in-place retries
// are exhausted:
//   'reload'           - a newer deployment exists and we have not auto-reloaded
//                        yet for this build; caller should hard-reload now.
//   'update-available' - a newer deployment exists but we already auto-reloaded
//                        once (deploy still propagating); show the manual
//                        "Update available" screen, no further auto-reload.
//   'load-failed'      - no newer deployment; this is a genuine load failure,
//                        show a normal retry screen and do NOT reload-loop.
export async function planChunkErrorRecovery() {
  const newerDeployment = await isNewerDeploymentAvailable();
  if (!newerDeployment) return 'load-failed';
  if (hasAutoReloadedForThisBuild()) return 'update-available';
  markAutoReloadedForThisBuild();
  return 'reload';
}
