import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import LandingContentEditor from './LandingContentEditor';
import PersonnelPicker from './PersonnelPicker';
import './AppDialog.css';
import { useUser } from '../context/UserContext';
import {
  createAnnouncement,
  getAnnouncementsForUser,
  getAudienceLabel,
  getPersonnelRecipients
} from '../utils/announcementsService';
import { logAdminActivity } from '../utils/usersService';
import './ContentManagement.css';

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

export default function ContentManagement() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('announcements');
  const [announcements, setAnnouncements] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    audience_type: 'public',
    target_personnel_ids: []
  });

  const landingEditorRef = useRef(null);
  const bypassNavigationRef = useRef(false);
  const [isLandingDirty, setIsLandingDirty] = useState(false);
  const [isLandingSaving, setIsLandingSaving] = useState(false);
  const [pendingTab, setPendingTab] = useState('');
  const [pendingManualNavigation, setPendingManualNavigation] = useState(null);

  const sidebarVariant = 'admin';

  const shouldBlockNavigation = useCallback(({ currentLocation, nextLocation }) => {
    if (bypassNavigationRef.current) {
      bypassNavigationRef.current = false;
      return false;
    }

    const currentPath = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextPath = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return activeTab === 'landing' && isLandingDirty && currentPath !== nextPath;
  }, [activeTab, isLandingDirty]);
  const blocker = useBlocker(shouldBlockNavigation);
  const hasPendingExit = Boolean(pendingTab || pendingManualNavigation || blocker.state === 'blocked');

  useEffect(() => {
    if (!isLandingDirty) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isLandingDirty]);

  const requestTabChange = (nextTab) => {
    if (nextTab === activeTab) return;

    if (activeTab === 'landing' && isLandingDirty) {
      if (hasPendingExit) return;
      setPendingTab(nextTab);
      return;
    }

    setActiveTab(nextTab);
  };

  const handleHeaderNavigationRequest = (navigation) => {
    if (!(activeTab === 'landing' && isLandingDirty)) {
      navigation.action();
      return;
    }

    if (hasPendingExit) return;
    setPendingManualNavigation(navigation);
  };

  const runManualNavigation = (navigation) => {
    bypassNavigationRef.current = true;

    try {
      const navigationResult = navigation.action();
      Promise.resolve(navigationResult).finally(() => {
        bypassNavigationRef.current = false;
      });
    } catch (navigationError) {
      bypassNavigationRef.current = false;
      throw navigationError;
    }
  };

  const resumePendingExit = () => {
    const manualNavigation = pendingManualNavigation;
    const nextTab = pendingTab;
    setPendingManualNavigation(null);
    setPendingTab('');

    if (nextTab) {
      if (blocker.state === 'blocked') blocker.reset();
      setActiveTab(nextTab);
      return;
    }

    if (manualNavigation) {
      if (blocker.state === 'blocked') blocker.reset();
      runManualNavigation(manualNavigation);
      return;
    }

    if (blocker.state === 'blocked') blocker.proceed();
  };

  const handleCancelExit = () => {
    if (isLandingSaving) return;
    setPendingManualNavigation(null);
    setPendingTab('');
    if (blocker.state === 'blocked') blocker.reset();
  };

  const handleLeaveWithoutSaving = () => {
    if (isLandingSaving) return;
    landingEditorRef.current?.discardUnsavedChanges();
    setIsLandingDirty(false);
    resumePendingExit();
  };

  const handleSaveAndContinue = async () => {
    if (isLandingSaving) return;
    setIsLandingSaving(true);
    try {
      const saved = await landingEditorRef.current?.saveChanges();
      setIsLandingSaving(false);
      if (saved) resumePendingExit();
    } catch {
      setIsLandingSaving(false);
    }
  };

  const loadAnnouncements = useCallback(async () => {
    const { data, error } = await getAnnouncementsForUser(currentUser);
    if (error) {
      setMessage({ type: 'error', text: `Failed to load announcements: ${error}` });
      setAnnouncements([]);
      return;
    }

    setAnnouncements(data || []);
  }, [currentUser]);

  const loadRecipients = async () => {
    const { data, error } = await getPersonnelRecipients();
    if (error) {
      console.warn('Failed to load recipients:', error);
      setRecipients([]);
      return;
    }

    setRecipients(data || []);
  };

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });

      await Promise.all([loadAnnouncements(), loadRecipients()]);

      setLoading(false);
    };

    if (currentUser?.admin_id) {
      initialize();
    }
  }, [currentUser, loadAnnouncements]);

  const filteredAnnouncements = useMemo(() => {
    if (!searchQuery.trim()) {
      return announcements;
    }

    const query = searchQuery.toLowerCase();
    return announcements.filter((announcement) => {
      const titleMatch = (announcement.title || '').toLowerCase().includes(query);
      const contentMatch = (announcement.content || '').toLowerCase().includes(query);
      const authorMatch = (announcement.created_by_name || '').toLowerCase().includes(query);
      return titleMatch || contentMatch || authorMatch;
    });
  }, [announcements, searchQuery]);

  const handleSubmitAnnouncement = async (event) => {
    event.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      setMessage({ type: 'error', text: 'Title and message are required.' });
      return;
    }

    if (formData.audience_type === 'specific_personnel' && formData.target_personnel_ids.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one personnel recipient.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    const { data, error } = await createAnnouncement(currentUser, {
      ...formData,
      attachments: attachmentFiles
    });

    if (error) {
      setMessage({ type: 'error', text: `Failed to create announcement: ${error}` });
      setSubmitting(false);
      return;
    }

    await logAdminActivity({
      actorId: currentUser?.admin_id,
      actorName: currentUser?.name || 'Admin User',
      action: 'Announcement Created',
      actionType: 'create',
      details: `Created announcement titled "${formData.title}" for audience: ${formData.audience_type}`,
      metadata: {
        page: 'content-management',
        announcement_id: data?.announcement_id
      }
    });

    setFormData({
      title: '',
      content: '',
      audience_type: 'public',
      target_personnel_ids: []
    });
    setAttachmentFiles([]);
    setMessage({ type: 'success', text: 'Announcement sent successfully!' });
    setSubmitting(false);

    await loadAnnouncements();
  };

  const handleAttachmentChange = (event) => {
    const files = Array.from(event.target.files || []);
    const rejectedNames = [];
    const validFiles = [];

    files.forEach((file) => {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        rejectedNames.push(`${file.name} (unsupported type)`);
        return;
      }

      if (file.size > MAX_ATTACHMENT_SIZE) {
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

  return (
    <div className="content-management-container">
      <Sidebar variant={sidebarVariant} />

      <div className="content-management-main">
        <PageHeader
          title="Content Management"
          searchQuery={activeTab === 'announcements' ? searchQuery : ''}
          onSearchChange={activeTab === 'announcements' ? setSearchQuery : () => {}}
          variant={sidebarVariant}
          showSearch={activeTab === 'announcements'}
          onNavigationRequest={handleHeaderNavigationRequest}
        />

        <div className="content-tabs" role="tablist" aria-label="Content management tabs">
          <button
            type="button"
            className={`content-tab ${activeTab === 'announcements' ? 'active' : ''}`}
            onClick={() => requestTabChange('announcements')}
            role="tab"
            aria-selected={activeTab === 'announcements'}
          >
            Announcements
          </button>
          <button
            type="button"
            className={`content-tab ${activeTab === 'landing' ? 'active' : ''}`}
            onClick={() => requestTabChange('landing')}
            role="tab"
            aria-selected={activeTab === 'landing'}
          >
            Landing Page
            {activeTab === 'landing' && isLandingDirty && (
              <span className="content-tab-unsaved-dot" aria-hidden="true" />
            )}
          </button>
        </div>

        {message.text && (
          <div className={`announcement-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {activeTab === 'announcements' && (
          <>
            <div className="announcement-card composer-card">
              <h2>Create Announcement</h2>
              <form className="announcement-form" onSubmit={handleSubmitAnnouncement}>
                <div className="announcement-form-grid">
                  <div className="form-field">
                    <label htmlFor="announcementTitle">Title</label>
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
                    <label htmlFor="announcementAudience">Audience</label>
                    <select
                      id="announcementAudience"
                      value={formData.audience_type}
                      onChange={(event) => setFormData((prev) => ({
                        ...prev,
                        audience_type: event.target.value,
                        target_personnel_ids: event.target.value === 'specific_personnel' ? prev.target_personnel_ids : []
                      }))}
                    >
                      {AUDIENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  {formData.audience_type === 'specific_personnel' && (
                    <div className="personnel-picker-section">
                      <PersonnelPicker
                        id="contentAnnouncementPersonnel"
                        personnel={recipients}
                        selectedIds={formData.target_personnel_ids}
                        onChange={(nextIds) => setFormData((prev) => ({
                          ...prev,
                          target_personnel_ids: nextIds
                        }))}
                      />
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="announcementContent">Message</label>
                    <textarea
                      id="announcementContent"
                      value={formData.content}
                      onChange={(event) => setFormData((prev) => ({ ...prev, content: event.target.value }))}
                      placeholder="Write the full announcement..."
                      rows={5}
                      maxLength={2000}
                      required
                    />
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
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" disabled={submitting}>
                    {submitting ? 'Sending...' : 'Send Announcement'}
                  </button>
                </div>
              </form>
            </div>

            <div className="announcement-card list-card">
              <div className="list-card-header">
                <h2>Sent Announcements</h2>
                <span className="announcement-count">{filteredAnnouncements.length} item(s)</span>
              </div>

              {loading ? (
                <div className="announcement-empty">Loading announcements...</div>
              ) : filteredAnnouncements.length === 0 ? (
                <div className="announcement-empty">No announcements found.</div>
              ) : (
                <div className="announcement-list">
                  {filteredAnnouncements.map((announcement) => (
                    <article key={announcement.announcement_id} className="announcement-item">
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
                        <span>By: {announcement.created_by_name}</span>
                        {announcement.acknowledgement_summary?.totalRecipients > 0 && (
                          <span>
                            Acknowledged: {announcement.acknowledgement_summary.acknowledgedCount}/
                            {announcement.acknowledgement_summary.totalRecipients}
                          </span>
                        )}
                        <span>{formatDate(announcement.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'landing' && (
          <div className="announcement-card landing-editor-card">
            <LandingContentEditor embedded ref={landingEditorRef} onDirtyChange={setIsLandingDirty} />
          </div>
        )}
      </div>

      {hasPendingExit && (
        <div
          className="content-unsaved-overlay app-unsaved-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="content-unsaved-title"
          aria-describedby="content-unsaved-description"
        >
          <div className="content-unsaved-modal app-unsaved-dialog">
            <div className="content-unsaved-icon app-unsaved-icon" aria-hidden="true">!</div>
            <h3 id="content-unsaved-title" className="content-unsaved-title app-unsaved-title">
              Unsaved Landing Page Changes
            </h3>
            <p id="content-unsaved-description" className="content-unsaved-message app-unsaved-message">
              You have unsaved changes in the Landing Page editor. What would you like to do before leaving?
            </p>
            <div className="content-unsaved-actions app-unsaved-actions">
              <button
                type="button"
                className="content-unsaved-btn content-unsaved-btn-save app-unsaved-button app-unsaved-button--save"
                onClick={handleSaveAndContinue}
                disabled={isLandingSaving}
              >
                {isLandingSaving ? 'Saving...' : 'Save Draft and Continue'}
              </button>
              <button
                type="button"
                className="content-unsaved-btn content-unsaved-btn-leave app-unsaved-button app-unsaved-button--discard"
                onClick={handleLeaveWithoutSaving}
                disabled={isLandingSaving}
              >
                Leave Without Saving
              </button>
              <button
                type="button"
                className="content-unsaved-btn content-unsaved-btn-cancel app-unsaved-button app-unsaved-button--cancel"
                onClick={handleCancelExit}
                disabled={isLandingSaving}
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