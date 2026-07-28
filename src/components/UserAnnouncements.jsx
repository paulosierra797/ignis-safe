import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useUser } from '../context/UserContext';
import {
  getAnnouncementsForUser,
  acknowledgeAnnouncement,
  getAudienceLabel
} from '../utils/announcementsService';
import './UserAnnouncements.css';

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

export default function UserAnnouncements() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acknowledgingId, setAcknowledgingId] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const role = String(currentUser?.role || '').toLowerCase();
  const sidebarVariant = role === 'personnel' ? 'personnel' : 'admin';

  const loadAnnouncements = useCallback(async () => {
    const { data, error } = await getAnnouncementsForUser(currentUser);
    if (error) {
      setMessage({ type: 'error', text: `Failed to load announcements: ${error}` });
      setAnnouncements([]);
      return;
    }

    setAnnouncements(data || []);
  }, [currentUser]);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });
      await loadAnnouncements();
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

  const handleAcknowledgeAnnouncement = async (announcementId, announcementTitle) => {
    if (!announcementId) return;

    setAcknowledgingId(announcementId);
    setMessage({ type: '', text: '' });

    const { data, error } = await acknowledgeAnnouncement(currentUser, announcementId, announcementTitle);
    if (error) {
      console.error('Failed to acknowledge announcement:', error);
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

  return (
    <div className="user-announcements-container">
      <Sidebar variant={sidebarVariant} />

      <div className="user-announcements-main">
        <PageHeader
          title="Announcements"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant={sidebarVariant}
          showSearch={true}
          compact={true}
        />

        {message.text && (
          <div className={`announcement-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="announcement-card list-card">
          <div className="list-card-header">
            <h2>Announcement Feed</h2>
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
                    <span className={`announcement-ack-status ${announcement.acknowledged_by_current_user ? 'acknowledged' : 'pending'}`}>
                      {announcement.acknowledged_by_current_user ? 'Acknowledged' : 'Pending acknowledgment'}
                    </span>
                    <span>{formatDate(announcement.created_at)}</span>
                  </div>

                  {!announcement.acknowledged_by_current_user && (
                    <div className="announcement-ack-action">
                      <button
                        type="button"
                        onClick={() => handleAcknowledgeAnnouncement(announcement.announcement_id, announcement.title)}
                        disabled={acknowledgingId === announcement.announcement_id}
                      >
                        {acknowledgingId === announcement.announcement_id ? 'Acknowledging...' : 'Acknowledge'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
