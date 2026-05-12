import { supabase } from './supabaseClient';

const ACTIVE_SESSION_STORAGE_KEY = 'ignis-safe:active-app-session';
const MAX_APP_SESSION_DURATION_SECONDS = Number(
  import.meta.env.VITE_MAX_APP_SESSION_DURATION_SECONDS || 86400,
);

const isBrowser = () => typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

const readActiveSession = () => {
  if (!isBrowser()) return null;

  try {
    const raw = sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Could not read active app session:', error);
    return null;
  }
};

const writeActiveSession = (session) => {
  if (!isBrowser()) return;

  try {
    sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn('Could not persist active app session:', error);
  }
};

const clearActiveSession = () => {
  if (!isBrowser()) return;

  try {
    sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn('Could not clear active app session:', error);
  }
};

const parseTimestamp = (value) => {
  if (!value) return null;

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const getSessionDurationSeconds = (startedAt, endedAt) => {
  const started = parseTimestamp(startedAt);
  const ended = parseTimestamp(endedAt);

  if (started === null || ended === null) return 0;

  const diffSeconds = Math.max(0, Math.floor((ended - started) / 1000));
  if (diffSeconds <= 0) return 0;
  if (diffSeconds > MAX_APP_SESSION_DURATION_SECONDS) return 0;

  return diffSeconds;
};

export const startAppSession = async (adminId) => {
  if (!adminId || !isBrowser()) {
    return { data: null, error: null };
  }

  const activeSession = readActiveSession();
  if (activeSession?.sessionId && activeSession?.adminId === adminId) {
    return { data: activeSession, error: null };
  }

  const startedAt = new Date().toISOString();
  const payload = {
    admin_id: adminId,
    started_at: startedAt,
    metadata: {
      origin: window.location.origin,
      path: window.location.pathname,
      user_agent: navigator.userAgent,
    },
  };

  const { data, error } = await supabase
    .from('app_sessions')
    .insert(payload)
    .select('session_id, admin_id, started_at')
    .single();

  if (error) {
    console.warn('Could not start app session:', error);
    return { data: null, error };
  }

  const nextSession = {
    sessionId: data.session_id,
    adminId: data.admin_id,
    startedAt: data.started_at || startedAt,
  };

  writeActiveSession(nextSession);

  return { data: nextSession, error: null };
};

export const endAppSession = async ({ sessionId, adminId, startedAt, reason = 'pagehide' } = {}) => {
  if (!isBrowser()) {
    return { data: null, error: null };
  }

  const activeSession = readActiveSession();
  const resolvedSessionId = sessionId || activeSession?.sessionId;
  const resolvedAdminId = adminId || activeSession?.adminId;
  const resolvedStartedAt = startedAt || activeSession?.startedAt;

  if (!resolvedSessionId || !resolvedAdminId) {
    clearActiveSession();
    return { data: null, error: null };
  }

  const endedAt = new Date().toISOString();
  const durationSeconds = getSessionDurationSeconds(resolvedStartedAt, endedAt);

  const { error } = await supabase
    .from('app_sessions')
    .update({
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      closure_reason: reason,
      updated_at: endedAt,
      metadata: {
        closed_from: reason,
      },
    })
    .eq('session_id', resolvedSessionId)
    .eq('admin_id', resolvedAdminId);

  if (error) {
    console.warn('Could not end app session:', error);
  }

  if (activeSession?.sessionId === resolvedSessionId) {
    clearActiveSession();
  }

  return {
    data: {
      sessionId: resolvedSessionId,
      adminId: resolvedAdminId,
      startedAt: resolvedStartedAt,
      endedAt,
      durationSeconds,
    },
    error: error || null,
  };
};
