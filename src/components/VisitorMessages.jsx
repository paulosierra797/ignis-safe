import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiArrowLeft,
  FiArchive,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiMail,
  FiMessageCircle,
  FiRefreshCw,
  FiRotateCcw,
  FiSearch,
  FiSend,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import {
  archiveVisitorConversation,
  getAdminVisitorConversation,
  listAdminVisitorConversations,
  replyToVisitorConversation,
  restoreVisitorConversation,
  scheduleVisitorConversationDeletion,
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
  const [inboxSummary, setInboxSummary] = useState({ unread: 0, open: 0 });
  const [selectedId, setSelectedId] = useState('');
  const [thread, setThread] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [archivedView, setArchivedView] = useState(false);
  const [reply, setReply] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingArchive, setUpdatingArchive] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(null);
  const [error, setError] = useState('');
  const messagesRef = useRef(null);

  const loadConversations = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadingList(true);
    const result = await listAdminVisitorConversations({ archived: archivedView });
    if (!quiet) setLoadingList(false);
    if (result.error) {
      if (!quiet) setError(result.error);
      return;
    }
    const nextConversations = result.data?.conversations || [];
    setConversations(nextConversations);
    if (!archivedView) {
      setInboxSummary({
        unread: nextConversations.filter((item) => item.unread).length,
        open: nextConversations.filter((item) => item.status === 'open').length,
      });
    }
    setSelectedId((current) => (
      nextConversations.some((item) => item.id === current)
        ? current
        : nextConversations[0]?.id || ''
    ));
  }, [archivedView]);

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
    // Resolving auto-archives the conversation and reopening returns it to the
    // active inbox, so either way it leaves the current list. Drop the thread.
    setThread(null);
    setSelectedId('');
    await loadConversations({ quiet: true });
  };

  const handleArchive = async () => {
    if (!thread?.conversation || updatingArchive) return;
    setUpdatingArchive(true);
    setError('');
    const result = await archiveVisitorConversation(thread.conversation.id);
    setUpdatingArchive(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setThread(null);
    setSelectedId('');
    await loadConversations({ quiet: true });
  };

  const handleRestore = async () => {
    if (!thread?.conversation || updatingArchive) return;
    setUpdatingArchive(true);
    setError('');
    const result = await restoreVisitorConversation(thread.conversation.id);
    setUpdatingArchive(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setThread(null);
    setSelectedId('');
    await loadConversations({ quiet: true });
  };

  const handleScheduleDeletion = async () => {
    if (!pendingDeletion || updatingArchive) return;
    setUpdatingArchive(true);
    setError('');
    const result = await scheduleVisitorConversationDeletion(pendingDeletion.id);
    setUpdatingArchive(false);
    if (result.error) {
      setError(result.error);
      setPendingDeletion(null);
      return;
    }
    setThread((current) => ({ ...current, conversation: result.data.conversation }));
    setConversations((current) => current.map((item) => (
      item.id === pendingDeletion.id ? { ...item, ...result.data.conversation } : item
    )));
    setPendingDeletion(null);
  };

  const handleArchiveViewToggle = () => {
    setArchivedView((current) => !current);
    setSelectedId('');
    setThread(null);
    setStatusFilter('all');
    setReply('');
    setError('');
  };

  return (
    <div className="visitor-messages-page">
      <Sidebar />
      <main className="visitor-messages-main">
        <PageHeader title="Messages" />

        <section className="visitor-messages-intro">
          <div>
            <span>PUBLIC COMMUNICATION</span>
            <h2>Website Conversations</h2>
            <p>Read and reply to messages sent through the public website. Visitor names and emails are shown for clear follow-up.</p>
          </div>
          <div className="visitor-messages-intro-actions">
            <div className="visitor-messages-summary">
              <span><strong>{inboxSummary.unread}</strong> Unread</span>
              <span><strong>{inboxSummary.open}</strong> Open</span>
            </div>
            <button
              type="button"
              className="visitor-archive-view-button"
              onClick={handleArchiveViewToggle}
              aria-label="View archived conversations"
              title="View archived conversations"
            >
              <FiArchive />
            </button>
          </div>
        </section>

        {!archivedView && error && <div className="visitor-messages-error" role="alert">{error}</div>}

        {archivedView && (
          <button
            type="button"
            className="visitor-archive-modal-backdrop"
            onClick={handleArchiveViewToggle}
            aria-label="Close archived conversations"
          />
        )}

        <div className={`visitor-messages-workspace-frame ${archivedView ? 'is-archive-modal' : ''}`}>
          {archivedView && (
            <header className="visitor-archive-modal-header">
              <div className="visitor-archive-modal-title">
                <span className="visitor-archive-modal-icon"><FiArchive /></span>
                <div>
                  <span>CONVERSATION ARCHIVE</span>
                  <h2>Archived Conversations</h2>
                  <p>Restore a conversation or schedule permanent deletion after the 30-day recovery period.</p>
                </div>
              </div>
              <div className="visitor-archive-modal-summary">
                <span><strong>{conversations.length}</strong> Archived</span>
                <span><strong>{conversations.filter((item) => item.delete_after).length}</strong> Pending deletion</span>
              </div>
              <button
                type="button"
                className="visitor-archive-modal-close"
                onClick={handleArchiveViewToggle}
                aria-label="Close archived conversations"
                title="Close archive"
              >
                <FiX />
              </button>
            </header>
          )}

          {archivedView && error && <div className="visitor-messages-error visitor-archive-modal-error" role="alert">{error}</div>}

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
                      {conversation.delete_after && (
                        <span className="visitor-conversation-delete-status">Deletes {formatListTime(conversation.delete_after)}</span>
                      )}
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
                    {thread.conversation.visitor_email ? (
                      <a href={`mailto:${thread.conversation.visitor_email}`}><FiMail /> {thread.conversation.visitor_email}</a>
                    ) : (
                      <span><FiMail /> No email provided</span>
                    )}
                    <span>{thread.conversation.visitor_label}</span>
                  </div>
                  <div className="visitor-thread-actions">
                    {archivedView ? (
                      <>
                        {thread.conversation.status === 'resolved' && (
                          <button
                            type="button"
                            className="visitor-thread-status-action is-resolved"
                            onClick={handleStatusChange}
                            disabled={updatingStatus}
                          >
                            <FiClock />
                            {updatingStatus ? 'Updating...' : 'Reopen'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="visitor-thread-restore-action"
                          onClick={handleRestore}
                          disabled={updatingArchive}
                        >
                          <FiRotateCcw />
                          {updatingArchive ? 'Restoring...' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          className="visitor-thread-delete-action"
                          onClick={() => setPendingDeletion(thread.conversation)}
                          disabled={updatingArchive || Boolean(thread.conversation.delete_after)}
                        >
                          <FiTrash2 />
                          {thread.conversation.delete_after ? 'Deletion scheduled' : 'Delete conversation'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`visitor-thread-status-action is-${thread.conversation.status}`}
                          onClick={handleStatusChange}
                          disabled={updatingStatus}
                        >
                          {thread.conversation.status === 'resolved' ? <FiClock /> : <FiCheckCircle />}
                          {updatingStatus ? 'Updating...' : thread.conversation.status === 'resolved' ? 'Reopen' : 'Mark Resolved'}
                        </button>
                        <button
                          type="button"
                          className="visitor-thread-archive-action"
                          onClick={handleArchive}
                          disabled={updatingArchive}
                        >
                          <FiArchive />
                          {updatingArchive ? 'Archiving...' : 'Archive'}
                        </button>
                      </>
                    )}
                  </div>
                </header>

                {thread.conversation.delete_after && (
                  <div className="visitor-thread-deletion-notice" role="status">
                    <FiAlertTriangle />
                    <span>
                      Permanent deletion is scheduled for <strong>{formatDateTime(thread.conversation.delete_after)}</strong>.
                      Restore this conversation before then to cancel deletion.
                    </span>
                  </div>
                )}

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

                {!archivedView ? <form className="visitor-thread-composer" onSubmit={handleReply}>
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
                </form> : (
                  <div className="visitor-thread-archived-note">
                    <FiArchive /> Reopen or restore this conversation before replying.
                  </div>
                )}
              </>
            ) : null}
            </div>
          </section>
        </div>
      </main>

      {pendingDeletion && (
        <div className="visitor-delete-modal-backdrop" role="presentation" onMouseDown={() => setPendingDeletion(null)}>
          <section
            className="visitor-delete-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="visitor-delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="visitor-delete-modal-close"
              onClick={() => setPendingDeletion(null)}
              aria-label="Close deletion confirmation"
            >
              <FiX />
            </button>
            <span className="visitor-delete-modal-icon"><FiAlertTriangle /></span>
            <p className="visitor-delete-modal-eyebrow">30-DAY RECOVERY PERIOD</p>
            <h2 id="visitor-delete-title">Delete this conversation?</h2>
            <p>
              The conversation with <strong>{pendingDeletion.visitor_name}</strong> will remain in the archive for 30 days.
              You can restore it during that period. Afterward, the conversation and all of its messages will be permanently deleted.
            </p>
            <div className="visitor-delete-modal-preview">
              <span>{pendingDeletion.visitor_name}</span>
              <small>{pendingDeletion.visitor_email || 'No email provided'}</small>
            </div>
            <div className="visitor-delete-modal-actions">
              <button type="button" onClick={() => setPendingDeletion(null)} disabled={updatingArchive}>Cancel</button>
              <button type="button" onClick={handleScheduleDeletion} disabled={updatingArchive}>
                <FiTrash2 /> {updatingArchive ? 'Scheduling...' : 'Schedule deletion'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
