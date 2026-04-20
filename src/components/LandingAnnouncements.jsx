import React, { useEffect, useState } from 'react';
import { getPublicAnnouncements } from '../utils/announcementsService';
import './LandingAnnouncements.css';

const formatDate = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export default function LandingAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAnnouncements = async () => {
      setLoading(true);
      const { data } = await getPublicAnnouncements();
      setAnnouncements(data || []);
      setLoading(false);
    };

    loadAnnouncements();
  }, []);

  return (
    <section className="landing-announcements" id="announcements">
      <div className="landing-announcements-container">
        <div className="landing-announcements-header">
          <div>
            <p className="landing-announcements-eyebrow">PUBLIC NOTICE</p>
            <h2>Latest announcements</h2>
          </div>
          <p className="landing-announcements-note">
            Official updates posted for the public audience on the landing page.
          </p>
        </div>

        {loading ? (
          <div className="landing-announcements-empty">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div className="landing-announcements-empty">No public announcements yet.</div>
        ) : (
          <div className="landing-announcements-grid">
            {announcements.map((announcement) => (
              <article key={announcement.announcement_id} className="landing-announcement-card">
                <span className="landing-announcement-tag">Public</span>
                <h3>{announcement.title}</h3>
                <p>{announcement.content}</p>
                <div className="landing-announcement-meta">
                  <span>BFP Dasmariñas City Fire Station</span>
                  <span>{formatDate(announcement.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
