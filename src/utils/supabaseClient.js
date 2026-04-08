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

export const supabase = getSupabaseClient();
