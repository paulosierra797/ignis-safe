import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiMail,
  FiMessageCircle,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiUser,
} from 'react-icons/fi';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import {
  getAdminVisitorConversation,
  listAdminVisitorConversations,
  replyToVisitorConversation,
  setVisitorConversationStatus,
  VISITOR_CHAT_MAX_LENGTH,
} from '../utils/visitorChatService';
import './VisitorMessages.css';

const formatDateTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatListTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

export default function VisitorMessages() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [thread, setThread] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reply, setReply] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef(null);

  const loadConversations = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadingList(true);
    const result = await listAdminVisitorConversations();
    if (!quiet) setLoadingList(false);
    if (result.error) {
      if (!quiet) setError(result.error);
      return;
    }
    setConversations(result.data?.conversations || []);
    setSelectedId((current) => current || result.data?.conversations?.[0]?.id || '');
  }, []);

  const loadThread = useCallback(async (conversationId, { quiet = false } = {}) => {
    if (!conversationId) return;
    if (!quiet) setLoadingThread(true);
    const result = await getAdminVisitorConversation(conversationId);
    if (!quiet) setLoadingThread(false);
    if (result.error) {
      if (!quiet) setError(result.error);
      return;
    }
    setThread(result.data);
    setConversations((current) => current.map((item) => (
      item.id === conversationId ? { ...item, ...result.data.conversation, unread: false } : item
    )));
  }, []);

  useEffect(() => {
    const initialLoadId = window.setTimeout(loadConversations, 0);
    const intervalId = window.setInterval(() => loadConversations({ quiet: true }), 10000);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const initialLoadId = window.setTimeout(() => loadThread(selectedId), 0);
    const intervalId = window.setInterval(() => loadThread(selectedId, { quiet: true }), 5000);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [selectedId, loadThread]);

  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [thread?.messages?.length, selectedId]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const matchesStatus = statusFilter === 'all' || conversation.status === statusFilter;
      const matchesSearch = !term || [
        conversation.visitor_name,
        conversation.visitor_email,
        conversation.visitor_label,
        conversation.last_message_preview,
      ].some((value) => String(value || '').toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [conversations, search, statusFilter]);

  const handleReply = async (event) => {
    event.preventDefault();
    const message = reply.trim();
    if (!selectedId || !message || sending) return;

    setSending(true);
    setError('');
    const result = await replyToVisitorConversation({
      conversationId: selectedId,
      message,
      clientMessageId: crypto.randomUUID(),
    });
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReply('');
    setThread(result.data);
    await loadConversations({ quiet: true });
  };

  const handleStatusChange = async () => {
    if (!thread?.conversation || updatingStatus) return;
    const nextStatus = thread.conversation.status === 'resolved' ? 'open' : 'resolved';
    setUpdatingStatus(true);
    setError('');
    const result = await setVisitorConversationStatus({
      conversationId: thread.conversation.id,
      status: nextStatus,
    });
    setUpdatingStatus(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setThread((current) => ({ ...current, conversation: result.data.conversation }));
    await loadConversations({ quiet: true });
  };

  return (
    <div className="visitor-messages-page">
      <Sidebar />
      <main className="visitor-messages-main">
        <PageHeader title="Visitor Messages" />

        <section className="visitor-messages-intro">
          <div>
            <span>PUBLIC COMMUNICATION</span>
            <h2>Website Conversations</h2>
            <p>Read and reply to messages sent through the public website. Visitor names and emails are shown for clear follow-up.</p>
          </div>
          <div className="visitor-messages-summary">
            <span><strong>{conversations.filter((item) => item.unread).length}</strong> Unread</span>
            <span><strong>{conversations.filter((item) => item.status === 'open').length}</strong> Open</span>
          </div>
        </section>

        {error && <div className="visitor-messages-error" role="alert">{error}</div>}

        <section className={`visitor-messages-workspace ${selectedId ? 'has-selection' : ''}`}>
          <aside className="visitor-conversation-list" aria-label="Visitor conversations">
            <div className="visitor-conversation-tools">
              <label>
                <FiSearch aria-hidden="true" />
                <span className="sr-only">Search conversations</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, email, or message"
                />
              </label>
              <div className="visitor-conversation-filters" aria-label="Conversation status">
                {['all', 'open', 'resolved'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={statusFilter === status ? 'is-active' : ''}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="visitor-conversation-scroll">
              {loadingList ? (
                <div className="visitor-conversation-empty"><FiRefreshCw className="is-spinning" /> Loading conversations...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="visitor-conversation-empty"><FiMessageCircle /> No conversations found.</div>
              ) : filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`visitor-conversation-item ${selectedId === conversation.id ? 'is-selected' : ''} ${conversation.unread ? 'is-unread' : ''}`}
                  onClick={() => {
                    setSelectedId(conversation.id);
                    setThread(null);
                    setReply('');
                    setError('');
                  }}
                >
                  <span className="visitor-conversation-avatar"><FiUser /></span>
                  <span className="visitor-conversation-copy">
                    <span className="visitor-conversation-name">
                      <strong>{conversation.visitor_name}</strong>
                      <time>{formatListTime(conversation.last_message_at)}</time>
                    </span>
                    <span className="visitor-conversation-preview">{conversation.last_message_preview}</span>
                    <span className="visitor-conversation-meta">
                      <span className={`visitor-conversation-status is-${conversation.status}`}>{conversation.status}</span>
                      {conversation.unread && <span className="visitor-conversation-unread">New</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="visitor-thread">
            {!selectedId ? (
              <div className="visitor-thread-empty">
                <FiMessageCircle />
                <h3>Select a conversation</h3>
                <p>Choose a visitor from the list to review and reply.</p>
              </div>
            ) : loadingThread && !thread ? (
              <div className="visitor-thread-empty"><FiRefreshCw className="is-spinning" /><p>Loading messages...</p></div>
            ) : thread?.conversation ? (
              <>
                <header className="visitor-thread-header">
                  <button type="button" className="visitor-thread-back" onClick={() => setSelectedId('')} aria-label="Back to conversations">
                    <FiArrowLeft />
                  </button>
                  <span className="visitor-thread-avatar"><FiUser /></span>
                  <div className="visitor-thread-person">
                    <h3>{thread.conversation.visitor_name}</h3>
                    <a href={`mailto:${thread.conversation.visitor_email}`}><FiMail /> {thread.conversation.visitor_email}</a>
                    <span>{thread.conversation.visitor_label}</span>
                  </div>
                  <button
                    type="button"
                    className={`visitor-thread-status-action is-${thread.conversation.status}`}
                    onClick={handleStatusChange}
                    disabled={updatingStatus}
                  >
                    {thread.conversation.status === 'resolved' ? <FiClock /> : <FiCheckCircle />}
                    {updatingStatus ? 'Updating...' : thread.conversation.status === 'resolved' ? 'Reopen' : 'Mark Resolved'}
                  </button>
                </header>

                <div className="visitor-thread-messages" ref={messagesRef}>
                  {(thread.messages || []).map((message) => {
                    if (message.sender_type === 'system') {
                      return <p className="visitor-thread-system" key={message.id}>{message.body}</p>;
                    }
                    const isAdmin = message.sender_type === 'admin';
                    return (
                      <article key={message.id} className={`visitor-thread-message ${isAdmin ? 'is-admin' : 'is-visitor'}`}>
                        <span>{isAdmin ? message.admin_name || 'Administrator' : thread.conversation.visitor_name}</span>
                        <p>{message.body}</p>
                        <time>{formatDateTime(message.created_at)}</time>
                      </article>
                    );
                  })}
                </div>

                <form className="visitor-thread-composer" onSubmit={handleReply}>
                  <div>
                    <label htmlFor="visitor-admin-reply" className="sr-only">Reply to visitor</label>
                    <textarea
                      id="visitor-admin-reply"
                      value={reply}
                      onChange={(event) => {
                        if (event.target.value.length <= VISITOR_CHAT_MAX_LENGTH) setReply(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Write a reply..."
                      maxLength={VISITOR_CHAT_MAX_LENGTH}
                      rows={2}
                    />
                    <span>{reply.length}/{VISITOR_CHAT_MAX_LENGTH}</span>
                  </div>
                  <button type="submit" disabled={sending || !reply.trim()} aria-label="Send reply">
                    <FiSend />
                    <span>{sending ? 'Sending...' : 'Send'}</span>
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
