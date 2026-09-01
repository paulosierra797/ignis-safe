import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation } from 'react-router-dom';
import { FiArchive, FiBell, FiFileText, FiCheckCircle, FiClock, FiSearch } from 'react-icons/fi';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import CloseButton from './CloseButton';
import AnnouncementAcknowledgementModal from './AnnouncementAcknowledgementModal';
import AnnouncementNudgeTracking from './AnnouncementNudgeTracking';
import LandingContentEditor from './LandingContentEditor';
import PersonnelPicker from './PersonnelPicker';
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
  archivePersonnelAnnouncement,
  restorePersonnelAnnouncement,
  getArchivedAnnouncementsForPersonnel,
  nudgeAnnouncementPersonnel,
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
const ASIA_MANILA_TIME_ZONE = 'Asia/Manila';
const ASIA_MANILA_OFFSET = '+08:00';

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
    minute: '2-digit',
    timeZone: ASIA_MANILA_TIME_ZONE
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
  const [ackConfirmId, setAckConfirmId] = useState('');
  const [ackConfirmChecked, setAckConfirmChecked] = useState(false);
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
  const [archivedSearch, setArchivedSearch] = useState('');
  const [archivedSortField, setArchivedSortField] = useState('date'); // 'date' | 'title'
  const [archivedSortDir, setArchivedSortDir] = useState('desc'); // 'asc' | 'desc'
  const [archivedListExpanded, setArchivedListExpanded] = useState(false);
  const [archivedExpandedMsgIds, setArchivedExpandedMsgIds] = useState(() => new Set());
  const [acknowledgementModalId, setAcknowledgementModalId] = useState('');
  const [nudgingIds, setNudgingIds] = useState(() => new Set());
  const [nudgeCooldownUntilById, setNudgeCooldownUntilById] = useState(() => new Map());
  const lastViewedAnnouncementsAtRef = useRef(null);
  const [unreadTrackingReady, setUnreadTrackingReady] = useState(false);
  const ITEMS_PER_PAGE = 3;
  const ARCHIVED_VISIBLE_LIMIT = 5;
  const ARCHIVED_PREVIEW_LENGTH = 260;
  const [formData, setFormData] = useState(() => {
    const draft = readAnnouncementDraft();
    return {
      title: draft?.title || '',
      content: draft?.content || '',
      audience_type: draft?.audience_type || 'public',
      target_personnel_ids: Array.isArray(draft?.target_personnel_ids) ? draft.target_personnel_ids : [],
      acknowledgement_deadline_date: draft?.acknowledgement_deadline_date || '',
      acknowledgement_deadline_time: draft?.acknowledgement_deadline_time || ''
    };
  });
  const [personnelSelectionError, setPersonnelSelectionError] = useState('');
  const [draftAttachmentMeta, setDraftAttachmentMeta] = useState(() => {
    const draft = readAnnouncementDraft();
    return Array.isArray(draft?.attachments) ? draft.attachments : [];
  });
  const [exitModalContext, setExitModalContext] = useState(null); // 'announcement' | 'landing' | null
  const [isLandingDirty, setIsLandingDirty] = useState(false);
  const [landingActiveSection, setLandingActiveSection] = useState('preview');
  const landingEditorRef = useRef(null);
  const pendingNavigationRef = useRef(null);
  const bypassNavigationRef = useRef(false);

  const role = String(currentUser?.role || '').toLowerCase();
  // The route, not the account's underlying role, decides which workspace
  // is active. An admin viewing /personnel/* is in the Personnel workspace
  // and must see Personnel-only functions, even though their role is admin.
  const isPersonnelWorkspace = location.pathname.startsWith('/personnel');
  const sidebarVariant = isPersonnelWorkspace ? 'personnel' : 'admin';
  const isAdmin = role === 'admin' && !isPersonnelWorkspace;
  // Services key off currentUser.role (e.g. acknowledgeAnnouncement requires
  // role === 'personnel'). While an admin is in the Personnel workspace we
  // fetch/act using their own admin_id but under a personnel-shaped role so
  // they see and can acknowledge their own announcement feed.
  const effectiveUser = useMemo(
    () => (
      isPersonnelWorkspace && role === 'admin'
        ? { ...currentUser, role: 'personnel' }
        : currentUser
    ),
    [currentUser, isPersonnelWorkspace, role]
  );
  const isAnnouncementTab = !isAdmin || activeTab === 'announcements';
  const announcementWordCount = useMemo(
    () => countAnnouncementWords(formData.content),
    [formData.content]
  );

  const isAnnouncementFormDirty = isAdmin && Boolean(
    formData.title.trim() ||
    formData.content.trim() ||
    formData.audience_type !== 'public' ||
    formData.target_personnel_ids.length > 0 ||
    formData.acknowledgement_deadline_date ||
    formData.acknowledgement_deadline_time ||
    attachmentFiles.length > 0 ||
    draftAttachmentMeta.length > 0
  );

  const showAcknowledgementDeadline = formData.audience_type === 'all_personnel'
    || formData.audience_type === 'specific_personnel';

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
      target_personnel_ids: formData.target_personnel_ids,
      acknowledgement_deadline_date: formData.acknowledgement_deadline_date,
      acknowledgement_deadline_time: formData.acknowledgement_deadline_time,
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
      target_personnel_ids: [],
      acknowledgement_deadline_date: '',
      acknowledgement_deadline_time: ''
    });
    setAttachmentFiles([]);
    setDraftAttachmentMeta([]);
    setPersonnelSelectionError('');
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

  const loadAnnouncements = useCallback(async () => {
    const { data, error } = await getAnnouncementsForUser(effectiveUser);
    if (error) {
      setMessage({ type: 'error', text: `Failed to load announcements: ${error}` });
      setAnnouncements([]);
      return;
    }

    setAnnouncements(data || []);
  }, [effectiveUser]);

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
  }, [isAdmin, isPersonnelWorkspace, currentUser?.admin_id, loadAnnouncements]);

  // Purely a client-side "seen this page before" marker for the unread dot —
  // captured once per mount so cards don't flip to read mid-session as the
  // 20s poll below brings in the same announcements again.
  useEffect(() => {
    if (isAdmin || typeof window === 'undefined') return;

    const storageKey = `ignis-safe:announcements-last-viewed:${currentUser?.personnel_id || currentUser?.admin_id || 'guest'}`;
    try {
      const stored = window.localStorage.getItem(storageKey);
      lastViewedAnnouncementsAtRef.current = stored ? new Date(stored) : new Date(0);
      window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      lastViewedAnnouncementsAtRef.current = new Date(0);
    }
    setUnreadTrackingReady(true);
  }, [isAdmin, currentUser?.personnel_id, currentUser?.admin_id]);

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
  }, [loadAnnouncements]);

  useEffect(() => {
    if (isAdmin) return undefined;

    const intervalId = window.setInterval(loadAnnouncements, 20000);
    return () => window.clearInterval(intervalId);
  }, [isAdmin, loadAnnouncements]);

  const loadArchivedAnnouncements = async () => {
    setArchivedLoading(true);
    const { data, error } = isAdmin
      ? await getArchivedAnnouncements(currentUser)
      : await getArchivedAnnouncementsForPersonnel(effectiveUser);
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

  useEffect(() => {
    if (archivedOpen) return;
    setArchivedSearch('');
    setArchivedListExpanded(false);
    setArchivedExpandedMsgIds(new Set());
  }, [archivedOpen]);

  useEffect(() => {
    setArchivedListExpanded(false);
  }, [archivedSearch, archivedSortField, archivedSortDir]);

  const sortedArchivedAnnouncements = useMemo(() => {
    const normalizedQuery = archivedSearch.trim().toLowerCase();
    const filtered = normalizedQuery
      ? archivedAnnouncements.filter((announcement) => {
          const haystack = [
            announcement.title,
            announcement.content,
            getAudienceLabel(announcement),
            announcement.created_by_name
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(normalizedQuery);
        })
      : archivedAnnouncements.slice();

    const getArchivedTime = (announcement) => {
      const raw = isAdmin ? announcement.archived_at : announcement.personnel_archived_at;
      const time = raw ? new Date(raw).getTime() : NaN;
      return Number.isNaN(time) ? 0 : time;
    };

    const direction = archivedSortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (archivedSortField === 'title') {
        return direction * (a.title || '').localeCompare(b.title || '', 'en', { sensitivity: 'base' });
      }
      return direction * (getArchivedTime(a) - getArchivedTime(b));
    });

    return filtered;
  }, [archivedAnnouncements, archivedSearch, archivedSortField, archivedSortDir, isAdmin]);

  const visibleArchivedAnnouncements =
    archivedListExpanded || sortedArchivedAnnouncements.length <= ARCHIVED_VISIBLE_LIMIT
      ? sortedArchivedAnnouncements
      : sortedArchivedAnnouncements.slice(0, ARCHIVED_VISIBLE_LIMIT);

  const toggleArchivedMessage = (announcementId) => {
    setArchivedExpandedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(announcementId)) {
        next.delete(announcementId);
      } else {
        next.add(announcementId);
      }
      return next;
    });
  };

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
  const acknowledgementModalAnnouncement = announcements.find(
    (row) => row.announcement_id === acknowledgementModalId
  );

  const isAnnouncementUnread = (announcement) => {
    if (isAdmin || !unreadTrackingReady || !lastViewedAnnouncementsAtRef.current) return false;
    const createdAt = new Date(announcement.created_at);
    return !Number.isNaN(createdAt.getTime()) && createdAt > lastViewedAnnouncementsAtRef.current;
  };

  const handleSubmitAnnouncement = async (event) => {
    event.preventDefault();
    
    if (!currentUser || !currentUser.admin_id) {
      setMessage({ type: 'error', text: 'User session not found. Please refresh and try again.' });
      return;
    }
    
    if (formData.audience_type === 'specific_personnel' && formData.target_personnel_ids.length === 0) {
      setPersonnelSelectionError('Please select at least one personnel recipient.');
      setMessage({ type: 'error', text: 'Please select at least one personnel recipient.' });
      return;
    }

    if (announcementWordCount > MAX_ANNOUNCEMENT_WORDS) {
      setMessage({
        type: 'error',
        text: `Announcement messages cannot exceed ${MAX_ANNOUNCEMENT_WORDS} words.`
      });
      return;
    }

    let acknowledgementDeadline = null;
    if (showAcknowledgementDeadline) {
      const deadlineDate = formData.acknowledgement_deadline_date;
      const deadlineTime = formData.acknowledgement_deadline_time;

      if ((deadlineDate && !deadlineTime) || (!deadlineDate && deadlineTime)) {
        setMessage({
          type: 'error',
          text: 'Please set both a date and a time for the acknowledgement deadline, or clear both.'
        });
        return;
      }

      if (deadlineDate && deadlineTime) {
        const parsedDeadline = new Date(
          `${deadlineDate}T${deadlineTime}${deadlineTime.length === 5 ? ':00' : ''}${ASIA_MANILA_OFFSET}`
        );
        if (Number.isNaN(parsedDeadline.getTime())) {
          setMessage({ type: 'error', text: 'The acknowledgement deadline is not a valid date and time.' });
          return;
        }
        if (parsedDeadline.getTime() <= Date.now()) {
          setMessage({ type: 'error', text: 'The acknowledgement deadline must be in the future.' });
          return;
        }
        acknowledgementDeadline = parsedDeadline.toISOString();
      }
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {
        title: formData.title,
        content: formData.content,
        audience_type: formData.audience_type,
        target_personnel_ids: formData.target_personnel_ids,
        acknowledgement_deadline: acknowledgementDeadline,
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
    if (!announcementId) return false;

    setAcknowledgingId(announcementId);
    setMessage({ type: '', text: '' });

    const { data, error } = await acknowledgeAnnouncement(effectiveUser, announcementId);
    if (error) {
      setMessage({ type: 'error', text: `Failed to acknowledge announcement: ${error}` });
      setAcknowledgingId('');
      return false;
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
    return true;
  };

  const openAckConfirm = (announcementId) => {
    if (!announcementId) return;
    setAckConfirmChecked(false);
    setAckConfirmId(announcementId);
  };

  const closeAckConfirm = () => {
    setAckConfirmId('');
    setAckConfirmChecked(false);
  };

  const handleConfirmAcknowledge = async () => {
    if (!ackConfirmId || !ackConfirmChecked) return;
    const succeeded = await handleAcknowledgeAnnouncement(ackConfirmId);
    if (succeeded) {
      closeAckConfirm();
    }
  };

  const handleArchiveAnnouncement = async () => {
    if (!archiveModalId) return;

    if (!isAdmin) {
      const targetAnnouncement = announcements.find((row) => row.announcement_id === archiveModalId);
      if (!targetAnnouncement?.acknowledged_by_current_user) {
        setMessage({ type: 'error', text: 'Please acknowledge this announcement before archiving it.' });
        setArchiveModalId('');
        return;
      }
    }

    setArchiving(true);
    const { error } = isAdmin
      ? await archiveAnnouncement(currentUser, archiveModalId)
      : await archivePersonnelAnnouncement(effectiveUser, archiveModalId);
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
    const { error } = isAdmin
      ? await restoreAnnouncement(currentUser, announcementId)
      : await restorePersonnelAnnouncement(effectiveUser, announcementId);
    setRestoringId('');

    if (error) {
      setMessage({ type: 'error', text: `Failed to restore announcement: ${error}` });
      return;
    }

    setArchivedAnnouncements((prev) => prev.filter((row) => row.announcement_id !== announcementId));
    setMessage({ type: 'success', text: 'Announcement restored.' });
    await loadAnnouncements();
  };

  const handleNudgePersonnel = async (personnelIds, targetAnnouncementId = acknowledgementModalId) => {
    const announcement = announcements.find(
      (row) => row.announcement_id === targetAnnouncementId
    );
    const currentTime = Date.now();
    const requestedIds = Array.from(new Set(personnelIds || []))
      .filter(Boolean)
      .filter((personnelId) => (nudgeCooldownUntilById.get(personnelId) || 0) <= currentTime);

    if (!announcement || requestedIds.length === 0) {
      setMessage({ type: 'error', text: 'Please wait 5 seconds before nudging again.' });
      return;
    }

    setNudgingIds((prev) => new Set([...prev, ...requestedIds]));
    setMessage({ type: '', text: '' });

    const { data, error } = await nudgeAnnouncementPersonnel(
      currentUser,
      announcement.announcement_id,
      announcement.title,
      requestedIds
    );

    setNudgingIds((prev) => {
      const next = new Set(prev);
      requestedIds.forEach((personnelId) => next.delete(personnelId));
      return next;
    });

    if (error) {
      setMessage({ type: 'error', text: `Unable to send reminder: ${error}` });
      return;
    }

    const sentIds = (data || []).map((row) => row.personnel_id);
    const cooldownUntil = Date.now() + 5000;
    setNudgeCooldownUntilById((prev) => {
      const next = new Map(prev);
      sentIds.forEach((personnelId) => next.set(personnelId, cooldownUntil));
      return next;
    });
    setMessage({
      type: 'success',
      text: `Reminder sent to ${sentIds.length} personnel.`
    });
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

            {isAnnouncementTab ? (
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
            ) : (
              <div className="landing-nav-toolbar" aria-label="Landing page section navigation">
                <button
                  type="button"
                  className={`landing-nav-toolbar-btn${landingActiveSection === 'content' ? ' is-active' : ''}`}
                  onClick={() => landingEditorRef.current?.scrollToSection('content')}
                >
                  Landing Page Content
                </button>
              </div>
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
              <div className="announcement-recipient-grid">
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
                    onChange={(event) => {
                      const nextAudience = event.target.value;
                      const keepsDeadline = nextAudience === 'all_personnel' || nextAudience === 'specific_personnel';
                      setFormData((prev) => ({
                        ...prev,
                        audience_type: nextAudience,
                        target_personnel_ids: nextAudience === 'specific_personnel' ? prev.target_personnel_ids : [],
                        acknowledgement_deadline_date: keepsDeadline ? prev.acknowledgement_deadline_date : '',
                        acknowledgement_deadline_time: keepsDeadline ? prev.acknowledgement_deadline_time : ''
                      }));
                      if (nextAudience !== 'specific_personnel') {
                        setPersonnelSelectionError('');
                      }
                    }}
                  >
                    {AUDIENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                {formData.audience_type === 'specific_personnel' && (
                  <div className="form-field announcement-personnel-picker-field">
                    <label htmlFor="targetPersonnel">Select Personnel <span className="required-asterisk">*</span></label>
                    <p className="form-help-text personnel-picker-subtitle">
                      Choose one or more personnel to receive this announcement.
                    </p>

                    <PersonnelPicker
                      id="targetPersonnel"
                      personnel={recipients}
                      selectedIds={formData.target_personnel_ids}
                      onChange={(nextIds) => {
                        setFormData((prev) => ({ ...prev, target_personnel_ids: nextIds }));
                        if (nextIds.length > 0) {
                          setPersonnelSelectionError('');
                        }
                      }}
                      error={personnelSelectionError}
                    />

                    {personnelSelectionError && (
                      <small className="form-help-text personnel-picker-error-text">
                        {personnelSelectionError}
                      </small>
                    )}

                    {recipients.length === 0 && (
                      <small className="form-help-text" style={{ color: '#dc2626' }}>
                        No active personnel available. Refresh page or contact admin.
                      </small>
                    )}
                  </div>
                )}

                {showAcknowledgementDeadline && (
                  <div className="form-field announcement-deadline-field">
                    <label htmlFor="announcementDeadlineDate">Acknowledgement Deadline (optional)</label>
                    <p className="form-help-text">
                      If set, personnel who have not acknowledged by this date and time are
                      automatically reminded every 30 minutes until they do. All deadline and
                      reminder times use Asia/Manila (PHT). Leave both blank for a normal
                      announcement.
                    </p>
                    <div className="announcement-deadline-inputs">
                      <input
                        id="announcementDeadlineDate"
                        type="date"
                        value={formData.acknowledgement_deadline_date}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, acknowledgement_deadline_date: event.target.value }))
                        }
                        aria-label="Acknowledgement deadline date"
                      />
                      <input
                        id="announcementDeadlineTime"
                        type="time"
                        value={formData.acknowledgement_deadline_time}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, acknowledgement_deadline_time: event.target.value }))
                        }
                        aria-label="Acknowledgement deadline time"
                      />
                      {(formData.acknowledgement_deadline_date || formData.acknowledgement_deadline_time) && (
                        <button
                          type="button"
                          className="announcement-deadline-clear"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              acknowledgement_deadline_date: '',
                              acknowledgement_deadline_time: ''
                            }))
                          }
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

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
            <LandingContentEditor
              embedded
              ref={landingEditorRef}
              onDirtyChange={setIsLandingDirty}
              onActiveSectionChange={setLandingActiveSection}
            />
          </div>
        ) : (
          <div className="announcement-card list-card">
          <div className="list-card-header">
            <h2>{isAdmin ? 'Sent Announcements' : 'Announcement Feed'}</h2>
            <div className="list-card-header-actions">
              {!isAdmin && (
                <button
                  type="button"
                  className={`archive-list-button${archivedOpen ? ' is-open' : ''}`}
                  onClick={toggleArchivedPanel}
                  aria-expanded={archivedOpen}
                  aria-controls="announcementArchiveList"
                >
                  <FiArchive aria-hidden="true" />
                  Archived Announcements
                  {archivedLoaded && (
                    <span className="archive-list-count">{archivedAnnouncements.length}</span>
                  )}
                </button>
              )}
              <span className="announcement-count">{filteredAnnouncements.length} item(s)</span>
            </div>
          </div>

          {loading ? (
            <div className="announcement-empty">Loading announcements...</div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="announcement-empty">No announcements found.</div>
          ) : (
            <>
            <div className="announcement-list">
              {paginatedAnnouncements.map((announcement) => (
                <article
                  key={announcement.announcement_id}
                  className={`announcement-item${isAnnouncementUnread(announcement) ? ' is-unread' : ''}`}
                >
                  <div className="announcement-item-header">
                    <span className="announcement-title-group">
                      {isAnnouncementUnread(announcement) && (
                        <span className="announcement-unread-dot" aria-label="New announcement" title="New announcement" />
                      )}
                      <h3
                        className={`announcement-title ${expandedIds.has(announcement.announcement_id) ? '' : 'clamped'}`}
                        ref={(element) => {
                          titleRefs.current[announcement.announcement_id] = element;
                        }}
                      >
                        {announcement.title}
                      </h3>
                    </span>
                    <span className="announcement-audience">{getAudienceLabel(announcement)}</span>
                  </div>
                  <span className="announcement-date">{formatDate(announcement.created_at)}</span>

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
                        <a
                          key={`${announcement.announcement_id}-att-${index}`}
                          className="announcement-attachment-chip"
                          href={attachment.file_url}
                          target="_blank"
                          rel="noreferrer"
                          title={attachment.file_name || (attachment.is_image ? 'Attached image' : 'Attachment')}
                        >
                          {attachment.is_image ? (
                            <img
                              className="announcement-attachment-chip-thumb"
                              src={attachment.file_url}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <FiFileText className="announcement-attachment-chip-icon" aria-hidden="true" />
                          )}
                          <span className="announcement-attachment-chip-name">
                            {attachment.file_name || (attachment.is_image ? 'Image' : 'Attachment')}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {!isAdmin &&
                    !announcement.acknowledged_by_current_user &&
                    announcement.latest_acknowledgement_nudge_at && (
                    <div className="announcement-nudge-notice" role="status">
                      <FiBell aria-hidden="true" />
                      <div>
                        <strong>Reminder from Admin</strong>
                        <span>{announcement.acknowledgement_nudge_message}</span>
                        <small>
                          Sent {formatDate(announcement.latest_acknowledgement_nudge_at)}
                          {announcement.acknowledgement_nudge_count > 1
                            ? ` | ${announcement.acknowledgement_nudge_count} reminders received`
                            : ''}
                        </small>
                      </div>
                    </div>
                  )}

                  <div className="announcement-card-footer">
                    {!isAdmin && (
                      <span className={`announcement-ack-status ${announcement.acknowledged_by_current_user ? 'acknowledged' : 'pending'}`}>
                        {announcement.acknowledged_by_current_user ? <FiCheckCircle aria-hidden="true" /> : <FiClock aria-hidden="true" />}
                        {announcement.acknowledged_by_current_user ? 'Acknowledged' : 'Pending acknowledgment'}
                      </span>
                    )}

                    <div className="announcement-actions">
                      {!isAdmin && !announcement.acknowledged_by_current_user && (
                        <button
                          type="button"
                          className="announcement-ack-button"
                          onClick={() => openAckConfirm(announcement.announcement_id)}
                          disabled={acknowledgingId === announcement.announcement_id}
                        >
                          {acknowledgingId === announcement.announcement_id ? 'Acknowledging...' : 'Acknowledge'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="announcement-archive-button"
                        onClick={() => setArchiveModalId(announcement.announcement_id)}
                        disabled={!isAdmin && !announcement.acknowledged_by_current_user}
                        title={
                          isAdmin || announcement.acknowledged_by_current_user
                            ? undefined
                            : 'Please acknowledge this announcement before archiving it.'
                        }
                      >
                        Archive
                      </button>
                    </div>
                  </div>

                  {isAdmin &&
                    announcement.acknowledgement_tracking?.length > 0 && (
                    <div className="announcement-tracking-wrap">
                      <AnnouncementNudgeTracking
                        announcement={announcement}
                        onOpenAcknowledgements={() => setAcknowledgementModalId(announcement.announcement_id)}
                        onNudge={(personnelIds) =>
                          handleNudgePersonnel(personnelIds, announcement.announcement_id)
                        }
                        nudgingIds={nudgingIds}
                        cooldownUntilById={nudgeCooldownUntilById}
                      />
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

      {(isAdmin ? isAnnouncementTab : true) && archivedOpen && (
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
                  {isAdmin ? 'Archive List' : 'Archived Announcements'}
                  {archivedLoaded ? ` (${archivedAnnouncements.length})` : ''}
                </h2>
              </div>
              <CloseButton
                className="archived-panel-close"
                onClick={toggleArchivedPanel}
                label="Close archive list"
              />
            </div>

            {!archivedLoading && archivedAnnouncements.length > 0 && (
              <div className="archived-toolbar">
                <label className="archived-search">
                  <FiSearch className="archived-search-icon" aria-hidden="true" />
                  <input
                    type="search"
                    value={archivedSearch}
                    onChange={(event) => setArchivedSearch(event.target.value)}
                    placeholder="Search archived announcements"
                    aria-label="Search archived announcements"
                  />
                </label>
                <div className="archived-sort">
                  <label>
                    <span>Sort by</span>
                    <select
                      value={archivedSortField}
                      onChange={(event) => setArchivedSortField(event.target.value)}
                      aria-label="Sort archived announcements by"
                    >
                      <option value="date">Date archived</option>
                      <option value="title">Title</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="archived-sort-dir"
                    onClick={() => setArchivedSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    aria-label={`Sort direction: ${archivedSortDir === 'asc' ? 'ascending' : 'descending'}`}
                    title={archivedSortDir === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    {archivedSortField === 'title'
                      ? (archivedSortDir === 'asc' ? 'A → Z' : 'Z → A')
                      : (archivedSortDir === 'asc' ? 'Oldest first' : 'Newest first')}
                  </button>
                </div>
              </div>
            )}

            <div className="archived-panel">
                {archivedLoading ? (
                  <div className="announcement-empty">Loading archived announcements...</div>
                ) : archivedAnnouncements.length === 0 ? (
                  <div className="announcement-empty">No archived announcements.</div>
                ) : sortedArchivedAnnouncements.length === 0 ? (
                  <div className="announcement-empty">No archived announcements match your search.</div>
                ) : (
                  <>
                  {visibleArchivedAnnouncements.map((announcement) => {
                    const messageText = announcement.content || '';
                    const isLongMessage = messageText.length > ARCHIVED_PREVIEW_LENGTH;
                    const isMessageExpanded = archivedExpandedMsgIds.has(announcement.announcement_id);
                    const displayedMessage = isLongMessage && !isMessageExpanded
                      ? `${messageText.slice(0, ARCHIVED_PREVIEW_LENGTH).trimEnd()}…`
                      : messageText;
                    return (
                    <article key={announcement.announcement_id} className="archived-item">
                      <div className="announcement-item-header">
                        <h3>{announcement.title}</h3>
                        <span className="announcement-audience">{getAudienceLabel(announcement)}</span>
                      </div>
                      <p className="announcement-content">{displayedMessage}</p>
                      {isLongMessage && (
                        <button
                          type="button"
                          className="announcement-toggle-button"
                          onClick={() => toggleArchivedMessage(announcement.announcement_id)}
                        >
                          {isMessageExpanded ? 'See less' : 'See more'}
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
                        {isAdmin ? (
                          <span>
                            Archived {formatDate(announcement.archived_at)}
                            {announcement.archived_by_name ? ` by ${announcement.archived_by_name}` : ''}
                          </span>
                        ) : (
                          <>
                            <span className={`announcement-ack-status ${announcement.acknowledged_by_current_user ? 'acknowledged' : 'pending'}`}>
                              {announcement.acknowledged_by_current_user ? 'Acknowledged' : 'Pending acknowledgment'}
                            </span>
                            <span>Posted {formatDate(announcement.created_at)}</span>
                            <span>Archived {formatDate(announcement.personnel_archived_at)}</span>
                          </>
                        )}
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
                    );
                  })}
                  {sortedArchivedAnnouncements.length > ARCHIVED_VISIBLE_LIMIT && (
                    <button
                      type="button"
                      className="archived-show-more"
                      onClick={() => setArchivedListExpanded((prev) => !prev)}
                    >
                      {archivedListExpanded
                        ? 'Show less'
                        : `Show ${sortedArchivedAnnouncements.length - ARCHIVED_VISIBLE_LIMIT} more`}
                    </button>
                  )}
                  </>
                )}
            </div>
          </section>
        </div>
      )}

      {archiveModalId && (
        <div className="announcement-confirm-modal-overlay">
          <div className="announcement-confirm-modal-card">
            <h3>Archive this announcement?</h3>
            <p>You can restore it later from Archived Announcements.</p>
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

      {ackConfirmId && (
        <div
          className="announcement-confirm-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && acknowledgingId !== ackConfirmId) {
              closeAckConfirm();
            }
          }}
        >
          <div
            className="announcement-confirm-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="acknowledgeConfirmTitle"
          >
            <h3 id="acknowledgeConfirmTitle">Acknowledge this announcement?</h3>
            <p>Please confirm that you have read this announcement before acknowledging it.</p>
            <label className="announcement-confirm-modal-checkbox">
              <input
                type="checkbox"
                checked={ackConfirmChecked}
                onChange={(event) => setAckConfirmChecked(event.target.checked)}
                disabled={acknowledgingId === ackConfirmId}
              />
              <span>I&rsquo;m sure that I read the announcement.</span>
            </label>
            <div className="announcement-confirm-modal-actions">
              <button
                type="button"
                className="announcement-confirm-modal-cancel"
                onClick={closeAckConfirm}
                disabled={acknowledgingId === ackConfirmId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="announcement-confirm-modal-confirm announcement-confirm-modal-confirm--ack"
                onClick={handleConfirmAcknowledge}
                disabled={!ackConfirmChecked || acknowledgingId === ackConfirmId}
              >
                {acknowledgingId === ackConfirmId ? 'Acknowledging...' : 'Acknowledge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && acknowledgementModalAnnouncement && (
        <AnnouncementAcknowledgementModal
          announcement={acknowledgementModalAnnouncement}
          onClose={() => setAcknowledgementModalId('')}
          onNudge={handleNudgePersonnel}
          nudgingIds={nudgingIds}
          cooldownUntilById={nudgeCooldownUntilById}
        />
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
