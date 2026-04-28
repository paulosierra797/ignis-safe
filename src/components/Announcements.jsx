import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import LandingContentEditor from './LandingContentEditor';
import { useUser } from '../context/UserContext';
import {
  createAnnouncement,
  getAnnouncementsForUser,
  getAudienceLabel,
  getPersonnelRecipients
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
    target_personnel_id: ''
  });

  const role = String(currentUser?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const sidebarVariant = role === 'personnel' ? 'personnel' : role === 'intel-unit' ? 'intel-unit' : 'admin';
  const isAnnouncementTab = !isAdmin || activeTab === 'announcements';

  const loadAnnouncements = async () => {
    const { data, error } = await getAnnouncementsForUser(currentUser);
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
  }, [isAdmin, currentUser?.admin_id]);

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

      setFormData({
        title: '',
        content: '',
        audience_type: 'public',
        target_personnel_id: ''
      });
      setAttachmentFiles([]);
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
        />

        {isAdmin && (
          <div className="content-tabs" role="tablist" aria-label="Content management tabs">
            <button
              type="button"
              className={`content-tab ${activeTab === 'announcements' ? 'active' : ''}`}
              onClick={() => setActiveTab('announcements')}
              role="tab"
              aria-selected={activeTab === 'announcements'}
            >
              Announcements
            </button>
            <button
              type="button"
              className={`content-tab ${activeTab === 'landing' ? 'active' : ''}`}
              onClick={() => setActiveTab('landing')}
              role="tab"
              aria-selected={activeTab === 'landing'}
            >
              Landing Page
            </button>
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
                  <div className="form-field">
                    <label htmlFor="targetPersonnel">Select Personnel</label>
                    <select
                      id="targetPersonnel"
                      value={formData.target_personnel_id}
                      onChange={(event) => setFormData((prev) => ({ ...prev, target_personnel_id: event.target.value }))}
                    >
                      <option value="">Choose personnel</option>
                      {recipients.map((person) => (
                        <option key={person.admin_id} value={person.admin_id}>
                          {person.name} ({person.status})
                        </option>
                      ))}
                    </select>
                    {recipients.length === 0 && (
                      <small className="form-help-text" style={{ color: '#dc2626' }}>
                        No active personnel available. Refresh page or contact admin.
                      </small>
                    )}
                  </div>
                </div>
              )}

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
        )}

        {isAdmin && activeTab === 'landing' ? (
          <div className="announcement-card landing-editor-card">
            <LandingContentEditor embedded />
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
                    <span>{formatDate(announcement.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}
