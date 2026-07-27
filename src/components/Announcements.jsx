import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { FiArchive } from 'react-icons/fi';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import CloseButton from './CloseButton';
import PersonnelRecipientPicker from './PersonnelRecipientPicker';
import LandingContentEditor from './LandingContentEditor';
import { useUser } from '../context/UserContext';
import {
  createAnnouncement,
  getAnnouncementsForUser,
  acknowledgeAnnouncement,
  getAudienceLabel,
  getPersonnelRecipients,
  archiveAnnouncement,
  restoreAnnouncement,
  getArchivedAnnouncements,
  MAX_ANNOUNCEMENT_WORDS,
  countAnnouncementWords
} from '../utils/announcementsService';
import './Announcements.css';

const AUDIENCE_OPTIONS = [
  { value: 'public', label: 'Public (all users)' },
  { value: 'all_personnel', label: 'All Personnel' },
  { value: 'specific_personnel', label: 'Specific Personnel' }
];

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
]);

const ANNOUNCEMENT_DRAFT_STORAGE_KEY = 'ignis-safe:announcement-draft';

const truncateAnnouncementWords = (value) => {
  const text = String(value || '');
  const words = [...text.matchAll(/\S+/gu)];
  if (words.length <= MAX_ANNOUNCEMENT_WORDS) return text;
  return text.slice(0, words[MAX_ANNOUNCEMENT_WORDS].index).trimEnd();
};

const isBrowserStorageAvailable = () => typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

