// Shared recovery actions for the "Update available" / "Something went wrong"
// error screens (RouteErrorBoundary, AppErrorBoundary). These screens can
// render outside the Router/UserProvider tree, so everything here works off
// `window.location` and `localStorage` rather than app context.
import { bypassNextReloadGuard, setReloadGuardActive } from './reloadGuard';

// Where each signed-in role belongs. Kept in sync with the post-login redirect
// in LoginPage and the fallbacks in ProtectedRoute. A visitor with no stored
// session goes to the public landing page. Auth is still enforced by
// ProtectedRoute on arrival - this only picks the destination.
export function getRoleHomePath() {
  let role = '';
  try {
    const raw = localStorage.getItem('user');
    role = raw ? String(JSON.parse(raw)?.role || '').trim().toLowerCase() : '';
  } catch {
    role = '';
  }

  if (role === 'admin') return '/dashboard';
  if (role === 'personnel') return '/personnel/operations';
  return '/';
}

// Drop any client-side caches that could keep an outdated build alive, so the
// next document load is guaranteed to come from the server. There is no
// service worker today, but unregistering defensively keeps this correct if
// one is ever added.
async function clearStaleClientCaches() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // ignore - proceed with the reload regardless
  }

  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignore - proceed with the reload regardless
  }
}

// "Refresh page" - reload the app so the latest deployed version loads. The
// only thing that can be stale after a deploy is the HTML document (hashed
// JS/CSS chunks are immutable), so we bust its HTTP cache with a throwaway
// query param and replace the current entry so it doesn't pile up in history.
export async function hardReloadToLatest() {
  await clearStaleClientCaches();
  // Any verification flow that armed the reload guard is gone once an error
  // screen is showing, so clear it and suppress the one native prompt the
  // pending reload would otherwise raise.
  setReloadGuardActive(false);
  bypassNextReloadGuard();

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString(36));
    window.location.replace(url.href);
  } catch {
    window.location.reload();
  }
}

// "Return to home" - send the user to the right place for their role with a
// full document load (also picks up a fresh build). ProtectedRoute still runs
// on arrival, so a signed-out or unauthorized user is bounced to /login.
export async function returnToRoleHome() {
  await clearStaleClientCaches();
  setReloadGuardActive(false);
  bypassNextReloadGuard();
  window.location.assign(getRoleHomePath());
}
