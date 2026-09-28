import Pagination from './Pagination';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CloseButton from './CloseButton';
import './LandingAnnouncements.css';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy, normalizeDasmarinasText } from '../utils/landingLanguage';
import { getPublicAnnouncements } from '../utils/publicContentService';

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
  const { content, language } = useLandingContent();
  const copy = { ...getLandingUiCopy(language), ...(content.copy?.[language] || {}) };
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const modalRef = useRef(null);
  const modalOriginRef = useRef(null);

  const itemsPerPage = 10;

  const openAnnouncement = (announcement, trigger) => {
    modalOriginRef.current = trigger?.getBoundingClientRect?.() || null;
    setSelectedAnnouncement(announcement);
  };

  const handleCardClick = (event, announcement) => {
    if (event.target.closest('a')) return;
    openAnnouncement(announcement, event.currentTarget);
  };

  const handleCardKeyDown = (event, announcement) => {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openAnnouncement(announcement, event.currentTarget);
  };

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
    if (!selectedAnnouncement) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => modalRef.current?.focus());
    const handleEscape = (event) => {
      if (event.key === 'Escape') setSelectedAnnouncement(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
      previouslyFocused?.focus?.();
    };
  }, [selectedAnnouncement]);

  useLayoutEffect(() => {
    const modal = modalRef.current;
    const origin = modalOriginRef.current;
    if (!selectedAnnouncement || !modal || !origin) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const target = modal.getBoundingClientRect();
    const originCenterX = origin.left + origin.width / 2;
    const originCenterY = origin.top + origin.height / 2;
    const targetCenterX = target.left + target.width / 2;
    const targetCenterY = target.top + target.height / 2;
    const scaleX = Math.max(0.12, Math.min(1, origin.width / target.width));
    const scaleY = Math.max(0.12, Math.min(1, origin.height / target.height));

    const animation = modal.animate([
      {
        opacity: 0.35,
        transform: `translate(${originCenterX - targetCenterX}px, ${originCenterY - targetCenterY}px) scale(${scaleX}, ${scaleY})`,
      },
      { opacity: 1, transform: 'translate(0, 0) scale(1, 1)' },
    ], {
      duration: 360,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both',
    });

    return () => animation.cancel();
  }, [selectedAnnouncement]);

  const totalPages = Math.max(1, Math.ceil(announcements.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  return (
    <section className="landing-announcements" id="announcements">
      <div className="landing-announcements-container">
        <div className="landing-announcements-header">
          <div>
            <p className="landing-announcements-eyebrow" data-landing-edit-path={`copy.${language}.publicNotice`} data-landing-edit-label="Announcements section eyebrow">{copy.publicNotice}</p>
            <h2 data-landing-edit-path={`copy.${language}.latestAnnouncements`} data-landing-edit-label="Announcements section title">{copy.latestAnnouncements}</h2>
          </div>
          <p className="landing-announcements-note" data-landing-edit-path={`copy.${language}.announcementNote`} data-landing-edit-label="Announcements section description" data-landing-edit-multiline="true">
            {copy.announcementNote}
          </p>
        </div>

        {loading ? (
          <div className="landing-announcements-empty">{copy.loadingAnnouncements}</div>
        ) : announcements.length === 0 ? (
          <div className="landing-announcements-empty">{copy.noAnnouncements}</div>
        ) : (
          <>
          <div className="landing-announcements-grid">
            {announcements.slice(
  (safeCurrentPage - 1) * itemsPerPage,
  (safeCurrentPage - 1) * itemsPerPage + itemsPerPage
).map((announcement) => (
              <article
                key={announcement.announcement_id}
                className="landing-announcement-card"
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                aria-label={`${copy.viewFullAnnouncement}: ${normalizeDasmarinasText(announcement.title)}`}
                onClick={(event) => handleCardClick(event, announcement)}
                onKeyDown={(event) => handleCardKeyDown(event, announcement)}
              >
                <span className="landing-announcement-tag">{copy.publicLabel}</span>
                <h3>{normalizeDasmarinasText(announcement.title)}</h3>
                <div className="landing-announcement-message">
                  <p className="landing-announcement-content is-clamped">
                    {normalizeDasmarinasText(announcement.content)}
                  </p>
                </div>
                {Array.isArray(announcement.attachments) && announcement.attachments.length > 0 && (
                  <div className="landing-announcement-attachments">
                    {announcement.attachments.map((attachment, index) => (
                      attachment.is_image ? (
                        <div
                          key={`${announcement.announcement_id}-img-${index}`}
                          className="landing-announcement-image-link"
                        >
                          <img src={attachment.file_url} alt={normalizeDasmarinasText(attachment.file_name || 'Attached image')} loading="lazy" />
                        </div>
                      ) : (
                        <a
                          key={`${announcement.announcement_id}-file-${index}`}
                          href={attachment.file_url}
                          className="landing-announcement-file-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {normalizeDasmarinasText(attachment.file_name || 'Attachment')}
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
          <Pagination page={safeCurrentPage} totalItems={announcements.length} onPageChange={setCurrentPage} label="Public announcement pages" />
          </>
        )}
      </div>

      {selectedAnnouncement && createPortal((
        <div
          className="landing-announcement-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedAnnouncement(null);
          }}
        >
          <article
            ref={modalRef}
            className="landing-announcement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`landing-announcement-modal-title-${selectedAnnouncement.announcement_id}`}
            aria-describedby={`landing-announcement-modal-content-${selectedAnnouncement.announcement_id}`}
            tabIndex={-1}
          >
            <div className="landing-announcement-modal-header">
              <span className="landing-announcement-tag">{copy.publicNotice}</span>
              <CloseButton
                className="landing-announcement-modal-close"
                onClick={() => setSelectedAnnouncement(null)}
                label={copy.closeAnnouncement}
              />
            </div>

            <h2 id={`landing-announcement-modal-title-${selectedAnnouncement.announcement_id}`}>
              {normalizeDasmarinasText(selectedAnnouncement.title)}
            </h2>
            <p
              className="landing-announcement-modal-content"
              id={`landing-announcement-modal-content-${selectedAnnouncement.announcement_id}`}
            >
              {normalizeDasmarinasText(selectedAnnouncement.content)}
            </p>

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
                      <img src={attachment.file_url} alt={normalizeDasmarinasText(attachment.file_name || 'Attached image')} />
                      <span>{normalizeDasmarinasText(attachment.file_name || copy.openOriginalImage)}</span>
                    </a>
                  ) : (
                    <a
                      key={`${selectedAnnouncement.announcement_id}-modal-file-${index}`}
                      href={attachment.file_url}
                      className="landing-announcement-file-link"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {normalizeDasmarinasText(attachment.file_name || 'Attachment')}
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
      ), document.body)}
    </section>
  );
}
