import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Persist the Supabase auth session (access + refresh tokens) in localStorage,
// the Supabase default. localStorage is shared across every tab on the origin,
// so a user who is already signed in stays signed in when the Attendance / QR
// link opens in a new tab or window - the attendance guard reuses the existing
// session instead of bouncing a logged-in user through /login again.
// (sessionStorage is scoped to a single browsing context, so a freshly opened
// tab would see no session and the guard would treat the user as logged out.)
//
// Older builds parked other sensitive values in durable storage; strip those on
// startup - but never the Supabase auth token itself, which IS the session we
// want to keep available.
const clearLegacySensitiveBrowserStorage = () => {
  if (typeof window === 'undefined') return;

  try {
    [
      'user',
      'attendanceAuth',
      'ignis-safe:device_id',
      'ignis-safe:device_secret',
      'ignis-safe:visitor-chat-access',
      'ignis-safe:visitor-chat-draft',
      'ignis-safe:visitor-chat-pending',
    ].forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Restricted/private browser contexts can deny storage access. The client
    // still falls back to its in-memory storage below.
  }
};

clearLegacySensitiveBrowserStorage();

const memoryStorage = new Map();
const authStorage = typeof window !== 'undefined'
  ? window.localStorage
  : {
    getItem: (key) => memoryStorage.get(key) || null,
    setItem: (key, value) => memoryStorage.set(key, value),
    removeItem: (key) => memoryStorage.delete(key),
  };

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables');
}

// Singleton pattern to ensure only one Supabase client instance
let supabaseInstance = null;

const inProcessAuthLock = async (_name, _acquireTimeout, fn) => {
  // Avoid browser LockManager deadlocks across tabs for this client.
  return fn();
};

function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: authStorage,
        lock: inProcessAuthLock,
      },
    });
  }
  return supabaseInstance;
}

// Lazily create the real client on first use instead of at import time.
// createClient() throws synchronously when the env vars are missing/invalid,
// and this module is imported (transitively) from nearly every page, so an
// eager throw here used to crash the entire app into a blank screen instead
// of letting existing try/catch data-fetching code surface a friendly error.
export const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
