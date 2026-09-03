import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase normally persists access and refresh tokens in localStorage. Keep
// the session available during a tab reload, but do not leave bearer
// credentials in durable browser storage. Remove credentials written by older
// builds before creating the new client.
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

    if (SUPABASE_URL) {
      const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
      if (projectRef) window.localStorage.removeItem(`sb-${projectRef}-auth-token`);
    }
  } catch {
    // Restricted/private browser contexts can deny storage access. The client
    // still falls back to its in-memory storage below.
  }
};

clearLegacySensitiveBrowserStorage();

const memoryStorage = new Map();
const authStorage = typeof window !== 'undefined'
  ? window.sessionStorage
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
