export const VISITOR_CHAT_MAX_LENGTH = 1500;
export const VISITOR_CHAT_STORAGE_KEY = 'ignis-safe:visitor-chat-access';
export const VISITOR_CHAT_DRAFT_KEY = 'ignis-safe:visitor-chat-draft';
export const VISITOR_CHAT_PENDING_KEY = 'ignis-safe:visitor-chat-pending';
export const VISITOR_CHAT_VISITOR_ID_KEY = 'ignis-safe:visitor-id';

// Hard ceiling for a single Edge Function call. Without it a stalled connection
// leaves the caller awaiting forever, which is what pins the submit button on
// its "Sending..." state. On timeout the caller gets a normal error result.
export const VISITOR_CHAT_REQUEST_TIMEOUT_MS = 30000;

// crypto.randomUUID() is unavailable in insecure contexts and older browsers;
// falling back keeps message submission from throwing before it even starts.
export const createClientMessageId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the manual identifier below
  }
  return 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
};

// Persistent per-browser identifier (survives across tabs/sessions, unlike the
// sessionStorage-scoped recovery code) so the server can scope conversation-creation
// rate limits to this visitor instead of falling back to a shared IP address.
export const getOrCreateVisitorId = () => {
  try {
    const existing = localStorage.getItem(VISITOR_CHAT_VISITOR_ID_KEY);
    if (existing) return existing;
    const visitorId = createClientMessageId();
    localStorage.setItem(VISITOR_CHAT_VISITOR_ID_KEY, visitorId);
    return visitorId;
  } catch {
    return createClientMessageId();
  }
};

const readFunctionErrorPayload = async (error) => {
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') return null;

  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

const formatRetryAfterMessage = (retryAfterSeconds) => {
  if (retryAfterSeconds < 60) return 'Please try again in less than a minute.';
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return 'Please try again in ' + minutes + ' minute' + (minutes === 1 ? '' : 's') + '.';
};

const withRetryAfter = (message, retryAfterSeconds) => {
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) return message;
  return (message ? message + ' ' : '') + formatRetryAfterMessage(retryAfterSeconds);
};

const TIMEOUT_MARKER = Symbol('visitor-chat-timeout');

const withTimeout = (promise, timeoutMs) => {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(TIMEOUT_MARKER), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

const invoke = async (functionName, body) => {
  try {
    const { supabase } = await import('./supabaseClient');
    const response = await withTimeout(
      supabase.functions.invoke(functionName, { body }),
      VISITOR_CHAT_REQUEST_TIMEOUT_MS,
    );
    if (response === TIMEOUT_MARKER) {
      return { data: null, error: 'The request timed out. Please check your connection and try again.' };
    }
    const { data, error } = response || {};
    if (error) {
      const payload = await readFunctionErrorPayload(error);
      const message = payload?.error || error.message || 'Messaging is temporarily unavailable.';
      return {
        data: null,
        error: payload ? withRetryAfter(message, payload.retryAfter) : message,
      };
    }
    if (data?.error) return { data: null, error: withRetryAfter(data.error, data.retryAfter) };
    return { data: data?.data || null, error: null };
  } catch (error) {
    console.error('Visitor messaging request failed:', error);
    return { data: null, error: 'Messaging is temporarily unavailable.' };
  }
};

export const startVisitorConversation = ({ name, email, message, website = '', clientMessageId }) =>
  invoke('visitor-chat', {
    action: 'start',
    name,
    email,
    message,
    website,
    clientMessageId,
    visitorId: getOrCreateVisitorId(),
  });

export const fetchVisitorConversation = ({ recoveryCode, markRead = false }) =>
  invoke('visitor-chat', { action: 'fetch', recoveryCode, markRead });

export const sendVisitorMessage = ({ recoveryCode, message, clientMessageId }) =>
  invoke('visitor-chat', {
    action: 'send',
    recoveryCode,
    message,
    clientMessageId,
  });

export const listAdminVisitorConversations = ({ archived = false } = {}) =>
  invoke('admin-visitor-chat', { action: 'list', archived });

export const getAdminVisitorConversation = (conversationId) =>
  invoke('admin-visitor-chat', { action: 'get', conversationId });

export const replyToVisitorConversation = ({ conversationId, message, clientMessageId }) =>
  invoke('admin-visitor-chat', {
    action: 'reply',
    conversationId,
    message,
    clientMessageId,
  });

export const setVisitorConversationStatus = ({ conversationId, status }) =>
  invoke('admin-visitor-chat', {
    action: 'set-status',
    conversationId,
    status,
  });

export const archiveVisitorConversation = (conversationId) =>
  invoke('admin-visitor-chat', { action: 'archive', conversationId });

export const restoreVisitorConversation = (conversationId) =>
  invoke('admin-visitor-chat', { action: 'restore', conversationId });

export const scheduleVisitorConversationDeletion = (conversationId) =>
  invoke('admin-visitor-chat', { action: 'schedule-delete', conversationId });

export const readVisitorChatAccess = () => {
  try {
    return JSON.parse(sessionStorage.getItem(VISITOR_CHAT_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
};

export const storeVisitorChatAccess = (access) => {
  try {
    sessionStorage.setItem(VISITOR_CHAT_STORAGE_KEY, JSON.stringify(access));
  } catch {
    // Storage can be unavailable (private mode / quota); in-memory state still works.
  }
};

export const clearVisitorChatAccess = () => {
  try {
    sessionStorage.removeItem(VISITOR_CHAT_STORAGE_KEY);
    sessionStorage.removeItem(VISITOR_CHAT_PENDING_KEY);
  } catch {
    // ignore unavailable storage
  }
};

export const readVisitorChatDraft = () => {
  try {
    return JSON.parse(sessionStorage.getItem(VISITOR_CHAT_DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
};

export const storeVisitorChatDraft = (draft) => {
  try {
    sessionStorage.setItem(VISITOR_CHAT_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore unavailable storage
  }
};

export const clearVisitorChatDraft = () => {
  try {
    sessionStorage.removeItem(VISITOR_CHAT_DRAFT_KEY);
  } catch {
    // ignore unavailable storage
  }
};

export const readPendingVisitorMessage = () => {
  try {
    return JSON.parse(sessionStorage.getItem(VISITOR_CHAT_PENDING_KEY) || 'null');
  } catch {
    return null;
  }
};

export const storePendingVisitorMessage = (pending) => {
  try {
    sessionStorage.setItem(VISITOR_CHAT_PENDING_KEY, JSON.stringify(pending));
  } catch {
    // ignore unavailable storage
  }
};

export const clearPendingVisitorMessage = () => {
  try {
    sessionStorage.removeItem(VISITOR_CHAT_PENDING_KEY);
  } catch {
    // ignore unavailable storage
  }
};
