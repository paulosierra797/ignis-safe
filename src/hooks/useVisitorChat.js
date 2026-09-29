import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearPendingVisitorMessage,
  clearVisitorChatAccess,
  createClientMessageId,
  fetchVisitorConversation,
  readPendingVisitorMessage,
  readVisitorChatAccess,
  sendVisitorMessage,
  startVisitorConversation,
  storePendingVisitorMessage,
  storeVisitorChatAccess,
} from '../utils/visitorChatService';

const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong while sending your message. Please try again.';

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
  // Synchronous submit latch. The `sending` state only updates on the next
  // render, so two rapid submits could both slip past a state-only guard.
  const submitInFlightRef = useRef(false);

  const finishSubmit = useCallback(() => {
    submitInFlightRef.current = false;
    setSending(false);
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const intervalId = window.setInterval(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [cooldownSeconds]);

  const applyResult = useCallback((data, { keepError = false } = {}) => {
    if (!data) return;
    setConversation(data.conversation || null);
    setMessages(data.messages || []);
    setHasUnreadReply(Boolean(data.hasUnreadAdminReply));
    // A background poll must not wipe the error a failed submit just showed.
    if (!keepError) setError('');
  }, []);

  const refresh = useCallback(async ({ markRead = false, quiet = false } = {}) => {
    if (!access?.recoveryCode || requestInFlightRef.current) return { error: null };

    requestInFlightRef.current = true;
    if (!quiet) setLoading(true);

    try {
      const result = await fetchVisitorConversation({
        recoveryCode: access.recoveryCode,
        markRead,
      });

      if (result.error) {
        if (!quiet) setError(result.error);
        return result;
      }

      applyResult(result.data, { keepError: quiet });
      if (markRead) setHasUnreadReply(false);
      return result;
    } catch (refreshError) {
      console.error('Refreshing the visitor conversation failed:', refreshError);
      const failure = { data: null, error: UNEXPECTED_ERROR_MESSAGE };
      if (!quiet) setError(failure.error);
      return failure;
    } finally {
      requestInFlightRef.current = false;
      if (!quiet) setLoading(false);
    }
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
      try {
        const result = await sendVisitorMessage({
          recoveryCode: access.recoveryCode,
          message: pending.message,
          clientMessageId: pending.clientMessageId,
        });
        if (!cancelled && !result.error) {
          clearPendingVisitorMessage();
          applyResult(result.data);
        }
      } catch (retryError) {
        console.error('Retrying the pending visitor message failed:', retryError);
      }
    };
    void retryPending();
    return () => {
      cancelled = true;
    };
  }, [access?.recoveryCode, applyResult]);

  const startConversation = async ({ name, email, message, website = '' }) => {
    if (submitInFlightRef.current) {
      return { data: null, error: 'A message is already being sent.' };
    }

    submitInFlightRef.current = true;
    setSending(true);
    setError('');

    try {
      const result = await startVisitorConversation({
        name,
        email,
        message,
        website,
        clientMessageId: createClientMessageId(),
      });

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
    } catch (submitError) {
      console.error('Starting the visitor conversation failed:', submitError);
      const failure = { data: null, error: UNEXPECTED_ERROR_MESSAGE };
      setError(failure.error);
      return failure;
    } finally {
      // Runs after success, after a handled error result, and after an
      // unexpected throw, so the button can never stay stuck on "Sending...".
      finishSubmit();
    }
  };

  const sendMessage = async (message) => {
    if (submitInFlightRef.current) {
      return { data: null, error: 'A message is already being sent.' };
    }
    if (!access?.recoveryCode) {
      return { data: null, error: 'The conversation is not ready yet.' };
    }
    if (cooldownSeconds > 0) {
      const result = {
        data: null,
        error: `Please wait ${cooldownSeconds} seconds before sending again.`,
      };
      setError(result.error);
      return result;
    }

    submitInFlightRef.current = true;
    setSending(true);
    setError('');

    try {
      const pending = { message, clientMessageId: createClientMessageId() };
      storePendingVisitorMessage(pending);

      const result = await sendVisitorMessage({
        recoveryCode: access.recoveryCode,
        ...pending,
      });

      if (result.error) {
        setError(result.error);
        return result;
      }

      clearPendingVisitorMessage();
      applyResult(result.data);
      setCooldownSeconds(15);
      return result;
    } catch (submitError) {
      console.error('Sending the visitor message failed:', submitError);
      const failure = { data: null, error: UNEXPECTED_ERROR_MESSAGE };
      setError(failure.error);
      return failure;
    } finally {
      finishSubmit();
    }
  };

  const restoreConversation = async (recoveryCode) => {
    setLoading(true);
    setError('');

    try {
      const result = await fetchVisitorConversation({ recoveryCode, markRead: true });

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
    } catch (restoreError) {
      console.error('Restoring the visitor conversation failed:', restoreError);
      const failure = { data: null, error: UNEXPECTED_ERROR_MESSAGE };
      setError(failure.error);
      return failure;
    } finally {
      setLoading(false);
    }
  };

  const disconnectConversation = () => {
    submitInFlightRef.current = false;
    setSending(false);
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
