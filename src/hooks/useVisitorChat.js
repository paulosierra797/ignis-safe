import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearPendingVisitorMessage,
  clearVisitorChatAccess,
  fetchVisitorConversation,
  readPendingVisitorMessage,
  readVisitorChatAccess,
  sendVisitorMessage,
  startVisitorConversation,
  storePendingVisitorMessage,
  storeVisitorChatAccess,
} from '../utils/visitorChatService';

export default function useVisitorChat({ active = false } = {}) {
  const [access, setAccess] = useState(() => readVisitorChatAccess());
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasUnreadReply, setHasUnreadReply] = useState(false);
  const [loading, setLoading] = useState(Boolean(access?.recoveryCode));
  const [sending, setSending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [error, setError] = useState('');
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const intervalId = window.setInterval(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [cooldownSeconds]);

  const applyResult = useCallback((data) => {
    if (!data) return;
    setConversation(data.conversation || null);
    setMessages(data.messages || []);
    setHasUnreadReply(Boolean(data.hasUnreadAdminReply));
    setError('');
  }, []);

  const refresh = useCallback(async ({ markRead = false, quiet = false } = {}) => {
    if (!access?.recoveryCode || requestInFlightRef.current) return { error: null };

    requestInFlightRef.current = true;
    if (!quiet) setLoading(true);
    const result = await fetchVisitorConversation({
      recoveryCode: access.recoveryCode,
      markRead,
    });
    requestInFlightRef.current = false;
    if (!quiet) setLoading(false);

    if (result.error) {
      if (!quiet) setError(result.error);
      return result;
    }

    applyResult(result.data);
    if (markRead) setHasUnreadReply(false);
    return result;
  }, [access, applyResult]);

  useEffect(() => {
    if (!access?.recoveryCode) return undefined;

    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await refresh({ markRead: active, quiet: true });
      if (!cancelled) setLoading(false);
    };

    const initialLoadId = window.setTimeout(load, 0);
    const intervalId = window.setInterval(load, active ? 5000 : 30000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [access?.recoveryCode, active, refresh]);

  useEffect(() => {
    if (!access?.recoveryCode || !active) return undefined;
    const timeoutId = window.setTimeout(
      () => refresh({ markRead: true, quiet: true }),
      0,
    );
    return () => window.clearTimeout(timeoutId);
  }, [active, access?.recoveryCode, refresh]);

  useEffect(() => {
    const pending = readPendingVisitorMessage();
    if (!access?.recoveryCode || !pending?.message || !pending?.clientMessageId) return;

    let cancelled = false;
    const retryPending = async () => {
      const result = await sendVisitorMessage({
        recoveryCode: access.recoveryCode,
        message: pending.message,
        clientMessageId: pending.clientMessageId,
      });
      if (!cancelled && !result.error) {
        clearPendingVisitorMessage();
        applyResult(result.data);
      }
    };
    void retryPending();
    return () => {
      cancelled = true;
    };
  }, [access?.recoveryCode, applyResult]);

  const startConversation = async ({ name, email, message, website = '' }) => {
    if (sending) return { error: 'A message is already being sent.' };
    setSending(true);
    setError('');

    const result = await startVisitorConversation({
      name,
      email,
      message,
      website,
      clientMessageId: crypto.randomUUID(),
    });
    setSending(false);

    if (result.error) {
      setError(result.error);
      return result;
    }

    const nextAccess = {
      conversationId: result.data.conversation.id,
      recoveryCode: result.data.recoveryCode,
    };
    storeVisitorChatAccess(nextAccess);
    setAccess(nextAccess);
    applyResult(result.data);
    setCooldownSeconds(15);
    return result;
  };

  const sendMessage = async (message) => {
    if (!access?.recoveryCode || sending) {
      return { error: 'The conversation is not ready yet.' };
    }
    if (cooldownSeconds > 0) {
      const result = { error: `Please wait ${cooldownSeconds} seconds before sending again.` };
      setError(result.error);
      return result;
    }

    const pending = { message, clientMessageId: crypto.randomUUID() };
    storePendingVisitorMessage(pending);
    setSending(true);
    setError('');

    const result = await sendVisitorMessage({
      recoveryCode: access.recoveryCode,
      ...pending,
    });
    setSending(false);

    if (result.error) {
      setError(result.error);
      return result;
    }

    clearPendingVisitorMessage();
    applyResult(result.data);
    setCooldownSeconds(15);
    return result;
  };

  const restoreConversation = async (recoveryCode) => {
    setLoading(true);
    setError('');
    const result = await fetchVisitorConversation({ recoveryCode, markRead: true });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return result;
    }

    const nextAccess = {
      conversationId: result.data.conversation.id,
      recoveryCode: String(recoveryCode || '').trim().toUpperCase(),
    };
    storeVisitorChatAccess(nextAccess);
    setAccess(nextAccess);
    applyResult(result.data);
    setHasUnreadReply(false);
    return result;
  };

  const disconnectConversation = () => {
    clearVisitorChatAccess();
    setAccess(null);
    setConversation(null);
    setMessages([]);
    setHasUnreadReply(false);
    setError('');
    setCooldownSeconds(0);
  };

  return {
    access,
    conversation,
    messages,
    hasUnreadReply,
    loading,
    sending,
    cooldownSeconds,
    error,
    setError,
    startConversation,
    sendMessage,
    restoreConversation,
    disconnectConversation,
    refresh,
  };
}
