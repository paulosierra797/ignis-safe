import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArchiveButton from './ArchiveButton';
import RecordActions from './RecordActions';
import Pagination from './Pagination';
import usePagination from '../hooks/usePagination';
import ToastMessage from './ToastMessage';
import {
  FiArrowLeft,
  FiArchive,
  FiAlertTriangle,
  FiMail,
  FiMessageCircle,
  FiRefreshCw,
  FiRotateCcw,
  FiSearch,
  FiSend,
  FiTrash2,
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
  const [archivedView, setArchivedView] = useState(false);
  const [reply, setReply] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
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
    setSelectedId((current) => (
      nextConversations.some((item) => item.id === current)
        ? current
        : ''
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
      const matchesSearch = !term || [
        conversation.visitor_name,
        conversation.visitor_email,
        conversation.last_message_preview,
      ].some((value) => String(value || '').toLowerCase().includes(term));
      return matchesSearch;
    });
  }, [conversations, search]);

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

  const handleArchive = async (conversation = thread?.conversation) => {
    if (!conversation || updatingArchive) return;
    setUpdatingArchive(true);
    setError('');
    const result = await archiveVisitorConversation(conversation.id);
    setUpdatingArchive(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    if (selectedId === conversation.id) {
      setThread(null);
      setSelectedId('');
    }
    await loadConversations({ quiet: true });
  };

  const handleRestore = async (conversation = thread?.conversation) => {
    if (!conversation || updatingArchive) return;
    setUpdatingArchive(true);
    setError('');
    const result = await restoreVisitorConversation(conversation.id);
    setUpdatingArchive(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    if (selectedId === conversation.id) {
      setThread(null);
      setSelectedId('');
    }
    await loadConversations({ quiet: true });
  };

  const handleScheduleDeletion = async () => {
    if (!pendingDeletion || updatingArchive) return;
    setUpdatingArchive(true);
    setError('');
    if (!pendingDeletion.is_archived) {
      const archiveResult = await archiveVisitorConversation(pendingDeletion.id);
      if (archiveResult.error) {
        setUpdatingArchive(false);
        setError(archiveResult.error);
        setPendingDeletion(null);
        return;
      }
    }
    const result = await scheduleVisitorConversationDeletion(pendingDeletion.id);
    setUpdatingArchive(false);
    if (result.error) {
      setError(result.error);
      setPendingDeletion(null);
      return;
    }
    if (archivedView) {
      setThread((current) => current ? { ...current, conversation: result.data.conversation } : current);
      setConversations((current) => current.map((item) => (
        item.id === pendingDeletion.id ? { ...item, ...result.data.conversation } : item
      )));
    } else {
      setConversations((current) => current.filter((item) => item.id !== pendingDeletion.id));
      if (selectedId === pendingDeletion.id) {
        setThread(null);
        setSelectedId('');
      }
    }
    setPendingDeletion(null);
    await loadConversations({ quiet: true });
  };

  const handleArchiveViewChange = (showArchived) => {
    if (showArchived === archivedView) return;
    setArchivedView(showArchived);
    setSelectedId('');
    setThread(null);
    setSearch('');
    setReply('');
    setError('');
  };

  const conversationPages = usePagination(filteredConversations, filteredConversations.map(row => row.id).join(','));

  return (
    <div className="visitor-messages-page">
      <Sidebar />
      <main className="visitor-messages-main">
        <PageHeader title="Messages" />

        <section className="visitor-messages-intro">
          <div>
            <span>PUBLIC COMMUNICATION</span>
            <h2>{archivedView ? 'Archived Conversations' : 'Website Conversations'}</h2>
            <p>
              {archivedView
                ? 'Review archived visitor messages, restore conversations, or manage scheduled deletion.'
                : 'Read and reply to messages sent through the public website. Visitor names and emails are shown for clear follow-up.'}
            </p>
          </div>
        </section>

        <ToastMessage message={error} type="error" />

        <div className="visitor-messages-workspace-frame">
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
              <div className="visitor-conversation-filters" aria-label="Conversation lists">
                <button
                  type="button"
                  className={!archivedView ? 'is-active' : ''}
                  onClick={() => handleArchiveViewChange(false)}
                >
                  All
                </button>
                <button
                  type="button"
                  className={archivedView ? 'is-active' : ''}
                  onClick={() => handleArchiveViewChange(true)}
                >
                  Archives
                </button>
              </div>
            </div>

            <div className="visitor-conversation-scroll">
              {loadingList ? (
                <div className="visitor-conversation-empty"><FiRefreshCw className="is-spinning" /> Loading conversations...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="visitor-conversation-empty"><FiMessageCircle /> No conversations found.</div>
              ) : conversationPages.items.map((conversation) => (
                <article
                  key={conversation.id}
                  className={`visitor-conversation-item ${selectedId === conversation.id ? 'is-selected' : ''} ${conversation.unread ? 'is-unread' : ''}`}
                >
                  <button
                    type="button"
                    className="visitor-conversation-select"
                    onClick={() => {
                      setSelectedId(conversation.id);
                      setThread(null);
                      setReply('');
                      setError('');
                    }}
                  >
                    <span className="visitor-conversation-copy">
                    <span className="visitor-conversation-name">
                      <strong>
                        {conversation.unread && <span className="visitor-conversation-unread-dot" aria-label="New message" title="New message" />}
                        {conversation.visitor_name}
                      </strong>
                    </span>
                    <span className="visitor-conversation-preview">{conversation.last_message_preview}</span>
                    {conversation.delete_after && (
                      <span className="visitor-conversation-delete-status">Scheduled for deletion {formatListTime(conversation.delete_after)}</span>
                    )}
                    </span>
                  </button>
                  <div className="visitor-conversation-side">
                    <time>{formatListTime(conversation.last_message_at)}</time>
                    <RecordActions label={`Actions for conversation with ${conversation.visitor_name}`}>
                      {archivedView ? (
                        <button type="button" onClick={() => handleRestore(conversation)} disabled={updatingArchive}>
                          <FiRotateCcw aria-hidden="true" />Restore
                        </button>
                      ) : (
                        <ArchiveButton label="Archive" onClick={() => handleArchive(conversation)} disabled={updatingArchive} />
                      )}
                      <button
                        type="button"
                        className="visitor-thread-delete-action"
                        onClick={() => setPendingDeletion(conversation)}
                        disabled={updatingArchive || Boolean(conversation.delete_after)}
                      >
                        <FiTrash2 aria-hidden="true" />
                        {conversation.delete_after ? 'Scheduled for deletion' : 'Delete conversation'}
                      </button>
                    </RecordActions>
                  </div>
                </article>
              ))}
            </div>
            <Pagination {...conversationPages} label="Conversation pages" />
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
                  <div className="visitor-thread-person">
                    <h3>{thread.conversation.visitor_name}</h3>
                    {thread.conversation.visitor_email ? (
                      <a href={`mailto:${thread.conversation.visitor_email}`}><FiMail /> {thread.conversation.visitor_email}</a>
                    ) : (
                      <span><FiMail /> No email provided</span>
                    )}
                  </div>
                  <RecordActions label="Conversation actions">
                    {archivedView ? (
                      <>
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
                          {thread.conversation.delete_after ? 'Scheduled for deletion' : 'Delete conversation'}
                        </button>
                      </>
                    ) : (
                      <>
                        <ArchiveButton
                          label="Archive"
                          onClick={handleArchive}
                          disabled={updatingArchive}
                          busy={updatingArchive}
                        />
                        <button
                          type="button"
                          className="visitor-thread-delete-action"
                          onClick={() => setPendingDeletion(thread.conversation)}
                          disabled={updatingArchive}
                        >
                          <FiTrash2 />
                          Delete conversation
                        </button>
                      </>
                    )}
                  </RecordActions>
                </header>

                {thread.conversation.delete_after && (
                  <div className="visitor-thread-deletion-notice" role="status">
                    <FiAlertTriangle />
                    <span>
                      <strong>For deletion:</strong> permanent deletion is scheduled for <strong>{formatDateTime(thread.conversation.delete_after)}</strong>.
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

                {!thread.conversation.is_archived ? <form className="visitor-thread-composer" onSubmit={handleReply}>
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
                    <FiArchive /> Restore this conversation before replying.
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
