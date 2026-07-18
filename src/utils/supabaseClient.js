import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
