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
import { useLandingContent } from '../context/LandingContentContext';

const CHAT_COPY = {
  english: {
    messageUs: 'Message Us', team: 'BFP Dasmariñas Team', visitor: 'Visitor', you: 'You', conversation: 'Conversation',
    restoring: 'Restoring your conversation...', restoringDetail: 'Your previous messages are being loaded securely.',
    recoveryTitle: 'Private recovery code', recoveryHelp: 'Keep this code private. Use it to continue the conversation on another device.',
    copied: 'Copied', copyCode: 'Copy code', writeMessage: 'Write a message', wait: 'Wait', sendMessage: 'Send message',
    resolved: 'Resolved. A new message will reopen this conversation.', browserReplies: 'Replies stay available in this browser.',
    openFull: 'Open full conversation', startDifferent: 'Start a different conversation', startAgain: 'Start again', back: 'Back',
    continueTitle: 'Continue a conversation', continueHelp: 'Enter the private recovery code shown when your first message was sent.',
    recoveryCode: 'Recovery code', checking: 'Checking...', continueConversation: 'Continue conversation', startTitle: 'Start a conversation',
    startHelp: 'Send your question directly to the BFP Dasmariñas team. Your replies will appear here.', name: 'Name', fullName: 'Your full name',
    email: 'Gmail / Email', message: 'Message', helpPlaceholder: 'How can we help you?', sending: 'Sending...',
    privacy: 'Your name, email, and messages are used only to manage this conversation. Do not send passwords or sensitive records.',
    restoreLink: 'Already have a conversation? Use recovery code', close: 'Close message box'
  },
  tagalog: {
    messageUs: 'Mag-message', team: 'BFP Dasmariñas Team', visitor: 'Bisita', you: 'Ikaw', conversation: 'Pag-uusap',
    restoring: 'Binabalik ang iyong pag-uusap...', restoringDetail: 'Ligtas na kinukuha ang iyong mga naunang mensahe.',
    recoveryTitle: 'Pribadong recovery code', recoveryHelp: 'Panatilihing pribado ang code na ito. Gamitin ito upang ipagpatuloy ang pag-uusap sa ibang device.',
    copied: 'Nakopya', copyCode: 'Kopyahin ang code', writeMessage: 'Sumulat ng mensahe', wait: 'Maghintay', sendMessage: 'Ipadala ang mensahe',
    resolved: 'Resolved na ito. Muling bubuksan ng bagong mensahe ang pag-uusap.', browserReplies: 'Mananatiling available ang mga sagot sa browser na ito.',
    openFull: 'Buksan ang buong pag-uusap', startDifferent: 'Magsimula ng ibang pag-uusap', startAgain: 'Magsimula muli', back: 'Bumalik',
    continueTitle: 'Ipagpatuloy ang pag-uusap', continueHelp: 'Ilagay ang pribadong recovery code na ipinakita noong naipadala ang una mong mensahe.',
    recoveryCode: 'Recovery code', checking: 'Sinusuri...', continueConversation: 'Ipagpatuloy ang pag-uusap', startTitle: 'Magsimula ng pag-uusap',
    startHelp: 'Direktang ipadala ang iyong tanong sa BFP Dasmariñas team. Lalabas dito ang kanilang sagot.', name: 'Pangalan', fullName: 'Buong pangalan',
    email: 'Gmail / Email', message: 'Mensahe', helpPlaceholder: 'Paano ka namin matutulungan?', sending: 'Ipinapadala...',
    privacy: 'Ginagamit lamang ang iyong pangalan, email, at mga mensahe upang pamahalaan ang pag-uusap na ito. Huwag magpadala ng password o sensitibong rekord.',
    restoreLink: 'May dati ka nang pag-uusap? Gamitin ang recovery code', close: 'Isara ang message box'
  }
};

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
  const { language } = useLandingContent();
  const copy = CHAT_COPY[language] || CHAT_COPY.english;
  const {
    access,
    conversation,
    messages,
    loading,
    sending,
    cooldownSeconds,
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
  const displayName = conversation?.visitorName || copy.visitor;

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
          <h1>{hasConversation ? displayName : copy.messageUs}</h1>
          <p><span className="visitor-chat-online-dot" /> {copy.team}</p>
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
          <button type="button" className="visitor-chat-close" onClick={onClose} aria-label={copy.close}>
            <FiX aria-hidden="true" />
          </button>
        )}
      </header>

      {loading && !conversation ? (
        <div className="visitor-chat-state">
          <FiRefreshCw className="visitor-chat-spinner" aria-hidden="true" />
          <strong>{copy.restoring}</strong>
          <p>{copy.restoringDetail}</p>
        </div>
      ) : hasConversation ? (
        <>
          {showRecoveryCode && (
            <div className="visitor-chat-recovery" role="status">
              <div>
                <strong>{copy.recoveryTitle}</strong>
                <p>{copy.recoveryHelp}</p>
              </div>
              <code>{access.recoveryCode}</code>
              <button type="button" onClick={handleCopyRecoveryCode}>
                {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                {copied ? copy.copied : copy.copyCode}
              </button>
            </div>
          )}

          <div className="visitor-chat-messages" ref={messageListRef} aria-live="polite">
            <div className="visitor-chat-date-divider"><span>{copy.conversation}</span></div>
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
                      {isVisitor ? copy.you : copy.team}
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
            <label htmlFor={`visitor-chat-composer-${variant}`} className="sr-only">{copy.writeMessage}</label>
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
              placeholder={`${copy.writeMessage}...`}
              maxLength={VISITOR_CHAT_MAX_LENGTH}
            />
            <span className="visitor-chat-composer-count">
              {cooldownSeconds > 0 ? `${copy.wait} ${cooldownSeconds}s` : `${composer.length}/${VISITOR_CHAT_MAX_LENGTH}`}
            </span>
            <button
              type="submit"
              disabled={sending || cooldownSeconds > 0 || !composer.trim()}
              aria-label={cooldownSeconds > 0 ? `${copy.wait} ${cooldownSeconds}s` : copy.sendMessage}
              title={cooldownSeconds > 0 ? `${copy.wait} ${cooldownSeconds}s` : copy.sendMessage}
            >
              <FiSend aria-hidden="true" />
            </button>
          </form>

          <footer className="visitor-chat-footer">
            <span>{conversation.status === 'resolved' ? copy.resolved : copy.browserReplies}</span>
            {isCompact ? (
              <Link to="/send-message">{copy.openFull} <FiExternalLink aria-hidden="true" /></Link>
            ) : (
              <button type="button" onClick={handleStartDifferentConversation}>{copy.startDifferent}</button>
            )}
          </footer>
        </>
      ) : (
        <div className="visitor-chat-onboarding">
          {error && (
            <div className="visitor-chat-reconnect-error" role="alert">
              <p>{error}</p>
              <button type="button" onClick={handleStartDifferentConversation}>{copy.startAgain}</button>
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
                <FiArrowLeft aria-hidden="true" /> {copy.back}
              </button>
              <div>
                <h2>{copy.continueTitle}</h2>
                <p>{copy.continueHelp}</p>
              </div>
              <label htmlFor={`visitor-recovery-code-${variant}`}>{copy.recoveryCode}</label>
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
                {loading ? copy.checking : copy.continueConversation}
              </button>
            </form>
          ) : (
            <form className="visitor-chat-start-form" onSubmit={handleStart} noValidate>
              <div className="visitor-chat-welcome">
                <h2>{copy.startTitle}</h2>
                <p>{copy.startHelp}</p>
              </div>

              <div className="visitor-chat-field">
                <label htmlFor={`visitor-name-${variant}`}><FiUser aria-hidden="true" /> {copy.name}</label>
                <input
                  id={`visitor-name-${variant}`}
                  type="text"
                  value={details.name}
                  onChange={updateDetail('name')}
                  placeholder={copy.fullName}
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="visitor-chat-field">
                <label htmlFor={`visitor-email-${variant}`}><FiMail aria-hidden="true" /> {copy.email}</label>
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
                  <label htmlFor={`visitor-message-${variant}`}><FiMessageCircle aria-hidden="true" /> {copy.message}</label>
                  <span>{details.message.length}/{VISITOR_CHAT_MAX_LENGTH}</span>
                </div>
                <textarea
                  id={`visitor-message-${variant}`}
                  rows={isCompact ? 3 : 5}
                  value={details.message}
                  onChange={updateDetail('message')}
                  placeholder={copy.helpPlaceholder}
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
                {copy.privacy}
              </p>

              <button
                type="submit"
                className="visitor-chat-primary"
                disabled={sending || !details.name.trim() || !details.email.trim() || !details.message.trim()}
              >
                <FiSend aria-hidden="true" />
                {sending ? copy.sending : copy.sendMessage}
              </button>

              <button type="button" className="visitor-chat-restore-link" onClick={() => setRestoreMode(true)}>
                {copy.restoreLink}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