const readAnnouncementDraft = () => {
  if (!isBrowserStorageAvailable()) return null;

  try {
    const raw = sessionStorage.getItem(ANNOUNCEMENT_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeAnnouncementDraft = (draft) => {
  if (!isBrowserStorageAvailable()) return;

  try {
    sessionStorage.setItem(ANNOUNCEMENT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage write failures (e.g. quota exceeded, private browsing).
  }
};

const clearAnnouncementDraft = () => {
  if (!isBrowserStorageAvailable()) return;
  sessionStorage.removeItem(ANNOUNCEMENT_DRAFT_STORAGE_KEY);
};

const formatAttachmentSize = (sizeBytes) => {
  const size = Number(sizeBytes || 0);
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (isoDate) => {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function Announcements() {
  const { currentUser } = useUser();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('announcements');
  const [announcements, setAnnouncements] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [overflowingIds, setOverflowingIds] = useState(() => new Set());
  const contentRefs = useRef({});
  const titleRefs = useRef({});
  const messageTextareaRef = useRef(null);
  const [archiveModalId, setArchiveModalId] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [archivedAnnouncements, setArchivedAnnouncements] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [restoringId, setRestoringId] = useState('');
  const ITEMS_PER_PAGE = 3;
  const [formData, setFormData] = useState(() => {
    const draft = readAnnouncementDraft();
    return {
      title: draft?.title || '',
      content: draft?.content || '',
      audience_type: draft?.audience_type || 'public',
      target_personnel_id: draft?.target_personnel_id || ''
    };
  });
  const [draftAttachmentMeta, setDraftAttachmentMeta] = useState(() => {
    const draft = readAnnouncementDraft();
    return Array.isArray(draft?.attachments) ? draft.attachments : [];
  });
  const [exitModalContext, setExitModalContext] = useState(null); // 'announcement' | 'landing' | null
  const [isLandingDirty, setIsLandingDirty] = useState(false);
  const landingEditorRef = useRef(null);
  const pendingNavigationRef = useRef(null);
  const bypassNavigationRef = useRef(false);

  const role = String(currentUser?.role || '').toLowerCase();
  // The route, not the account's underlying role, decides which workspace
  // is active. An admin viewing /personnel/* is in the Personnel workspace
  // and must see Personnel-only functions, even though their role is admin.
  const isPersonnelWorkspace = location.pathname.startsWith('/personnel');
  const isIntelUnitWorkspace = location.pathname.startsWith('/intel-unit');
  const sidebarVariant = isPersonnelWorkspace ? 'personnel' : isIntelUnitWorkspace ? 'intel-unit' : 'admin';
  const isAdmin = role === 'admin' && !isPersonnelWorkspace;
  // Services key off currentUser.role (e.g. acknowledgeAnnouncement requires
  // role === 'personnel'). While an admin is in the Personnel workspace we
  // fetch/act using their own admin_id but under a personnel-shaped role so
  // they see and can acknowledge their own announcement feed.
  const effectiveUser = isPersonnelWorkspace && role === 'admin'
    ? { ...currentUser, role: 'personnel' }
    : currentUser;
  const isAnnouncementTab = !isAdmin || activeTab === 'announcements';
  const announcementWordCount = useMemo(
    () => countAnnouncementWords(formData.content),
    [formData.content]
  );

  const isAnnouncementFormDirty = isAdmin && Boolean(
    formData.title.trim() ||
    formData.content.trim() ||
    formData.audience_type !== 'public' ||
    formData.target_personnel_id ||
    attachmentFiles.length > 0 ||
    draftAttachmentMeta.length > 0
  );

  const isAnyFormDirty = isAnnouncementFormDirty || isLandingDirty;

  const shouldBlockAnnouncementNavigation = useCallback(({ currentLocation, nextLocation }) => {
    if (bypassNavigationRef.current) {
      bypassNavigationRef.current = false;
      return false;
    }

    const currentPath = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextPath = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return isAnyFormDirty && currentPath !== nextPath;
  }, [isAnyFormDirty]);
  const announcementBlocker = useBlocker(shouldBlockAnnouncementNavigation);
  const hasPendingAnnouncementExit = exitModalContext !== null || announcementBlocker.state === 'blocked';

  useEffect(() => {
    if (announcementBlocker.state === 'blocked' && exitModalContext === null) {
      setExitModalContext(isLandingDirty ? 'landing' : 'announcement');
    }
  }, [announcementBlocker.state, isLandingDirty, exitModalContext]);

  useEffect(() => {
    if (!isAnnouncementFormDirty) {
      clearAnnouncementDraft();
      return;
    }

    writeAnnouncementDraft({
      title: formData.title,
      content: formData.content,
      audience_type: formData.audience_type,
      target_personnel_id: formData.target_personnel_id,
      attachments: attachmentFiles.length > 0
        ? attachmentFiles.map((file) => ({ name: file.name, size: file.size, type: file.type }))
        : draftAttachmentMeta
    });
  }, [isAnnouncementFormDirty, formData, attachmentFiles, draftAttachmentMeta]);

  useEffect(() => {
    if (!isAnyFormDirty) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnyFormDirty]);

  const resetAnnouncementForm = () => {
    setFormData({
      title: '',
      content: '',
      audience_type: 'public',
      target_personnel_id: ''
    });
    setAttachmentFiles([]);
    setDraftAttachmentMeta([]);
  };

  const runAnnouncementManualNavigation = (navigation) => {
    bypassNavigationRef.current = true;

    try {
      const actionResult = navigation.action();
      Promise.resolve(actionResult).finally(() => {
        bypassNavigationRef.current = false;
      });
    } catch (error) {
      bypassNavigationRef.current = false;
      throw error;
    }
  };

  const handleAnnouncementHeaderNavigationRequest = (navigation) => {
    if (!isAnyFormDirty) {
      navigation.action();
      return;
    }

    pendingNavigationRef.current = { type: 'manual', navigation };
    setExitModalContext(isLandingDirty ? 'landing' : 'announcement');
  };

  const handleContentTabClick = (tabId) => {
    if (tabId === activeTab) return;

    if (!isAnyFormDirty) {
      setActiveTab(tabId);
      return;
    }

    pendingNavigationRef.current = { type: 'tab', tab: tabId };
    setExitModalContext(isLandingDirty ? 'landing' : 'announcement');
  };

  const handleKeepEditingAnnouncement = () => {
    pendingNavigationRef.current = null;
    setExitModalContext(null);

    if (announcementBlocker.state === 'blocked') {
      announcementBlocker.reset();
    }
  };

  const proceedPendingAnnouncementNavigation = () => {
    const pending = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setExitModalContext(null);

    if (pending?.type === 'tab') {
      setActiveTab(pending.tab);
    } else if (pending?.type === 'manual') {
      runAnnouncementManualNavigation(pending.navigation);
    }

    if (announcementBlocker.state === 'blocked') {
      announcementBlocker.proceed();
    }
  };

  const handleSaveAnnouncementDraftAndContinue = () => {
    proceedPendingAnnouncementNavigation();
  };

  const handleLeaveAnnouncementWithoutSaving = () => {
    if (exitModalContext === 'landing') {
      landingEditorRef.current?.discardUnsavedChanges();
    } else {
      clearAnnouncementDraft();
      resetAnnouncementForm();
    }
    proceedPendingAnnouncementNavigation();
  };

  const handleRemoveDraftAttachmentMeta = (indexToRemove) => {
    setDraftAttachmentMeta((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const loadAnnouncements = async () => {
    const { data, error } = await getAnnouncementsForUser(effectiveUser);
    if (error) {
      setMessage({ type: 'error', text: `Failed to load announcements: ${error}` });
      setAnnouncements([]);
      return;
    }

    setAnnouncements(data || []);
  };

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });

      await loadAnnouncements();

      if (isAdmin) {
        const { data, error } = await getPersonnelRecipients();
        if (error) {
          setMessage({ type: 'error', text: `Unable to load personnel list: ${error}` });
        } else {
          setRecipients(data || []);
        }
      }

      setLoading(false);
    };

    initialize();
  }, [isAdmin, isPersonnelWorkspace, currentUser?.admin_id]);

  // Announcements has no polling of its own; other tabs/users emit this
  // event (e.g. a personnel acknowledging) so an already-open admin view
  // can refresh its ack counts / pending list without a manual reload.
  useEffect(() => {
    const handleDataChanged = (event) => {
      if (event?.detail?.scope !== 'announcements') return;
      loadAnnouncements();
    };

    window.addEventListener('ignis-safe:data-changed', handleDataChanged);
    return () => window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
  }, [effectiveUser]);

  const loadArchivedAnnouncements = async () => {
    setArchivedLoading(true);
    const { data, error } = await getArchivedAnnouncements(currentUser);
    if (error) {
      setMessage({ type: 'error', text: `Failed to load archived announcements: ${error}` });
    } else {
      setArchivedAnnouncements(data || []);
      setArchivedLoaded(true);
    }
    setArchivedLoading(false);
  };

  const toggleArchivedPanel = () => {
    setArchivedOpen((prev) => {
      const next = !prev;
      if (next && !archivedLoaded) {
        loadArchivedAnnouncements();
      }
      return next;
    });
  };

  useEffect(() => {
    if (!archivedOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setArchivedOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [archivedOpen]);

  const filteredAnnouncements = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return announcements;
    }

    return announcements.filter((announcement) => {
      const haystack = [
        announcement.title,
        announcement.content,
        getAudienceLabel(announcement),
        announcement.created_by_name
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [announcements, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredAnnouncements.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedAnnouncements = filteredAnnouncements.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleSubmitAnnouncement = async (event) => {
    event.preventDefault();
    
    if (!currentUser || !currentUser.admin_id) {
      setMessage({ type: 'error', text: 'User session not found. Please refresh and try again.' });
      return;
    }
    
    if (formData.audience_type === 'specific_personnel' && !formData.target_personnel_id) {
      setMessage({ type: 'error', text: 'Please select a personnel recipient before sending.' });
      return;
    }

    if (announcementWordCount > MAX_ANNOUNCEMENT_WORDS) {
      setMessage({
        type: 'error',
        text: `Announcement messages cannot exceed ${MAX_ANNOUNCEMENT_WORDS} words.`
      });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {
        title: formData.title,
        content: formData.content,
        audience_type: formData.audience_type,
        target_personnel_id: formData.target_personnel_id || null,
        attachments: attachmentFiles
      };

      const { error } = await createAnnouncement(currentUser, payload);
      if (error) {
        setMessage({ type: 'error', text: error });
        return;
      }

      clearAnnouncementDraft();
      resetAnnouncementForm();
      setMessage({ type: 'success', text: 'Announcement sent successfully.' });
      await loadAnnouncements();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachmentChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    const validFiles = [];
    const rejectedNames = [];

    selectedFiles.forEach((file) => {
      const mimeType = String(file?.type || '').toLowerCase();
      const size = Number(file?.size || 0);

      if (!ALLOWED_ATTACHMENT_TYPES.has(mimeType)) {
        rejectedNames.push(`${file.name} (unsupported type)`);
        return;
      }

      if (size > MAX_ATTACHMENT_SIZE) {
        rejectedNames.push(`${file.name} (over 10MB)`);
        return;
      }

      validFiles.push(file);
    });

    setAttachmentFiles((prev) => {
      const next = [...prev, ...validFiles].slice(0, MAX_ATTACHMENTS);
      if (validFiles.length + prev.length > MAX_ATTACHMENTS) {
        setMessage({
          type: 'error',
          text: `Only ${MAX_ATTACHMENTS} attachments are allowed per announcement.`
        });
      } else if (rejectedNames.length > 0) {
        setMessage({
          type: 'error',
          text: `Some files were not added: ${rejectedNames.join(', ')}`
        });
      }
      return next;
    });

    event.target.value = '';
  };

  const handleRemoveAttachment = (indexToRemove) => {
    setAttachmentFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleAnnouncementContentChange = (event) => {
    const value = event.target.value;

    if (
      announcementWordCount >= MAX_ANNOUNCEMENT_WORDS &&
      value.length > formData.content.length
    ) {
      setMessage({
        type: 'error',
        text: `The message is limited to ${MAX_ANNOUNCEMENT_WORDS} words.`
      });
      return;
    }

    const limitedValue = truncateAnnouncementWords(value);

    if (limitedValue !== value) {
      setMessage({
        type: 'error',
        text: `The message is limited to ${MAX_ANNOUNCEMENT_WORDS} words.`
      });
    }

    setFormData((prev) => ({ ...prev, content: limitedValue }));
  };

  const handleAcknowledgeAnnouncement = async (announcementId) => {
    if (!announcementId) return;

    setAcknowledgingId(announcementId);
    setMessage({ type: '', text: '' });

    const { data, error } = await acknowledgeAnnouncement(effectiveUser, announcementId);
    if (error) {
      setMessage({ type: 'error', text: `Failed to acknowledge announcement: ${error}` });
      setAcknowledgingId('');
      return;
    }

    setAnnouncements((prev) =>
      prev.map((row) =>
        row.announcement_id === announcementId
          ? {
              ...row,
              acknowledged_by_current_user: true,
              acknowledged_at: data?.acknowledged_at || new Date().toISOString()
            }
          : row
      )
    );

    setMessage({ type: 'success', text: 'Announcement acknowledged.' });
    setAcknowledgingId('');
  };

  const handleArchiveAnnouncement = async () => {
    if (!archiveModalId) return;

    setArchiving(true);
    const { error } = await archiveAnnouncement(currentUser, archiveModalId);
    setArchiving(false);

    if (error) {
      setMessage({ type: 'error', text: `Failed to archive announcement: ${error}` });
      return;
    }

    setAnnouncements((prev) => prev.filter((row) => row.announcement_id !== archiveModalId));
    setArchiveModalId('');
    setMessage({ type: 'success', text: 'Announcement archived.' });
    setArchivedLoaded(false);
  };

  const handleRestoreAnnouncement = async (announcementId) => {
    if (!announcementId) return;

    setRestoringId(announcementId);
    const { error } = await restoreAnnouncement(currentUser, announcementId);
    setRestoringId('');

    if (error) {
      setMessage({ type: 'error', text: `Failed to restore announcement: ${error}` });
      return;
    }

    setArchivedAnnouncements((prev) => prev.filter((row) => row.announcement_id !== announcementId));
    setMessage({ type: 'success', text: 'Announcement restored.' });
    await loadAnnouncements();
  };

  const toggleAnnouncementExpanded = (announcementId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(announcementId)) {
        next.delete(announcementId);
      } else {
        next.add(announcementId);
      }
      return next;
    });
  };

  const measureAnnouncementOverflow = useCallback(() => {
    setOverflowingIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      const announcementIds = new Set([
        ...Object.keys(contentRefs.current),
        ...Object.keys(titleRefs.current)
      ]);

      announcementIds.forEach((announcementId) => {
        if (expandedIds.has(announcementId)) return;

        const contentElement = contentRefs.current[announcementId];
        const titleElement = titleRefs.current[announcementId];
        const isOverflowing = Boolean(
          (contentElement && contentElement.scrollHeight - contentElement.clientHeight > 1) ||
          (titleElement && titleElement.scrollHeight - titleElement.clientHeight > 1)
        );

        if (isOverflowing && !next.has(announcementId)) {
          next.add(announcementId);
          changed = true;
        } else if (!isOverflowing && next.has(announcementId)) {
          next.delete(announcementId);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [expandedIds]);

  useLayoutEffect(() => {
    measureAnnouncementOverflow();
  }, [paginatedAnnouncements, expandedIds, measureAnnouncementOverflow]);

  useEffect(() => {
    window.addEventListener('resize', measureAnnouncementOverflow);
    return () => window.removeEventListener('resize', measureAnnouncementOverflow);
  }, [measureAnnouncementOverflow]);

  useLayoutEffect(() => {
    const textarea = messageTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [formData.content]);

  return (
    <div className="announcements-container">
      <Sidebar variant={sidebarVariant} />

      <div className="announcements-main">
        <PageHeader
          title={isAdmin ? 'Content Management' : 'Announcements'}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant={sidebarVariant}
          showSearch={isAnnouncementTab}
          onNavigationRequest={handleAnnouncementHeaderNavigationRequest}
        />

        {isAdmin && (
          <div className="content-management-toolbar">
            <div className="content-tabs" role="tablist" aria-label="Content management tabs">
              <button
                type="button"
                className={`content-tab ${activeTab === 'announcements' ? 'active' : ''}`}
                onClick={() => handleContentTabClick('announcements')}
                role="tab"
                aria-selected={activeTab === 'announcements'}
              >
                Announcements
              </button>
              <button
                type="button"
                className={`content-tab ${activeTab === 'landing' ? 'active' : ''}`}
                onClick={() => handleContentTabClick('landing')}
                role="tab"
                aria-selected={activeTab === 'landing'}
              >
                Landing Page
              </button>
            </div>

            {isAnnouncementTab && (
              <button
                type="button"
                className={`archive-list-button${archivedOpen ? ' is-open' : ''}`}
                onClick={toggleArchivedPanel}
                aria-expanded={archivedOpen}
                aria-controls="announcementArchiveList"
              >
                <FiArchive aria-hidden="true" />
                Archive List
                {archivedLoaded && (
                  <span className="archive-list-count">{archivedAnnouncements.length}</span>
                )}
              </button>
            )}
          </div>
        )}

        {message.text && (
          <div className={`announcement-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {isAdmin && isAnnouncementTab && (
          <div className="announcement-card composer-card">
            <h2>Create Announcement</h2>
            <form className="announcement-form" onSubmit={handleSubmitAnnouncement}>
              <div className="form-row two-col">
                <div className="form-field">
                  <label htmlFor="announcementTitle">Title <span className="required-asterisk">*</span></label>
                  <input
                    id="announcementTitle"
                    type="text"
                    value={formData.title}
                    onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Type announcement title"
                    maxLength={120}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="announcementAudience">Audience <span className="required-asterisk">*</span></label>
                  <select
                    id="announcementAudience"
                    required
                    value={formData.audience_type}
                    onChange={(event) => setFormData((prev) => ({
                      ...prev,
                      audience_type: event.target.value,
                      target_personnel_id: event.target.value === 'specific_personnel' ? prev.target_personnel_id : ''
                    }))}
                  >
                    {AUDIENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.audience_type === 'specific_personnel' && (
                <div className="form-row">
                  <PersonnelRecipientPicker
                    idPrefix="announcement"
                    recipients={recipients}
                    value={formData.target_personnel_id}
                    onChange={(targetPersonnelId) => setFormData((prev) => ({
                      ...prev,
                      target_personnel_id: targetPersonnelId
                    }))}
                  />
                </div>
              )}

              <div className="form-row">
                <div className="form-field announcement-message-field">
                  <label htmlFor="announcementContent">Message <span className="required-asterisk">*</span></label>
                  <textarea
                    id="announcementContent"
                    ref={messageTextareaRef}
                    value={formData.content}
                    onChange={handleAnnouncementContentChange}
                    placeholder="Write the full announcement..."
                    rows={8}
                    aria-describedby="announcementWordLimit"
                    required
                  />
                  <div
                    id="announcementWordLimit"
                    className={`announcement-word-limit${announcementWordCount >= MAX_ANNOUNCEMENT_WORDS ? ' is-full' : ''}`}
                  >
                    <span>Maximum {MAX_ANNOUNCEMENT_WORDS} words</span>
                    <strong>{announcementWordCount} / {MAX_ANNOUNCEMENT_WORDS}</strong>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="announcementAttachments">Attachments (optional)</label>
                  <input
                    id="announcementAttachments"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,image/bmp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    multiple
                    onChange={handleAttachmentChange}
                  />
                  <small className="form-help-text">
                    Up to {MAX_ATTACHMENTS} files. Supports photos, PDF, DOC, XLS, and TXT files.
                  </small>

                  {attachmentFiles.length > 0 && (
                    <ul className="attachment-selection-list">
                      {attachmentFiles.map((file, index) => (
                        <li key={`${file.name}-${index}`} className="attachment-selection-item">
                          <span>{file.name} ({formatAttachmentSize(file.size)})</span>
                          <button
                            type="button"
                            className="attachment-remove-button"
                            onClick={() => handleRemoveAttachment(index)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {attachmentFiles.length === 0 && draftAttachmentMeta.length > 0 && (
                    <div className="attachment-draft-notice">
                      <small className="form-help-text">
                        Restored from your last draft — please re-attach these files to include them:
                      </small>
                      <ul className="attachment-selection-list">
                        {draftAttachmentMeta.map((file, index) => (
                          <li key={`draft-${file.name}-${index}`} className="attachment-selection-item">
                            <span>{file.name} ({formatAttachmentSize(file.size)})</span>
                            <button
                              type="button"
                              className="attachment-remove-button"
                              onClick={() => handleRemoveDraftAttachmentMeta(index)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Announcement'}
                </button>
              </div>
            </form>
          </div>
        )}

        {isAdmin && activeTab === 'landing' ? (
          <div className="announcement-card landing-editor-card">
            <LandingContentEditor embedded ref={landingEditorRef} onDirtyChange={setIsLandingDirty} />
          </div>
        ) : (
          <div className="announcement-card list-card">
          <div className="list-card-header">
            <h2>{isAdmin ? 'Sent Announcements' : 'Announcement Feed'}</h2>
            <span className="announcement-count">{filteredAnnouncements.length} item(s)</span>
          </div>

          {loading ? (
            <div className="announcement-empty">Loading announcements...</div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="announcement-empty">No announcements found.</div>
          ) : (
            <>
            <div className="announcement-list">
              {paginatedAnnouncements.map((announcement) => (
                <article key={announcement.announcement_id} className="announcement-item">
                  <div className="announcement-item-header">
                    <h3
                      className={`announcement-title ${expandedIds.has(announcement.announcement_id) ? '' : 'clamped'}`}
                      ref={(element) => {
                        titleRefs.current[announcement.announcement_id] = element;
                      }}
                    >
                      {announcement.title}
                    </h3>
                    <span className="announcement-audience">{getAudienceLabel(announcement)}</span>
                  </div>
                  <p
                    className={`announcement-content ${expandedIds.has(announcement.announcement_id) ? '' : 'clamped'}`}
                    ref={(element) => {
                      contentRefs.current[announcement.announcement_id] = element;
                    }}
                  >
                    {announcement.content}
                  </p>
                  {overflowingIds.has(announcement.announcement_id) && (
                    <button
                      type="button"
                      className="announcement-toggle-button"
                      onClick={() => toggleAnnouncementExpanded(announcement.announcement_id)}
                    >
                      {expandedIds.has(announcement.announcement_id) ? 'See less' : 'See more'}
                    </button>
                  )}
                  {Array.isArray(announcement.attachments) && announcement.attachments.length > 0 && (
                    <div className="announcement-attachments">
                      {announcement.attachments.map((attachment, index) => (
                        attachment.is_image ? (
                          <a
                            key={`${announcement.announcement_id}-img-${index}`}
                            className="announcement-image-link"
                            href={attachment.file_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img src={attachment.file_url} alt={attachment.file_name || 'Attached image'} loading="lazy" />
                          </a>
                        ) : (
                          <a
                            key={`${announcement.announcement_id}-file-${index}`}
                            className="announcement-file-link"
                            href={attachment.file_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {attachment.file_name || 'Attachment'}
                          </a>
                        )
                      ))}
                    </div>
                  )}
                  <div className="announcement-meta">
                    {isAdmin && announcement.acknowledgement_summary?.totalRecipients > 0 && (
                      <span>
                        Acknowledged: {announcement.acknowledgement_summary.acknowledgedCount}/
                        {announcement.acknowledgement_summary.totalRecipients}
                      </span>
                    )}
                    {!isAdmin && (
                      <span className={`announcement-ack-status ${announcement.acknowledged_by_current_user ? 'acknowledged' : 'pending'}`}>
                        {announcement.acknowledged_by_current_user ? 'Acknowledged' : 'Pending acknowledgment'}
                      </span>
                    )}
                    <span>{formatDate(announcement.created_at)}</span>
                  </div>

                  {isAdmin && announcement.pending_personnel?.length > 0 && (
                    <div className="announcement-pending-by">
                      Pending acknowledgement by: {announcement.pending_personnel.join(', ')}
                    </div>
                  )}

                  {!isAdmin && !announcement.acknowledged_by_current_user && (
                    <div className="announcement-ack-action">
                      <button
                        type="button"
                        onClick={() => handleAcknowledgeAnnouncement(announcement.announcement_id)}
                        disabled={acknowledgingId === announcement.announcement_id}
                      >
                        {acknowledgingId === announcement.announcement_id ? 'Acknowledging...' : 'Acknowledge'}
                      </button>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="announcement-archive-action">
                      <button
                        type="button"
                        className="announcement-archive-button"
                        onClick={() => setArchiveModalId(announcement.announcement_id)}
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="announcement-pagination">
                <button
                  className="pagination-button pagination-prev"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  ◀
                </button>
                <span className="pagination-info">Page {currentPage} of {totalPages}</span>
                <button
                  className="pagination-button pagination-next"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  ▶
                </button>
              </div>
            )}
            </>
          )}
          </div>
        )}

      </div>

      {isAdmin && isAnnouncementTab && archivedOpen && (
        <div
          className="archive-list-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setArchivedOpen(false);
          }}
        >
          <section
            id="announcementArchiveList"
            className="archive-list-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcementArchiveTitle"
          >
            <div className="archived-panel-header">
              <div>
                <span>Announcement records</span>
                <h2 id="announcementArchiveTitle">
                  Archive List{archivedLoaded ? ` (${archivedAnnouncements.length})` : ''}
                </h2>
              </div>
              <CloseButton
                className="archived-panel-close"
                onClick={toggleArchivedPanel}
                label="Close archive list"
              />
            </div>

            <div className="archived-panel">
                {archivedLoading ? (
                  <div className="announcement-empty">Loading archived announcements...</div>
                ) : archivedAnnouncements.length === 0 ? (
                  <div className="announcement-empty">No archived announcements.</div>
                ) : (
                  archivedAnnouncements.map((announcement) => (
                    <article key={announcement.announcement_id} className="archived-item">
                      <div className="announcement-item-header">
                        <h3>{announcement.title}</h3>
                        <span className="announcement-audience">{getAudienceLabel(announcement)}</span>
                      </div>
                      <p className="announcement-content">{announcement.content}</p>
                      {Array.isArray(announcement.attachments) && announcement.attachments.length > 0 && (
                        <div className="announcement-attachments">
                          {announcement.attachments.map((attachment, index) => (
                            attachment.is_image ? (
                              <a
                                key={`${announcement.announcement_id}-img-${index}`}
                                className="announcement-image-link"
                                href={attachment.file_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img src={attachment.file_url} alt={attachment.file_name || 'Attached image'} loading="lazy" />
                              </a>
                            ) : (
                              <a
                                key={`${announcement.announcement_id}-file-${index}`}
                                className="announcement-file-link"
                                href={attachment.file_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {attachment.file_name || 'Attachment'}
                              </a>
                            )
                          ))}
                        </div>
                      )}
                      <div className="announcement-meta">
                        <span>Archived {formatDate(announcement.archived_at)}{announcement.archived_by_name ? ` by ${announcement.archived_by_name}` : ''}</span>
                      </div>
                      <div className="archived-restore-action">
                        <button
                          type="button"
                          className="archived-restore-button"
                          onClick={() => handleRestoreAnnouncement(announcement.announcement_id)}
                          disabled={restoringId === announcement.announcement_id}
                        >
                          {restoringId === announcement.announcement_id ? 'Restoring...' : 'Restore'}
                        </button>
                      </div>
                    </article>
                  ))
                )}
            </div>
          </section>
        </div>
      )}

      {archiveModalId && (
        <div className="announcement-confirm-modal-overlay">
          <div className="announcement-confirm-modal-card">
            <h3>Archive Announcement</h3>
            <p>Are you sure you want to archive this announcement? It will be removed from the active list but remains stored and can be restored later.</p>
            <div className="announcement-confirm-modal-actions">
              <button
                type="button"
                className="announcement-confirm-modal-cancel"
                onClick={() => setArchiveModalId('')}
                disabled={archiving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="announcement-confirm-modal-confirm"
                onClick={handleArchiveAnnouncement}
                disabled={archiving}
              >
                {archiving ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {hasPendingAnnouncementExit && (
        <div
          className="unsaved-exit-overlay app-unsaved-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="unsavedExitTitle"
          aria-describedby="unsavedExitDescription"
        >
          <div className="unsaved-exit-modal app-unsaved-dialog">
            <div className="unsaved-exit-icon app-unsaved-icon" aria-hidden="true">
              !
            </div>
            <h3 id="unsavedExitTitle" className="unsaved-exit-title app-unsaved-title">
              {exitModalContext === 'landing' ? 'Unsaved Landing Page' : 'Unsaved Announcement'}
            </h3>
            <p id="unsavedExitDescription" className="unsaved-exit-message app-unsaved-message">
              {exitModalContext === 'landing'
                ? 'You have unsaved changes in this landing page. What would you like to do before leaving this page?'
                : 'You have unsaved changes in this announcement. What would you like to do before leaving this page?'}
            </p>
            <div className="unsaved-exit-actions app-unsaved-actions">
              <button
                type="button"
                className="unsaved-exit-btn unsaved-exit-btn-save app-unsaved-button app-unsaved-button--save"
                onClick={handleSaveAnnouncementDraftAndContinue}
              >
                Save Draft and Continue
              </button>
              <button
                type="button"
                className="unsaved-exit-btn unsaved-exit-btn-leave app-unsaved-button app-unsaved-button--discard"
                onClick={handleLeaveAnnouncementWithoutSaving}
              >
                Leave Without Saving
              </button>
              <button
                type="button"
                className="unsaved-exit-btn unsaved-exit-btn-cancel app-unsaved-button app-unsaved-button--cancel"
                onClick={handleKeepEditingAnnouncement}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
