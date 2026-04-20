import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
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
  const [announcements, setAnnouncements] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    audience_type: 'public',
    target_personnel_id: ''
  });

  const role = String(currentUser?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const sidebarVariant = role === 'personnel' ? 'personnel' : role === 'intel-unit' ? 'intel-unit' : 'admin';

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
    setSubmitting(true);
    setMessage({ type: '', text: '' });

    const payload = {
      title: formData.title,
      content: formData.content,
      audience_type: formData.audience_type,
      target_personnel_id: formData.target_personnel_id || null
    };

    const { error } = await createAnnouncement(currentUser, payload);
    if (error) {
      setMessage({ type: 'error', text: error });
      setSubmitting(false);
      return;
    }

    setFormData({
      title: '',
      content: '',
      audience_type: 'public',
      target_personnel_id: ''
    });
    setMessage({ type: 'success', text: 'Announcement sent successfully.' });
    await loadAnnouncements();
    setSubmitting(false);
  };

  return (
    <div className="announcements-container">
      <Sidebar variant={sidebarVariant} />

      <div className="announcements-main">
        <PageHeader
          title="Announcements"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant={sidebarVariant}
        />

        {message.text && (
          <div className={`announcement-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {isAdmin && (
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
                      required
                    >
                      <option value="">Choose personnel</option>
                      {recipients.map((person) => (
                        <option key={person.admin_id} value={person.admin_id}>
                          {person.name} ({person.status})
                        </option>
                      ))}
                    </select>
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

              <div className="form-actions">
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Announcement'}
                </button>
              </div>
            </form>
          </div>
        )}

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
                  <div className="announcement-meta">
                    <span>By: {announcement.created_by_name}</span>
                    <span>{formatDate(announcement.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
