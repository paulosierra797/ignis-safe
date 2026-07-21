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
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

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

  useEffect(() => {
    if (!selectedAnnouncement) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setSelectedAnnouncement(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [selectedAnnouncement]);

  const totalPages = Math.max(1, Math.ceil(announcements.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

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
  (safeCurrentPage - 1) * itemsPerPage,
  (safeCurrentPage - 1) * itemsPerPage + itemsPerPage
).map((announcement) => (
              <article key={announcement.announcement_id} className="landing-announcement-card">
                <span className="landing-announcement-tag">Public</span>
                <h3>{announcement.title}</h3>
                <p className="landing-announcement-content">{announcement.content}</p>
                {Array.isArray(announcement.attachments) && announcement.attachments.length > 0 && (
                  <div className="landing-announcement-attachments">
                    {announcement.attachments.map((attachment, index) => (
                      attachment.is_image ? (
                        <button
                          type="button"
                          key={`${announcement.announcement_id}-img-${index}`}
                          className="landing-announcement-image-link"
                          onClick={() => setSelectedAnnouncement(announcement)}
                          aria-label={`Expand ${announcement.title}`}
                        >
                          <img src={attachment.file_url} alt={attachment.file_name || 'Attached image'} loading="lazy" />
                        </button>
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
                <button
                  type="button"
                  className="landing-announcement-expand-button"
                  onClick={() => setSelectedAnnouncement(announcement)}
                >
                  View full announcement
                  <span aria-hidden="true">↗</span>
                </button>
                <div className="landing-announcement-meta">
                  <span>BFP Dasmariñas City Fire Station</span>
                  <span>{formatDate(announcement.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="landing-announcement-pagination">
              <button
                className="landing-pagination-button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                aria-label="Previous page"
              >
                &larr;
              </button>
              <span className="landing-pagination-info">Page {safeCurrentPage} of {totalPages}</span>
              <button
                className="landing-pagination-button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                aria-label="Next page"
              >
                &rarr;
              </button>
            </div>
          )}
          </>
        )}
      </div>

      {selectedAnnouncement && (
        <div
          className="landing-announcement-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedAnnouncement(null);
          }}
        >
          <article
            className="landing-announcement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`landing-announcement-modal-title-${selectedAnnouncement.announcement_id}`}
          >
            <div className="landing-announcement-modal-header">
              <span className="landing-announcement-tag">Public notice</span>
              <button
                type="button"
                className="landing-announcement-modal-close"
                onClick={() => setSelectedAnnouncement(null)}
                aria-label="Close announcement"
              >
                ×
              </button>
            </div>

            <h2 id={`landing-announcement-modal-title-${selectedAnnouncement.announcement_id}`}>
              {selectedAnnouncement.title}
            </h2>
            <p className="landing-announcement-modal-content">{selectedAnnouncement.content}</p>

            {Array.isArray(selectedAnnouncement.attachments) && selectedAnnouncement.attachments.length > 0 && (
              <div className="landing-announcement-modal-attachments">
                {selectedAnnouncement.attachments.map((attachment, index) => (
                  attachment.is_image ? (
                    <a
                      key={`${selectedAnnouncement.announcement_id}-modal-img-${index}`}
                      href={attachment.file_url}
                      className="landing-announcement-modal-image"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img src={attachment.file_url} alt={attachment.file_name || 'Attached image'} />
                      <span>{attachment.file_name || 'Open original image'}</span>
                    </a>
                  ) : (
                    <a
                      key={`${selectedAnnouncement.announcement_id}-modal-file-${index}`}
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

            <div className="landing-announcement-modal-meta">
              <span>BFP Dasmariñas City Fire Station</span>
              <span>{formatDate(selectedAnnouncement.created_at)}</span>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
