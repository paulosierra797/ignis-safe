import { supabase } from './supabaseClient';

export const VISITOR_CHAT_MAX_LENGTH = 1500;
export const VISITOR_CHAT_STORAGE_KEY = 'ignis-safe:visitor-chat-access';
export const VISITOR_CHAT_DRAFT_KEY = 'ignis-safe:visitor-chat-draft';
export const VISITOR_CHAT_PENDING_KEY = 'ignis-safe:visitor-chat-pending';

const readFunctionErrorPayload = async (error) => {
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') return null;

  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

const invoke = async (functionName, body) => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) {
      const payload = await readFunctionErrorPayload(error);
      return {
        data: null,
        error: payload?.error || error.message || 'Messaging is temporarily unavailable.',
      };
    }
    if (data?.error) return { data: null, error: data.error };
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
  sessionStorage.setItem(VISITOR_CHAT_STORAGE_KEY, JSON.stringify(access));
};

export const clearVisitorChatAccess = () => {
  sessionStorage.removeItem(VISITOR_CHAT_STORAGE_KEY);
  sessionStorage.removeItem(VISITOR_CHAT_PENDING_KEY);
};

export const readVisitorChatDraft = () => {
  try {
    return JSON.parse(sessionStorage.getItem(VISITOR_CHAT_DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
};

export const storeVisitorChatDraft = (draft) => {
  sessionStorage.setItem(VISITOR_CHAT_DRAFT_KEY, JSON.stringify(draft));
};

export const clearVisitorChatDraft = () => {
  sessionStorage.removeItem(VISITOR_CHAT_DRAFT_KEY);
};

export const readPendingVisitorMessage = () => {
  try {
    return JSON.parse(sessionStorage.getItem(VISITOR_CHAT_PENDING_KEY) || 'null');
  } catch {
    return null;
  }
};

export const storePendingVisitorMessage = (pending) => {
  sessionStorage.setItem(VISITOR_CHAT_PENDING_KEY, JSON.stringify(pending));
};

export const clearPendingVisitorMessage = () => {
  sessionStorage.removeItem(VISITOR_CHAT_PENDING_KEY);
};
