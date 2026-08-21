import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiArrowLeft,
  FiCheck,
  FiCopy,
  FiExternalLink,
  FiInfo,
  FiMail,
  FiMessageCircle,
  FiRefreshCw,
  FiSend,
  FiShield,
  FiUser,
  FiX,
} from 'react-icons/fi';
import useVisitorChat from '../hooks/useVisitorChat';
import {
  clearVisitorChatDraft,
  readVisitorChatDraft,
  storeVisitorChatDraft,
  VISITOR_CHAT_MAX_LENGTH,
} from '../utils/visitorChatService';
import './VisitorChat.css';

const INITIAL_DETAILS = { name: '', email: '', message: '', website: '' };

const formatMessageTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function VisitorChat({ variant = 'full', active = true, onClose }) {
  const {
    access,
    conversation,
    messages,
    loading,
    sending,
    error,
    setError,
    startConversation,
    sendMessage,
    restoreConversation,
    disconnectConversation,
  } = useVisitorChat({ active });
  const [details, setDetails] = useState(() => {
    const draft = readVisitorChatDraft() || {};
    return {
      ...INITIAL_DETAILS,
      ...draft,
      message: String(draft.message || '').slice(0, VISITOR_CHAT_MAX_LENGTH),
    };
  });
  const [composer, setComposer] = useState('');
  const [restoreMode, setRestoreMode] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const messageListRef = useRef(null);

  const isCompact = variant === 'compact';
  const hasConversation = Boolean(access?.recoveryCode && conversation);
  const displayName = conversation?.visitorName || 'Visitor';

  useEffect(() => {
    if (hasConversation) return;
    storeVisitorChatDraft({
      name: details.name,
      email: details.email,
      message: details.message,
    });
  }, [details.name, details.email, details.message, hasConversation]);

  useEffect(() => {
    if (!hasConversation) return;
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [hasConversation, messages.length]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => {
      const timeDifference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return timeDifference || String(a.id).localeCompare(String(b.id));
    }),
    [messages]
  );

  const updateDetail = (field) => (event) => {
    const value = field === 'message'
      ? event.target.value.slice(0, VISITOR_CHAT_MAX_LENGTH)
      : event.target.value;
    setDetails((current) => ({ ...current, [field]: value }));
    if (error) setError('');
  };

  const handleStart = async (event) => {
    event.preventDefault();
    const result = await startConversation(details);
    if (!result.error) {
      clearVisitorChatDraft();
      setDetails(INITIAL_DETAILS);
      setShowRecoveryCode(true);
    }
  };

  const handleRestore = async (event) => {
    event.preventDefault();
    const result = await restoreConversation(recoveryInput);
    if (!result.error) {
      setRestoreMode(false);
      setRecoveryInput('');
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const message = composer.trim();
    if (!message) return;
    const result = await sendMessage(message);
    if (!result.error) setComposer('');
  };

  const handleCopyRecoveryCode = async () => {
    try {
      await navigator.clipboard.writeText(access.recoveryCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleStartDifferentConversation = () => {
    disconnectConversation();
    setRestoreMode(false);
    setRecoveryInput('');
    setShowRecoveryCode(false);
  };

  return (
    <section className={`visitor-chat visitor-chat--${variant}`} aria-label="Visitor messaging">
      <header className="visitor-chat-header">
        <span className="visitor-chat-brand-icon" aria-hidden="true"><FiMessageCircle /></span>
        <div className="visitor-chat-header-copy">
          <h1>{hasConversation ? displayName : 'Message Us'}</h1>
          <p><span className="visitor-chat-online-dot" /> BFP Dasmarinas Team</p>
        </div>
        {hasConversation && (
          <button
            type="button"
            className="visitor-chat-header-action"
            onClick={() => setShowRecoveryCode((current) => !current)}
            aria-label="Show conversation recovery code"
            title="Conversation recovery code"
          >
            <FiShield aria-hidden="true" />
          </button>
        )}
        {isCompact && (
          <button type="button" className="visitor-chat-close" onClick={onClose} aria-label="Close message box">
            <FiX aria-hidden="true" />
          </button>
        )}
      </header>

      {loading && !conversation ? (
        <div className="visitor-chat-state">
          <FiRefreshCw className="visitor-chat-spinner" aria-hidden="true" />
          <strong>Restoring your conversation...</strong>
          <p>Your previous messages are being loaded securely.</p>
        </div>
      ) : hasConversation ? (
        <>
          {showRecoveryCode && (
            <div className="visitor-chat-recovery" role="status">
              <div>
                <strong>Private recovery code</strong>
                <p>Keep this code private. Use it to continue the conversation on another device.</p>
              </div>
              <code>{access.recoveryCode}</code>
              <button type="button" onClick={handleCopyRecoveryCode}>
                {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
          )}

          <div className="visitor-chat-messages" ref={messageListRef} aria-live="polite">
            <div className="visitor-chat-date-divider"><span>Conversation</span></div>
            {sortedMessages.map((message) => {
              if (message.sender_type === 'system') {
                return (
                  <div className="visitor-chat-system-message" key={message.id}>
                    <FiInfo aria-hidden="true" />
                    <span>{message.body}</span>
                  </div>
                );
              }

              const isVisitor = message.sender_type === 'visitor';
              return (
                <article
                  key={message.id}
                  className={`visitor-chat-message ${isVisitor ? 'is-visitor' : 'is-admin'}`}
                >
                  {!isVisitor && (
                    <span className="visitor-chat-message-avatar" aria-hidden="true">
                      <FiShield />
                    </span>
                  )}
                  <div>
                    <span className="visitor-chat-sender">
                      {isVisitor ? 'You' : 'BFP Dasmarinas Team'}
                    </span>
                    <p>{message.body}</p>
                    <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
                  </div>
                </article>
              );
            })}
          </div>

          {error && <p className="visitor-chat-error" role="alert">{error}</p>}

          <form className="visitor-chat-composer" onSubmit={handleSend}>
            <label htmlFor={`visitor-chat-composer-${variant}`} className="sr-only">Write a message</label>
            <textarea
              id={`visitor-chat-composer-${variant}`}
              rows={1}
              value={composer}
              onChange={(event) => {
                if (event.target.value.length <= VISITOR_CHAT_MAX_LENGTH) {
                  setComposer(event.target.value);
                  if (error) setError('');
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Write a message..."
              maxLength={VISITOR_CHAT_MAX_LENGTH}
            />
            <span className="visitor-chat-composer-count">{composer.length}/{VISITOR_CHAT_MAX_LENGTH}</span>
            <button type="submit" disabled={sending || !composer.trim()} aria-label="Send message">
              <FiSend aria-hidden="true" />
            </button>
          </form>

          <footer className="visitor-chat-footer">
            <span>{conversation.status === 'resolved' ? 'Resolved. A new message will reopen this conversation.' : 'Replies stay available in this browser.'}</span>
            {isCompact ? (
              <Link to="/send-message">Open full conversation <FiExternalLink aria-hidden="true" /></Link>
            ) : (
              <button type="button" onClick={handleStartDifferentConversation}>Start a different conversation</button>
            )}
          </footer>
        </>
      ) : (
        <div className="visitor-chat-onboarding">
          {error && (
            <div className="visitor-chat-reconnect-error" role="alert">
              <p>{error}</p>
              <button type="button" onClick={handleStartDifferentConversation}>Start again</button>
            </div>
          )}

          {restoreMode ? (
            <form className="visitor-chat-restore-form" onSubmit={handleRestore}>
              <button
                type="button"
                className="visitor-chat-back"
                onClick={() => {
                  setRestoreMode(false);
                  setError('');
                }}
              >
                <FiArrowLeft aria-hidden="true" /> Back
              </button>
              <div>
                <h2>Continue a conversation</h2>
                <p>Enter the private recovery code shown when your first message was sent.</p>
              </div>
              <label htmlFor={`visitor-recovery-code-${variant}`}>Recovery code</label>
              <input
                id={`visitor-recovery-code-${variant}`}
                type="text"
                value={recoveryInput}
                onChange={(event) => setRecoveryInput(event.target.value.toUpperCase())}
                placeholder="IGNIS-XXXX-XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                required
              />
              <button type="submit" className="visitor-chat-primary" disabled={loading || !recoveryInput.trim()}>
                {loading ? 'Checking...' : 'Continue conversation'}
              </button>
            </form>
          ) : (
            <form className="visitor-chat-start-form" onSubmit={handleStart} noValidate>
              <div className="visitor-chat-welcome">
                <h2>Start a conversation</h2>
                <p>Send your question directly to the BFP Dasmarinas team. Your replies will appear here.</p>
              </div>

              <div className="visitor-chat-field">
                <label htmlFor={`visitor-name-${variant}`}><FiUser aria-hidden="true" /> Name</label>
                <input
                  id={`visitor-name-${variant}`}
                  type="text"
                  value={details.name}
                  onChange={updateDetail('name')}
                  placeholder="Your full name"
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="visitor-chat-field">
                <label htmlFor={`visitor-email-${variant}`}><FiMail aria-hidden="true" /> Gmail / Email</label>
                <input
                  id={`visitor-email-${variant}`}
                  type="email"
                  value={details.email}
                  onChange={updateDetail('email')}
                  placeholder="you@gmail.com"
                  maxLength={254}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="visitor-chat-field">
                <div className="visitor-chat-field-heading">
                  <label htmlFor={`visitor-message-${variant}`}><FiMessageCircle aria-hidden="true" /> Message</label>
                  <span>{details.message.length}/{VISITOR_CHAT_MAX_LENGTH}</span>
                </div>
                <textarea
                  id={`visitor-message-${variant}`}
                  rows={isCompact ? 3 : 5}
                  value={details.message}
                  onChange={updateDetail('message')}
                  placeholder="How can we help you?"
                  maxLength={VISITOR_CHAT_MAX_LENGTH}
                  required
                />
              </div>

              <div className="visitor-chat-honeypot" aria-hidden="true">
                <label htmlFor={`visitor-website-${variant}`}>Website</label>
                <input
                  id={`visitor-website-${variant}`}
                  type="text"
                  value={details.website}
                  onChange={updateDetail('website')}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <p className="visitor-chat-privacy">
                <FiShield aria-hidden="true" />
                Your name, email, and messages are used only to manage this conversation. Do not send passwords or sensitive records.
              </p>

              <button
                type="submit"
                className="visitor-chat-primary"
                disabled={sending || !details.name.trim() || !details.email.trim() || !details.message.trim()}
              >
                <FiSend aria-hidden="true" />
                {sending ? 'Sending...' : 'Send message'}
              </button>

              <button type="button" className="visitor-chat-restore-link" onClick={() => setRestoreMode(true)}>
                Already have a conversation? Use recovery code
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
