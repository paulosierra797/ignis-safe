// Centralizes the "verification in progress" guard so any in-app trigger of
// a reload (not just the page that owns the verification) can check it
// before acting, and so there is exactly one native beforeunload listener
// for the whole app - the browser's own "Reload site?" dialog is what fires
// for actual browser refresh/Ctrl+R/tab close, and it can't be restyled, so
// this module only decides *whether* it should be allowed to appear.
let active = false;
let bypassOnce = false;

export function setReloadGuardActive(nextActive) {
  active = nextActive;
}

export function isReloadGuardActive() {
  return active;
}

// Lets an in-app flow that already showed its own styled confirmation (and
// got a "yes") suppress the native prompt for the reload it's about to cause.
export function bypassNextReloadGuard() {
  bypassOnce = true;
}

function handleBeforeUnload(event) {
  if (!active || bypassOnce) {
    bypassOnce = false;
    return;
  }
  event.preventDefault();
  event.returnValue = '';
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', handleBeforeUnload);
}
