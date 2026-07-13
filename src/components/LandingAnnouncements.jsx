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
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 3;

  const getItemsPerPage = () => {
  if (window.innerWidth < 768) return 1;
  if (window.innerWidth < 1100) return 2;
  return 3;
};

const [itemsPerPage, setItemsPerPage] = useState(getItemsPerPage());

  useEffect(() => {
    const loadAnnouncements = async () => {
      setLoading(true);
      const { data } = await getPublicAnnouncements();
      setAnnouncements(data || []);
      setLoading(false);
    };

    loadAnnouncements();
  }, []);
  useEffect(() => {
  const handleResize = () => {
    setItemsPerPage(getItemsPerPage());
  };

  window.addEventListener("resize", handleResize);

  return () => window.removeEventListener("resize", handleResize);
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
          <>
          <div className="landing-announcements-grid">
            {announcements.slice(
  (currentPage - 1) * itemsPerPage,
  (currentPage - 1) * itemsPerPage + itemsPerPage
).map((announcement) => (
              <article key={announcement.announcement_id} className="landing-announcement-card">
                <span className="landing-announcement-tag">Public</span>
                <h3>{announcement.title}</h3>
                <p>{announcement.content}</p>
                {Array.isArray(announcement.attachments) && announcement.attachments.length > 0 && (
                  <div className="landing-announcement-attachments">
                    {announcement.attachments.map((attachment, index) => (
                      attachment.is_image ? (
                        <a
                          key={`${announcement.announcement_id}-img-${index}`}
                          href={attachment.file_url}
                          className="landing-announcement-image-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img src={attachment.file_url} alt={attachment.file_name || 'Attached image'} loading="lazy" />
                        </a>
                      ) : (
                        <a
                          key={`${announcement.announcement_id}-file-${index}`}
                          href={attachment.file_url}
                          className="landing-announcement-file-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {attachment.file_name || 'Attachment'}
                        </a>
                      )
                    ))}
                  </div>
                )}
                <div className="landing-announcement-meta">
                  <span>BFP Dasmariñas City Fire Station</span>
                  <span>{formatDate(announcement.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
          {Math.ceil(announcements.length / itemsPerPage) > 1 && (
            <div className="landing-announcement-pagination">
              <button
                className="pagination-button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                ◀
              </button>
              <span className="pagination-info">Page {currentPage} of {Math.ceil(announcements.length /itemsPerPage)}</span>
              <button
                className="pagination-button"
                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(announcements.length / itemsPerPage), p + 1))}
                disabled={currentPage === Math.ceil(announcements.length / itemsPerPage)}
                aria-label="Next page"
              >
                ▶
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </section>
  );
}
