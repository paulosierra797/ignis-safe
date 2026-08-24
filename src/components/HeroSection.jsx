import { useMemo, useRef, useState } from 'react';
import {
  FiArrowRight,
  FiBell,
  FiCheckCircle,
  FiExternalLink,
  FiFileText,
  FiPhoneCall,
} from 'react-icons/fi';
import './HeroSection.css'
import firestation from '../assets/firestation.jpg'
import { useLandingContent } from '../context/LandingContentContext';

const FSIS_APPLICATION_URL = 'https://fsis.e-bfp.com/';

export default function HeroSection() {
  const { content } = useLandingContent();
  const touchStartXRef = useRef(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState('next');
  const bannerPhotos = useMemo(() => {
    const uploadedPhotos = Array.isArray(content.hero.photos)
      ? content.hero.photos.filter((photo) => photo?.url)
      : [];

    if (uploadedPhotos.length > 0) {
      return uploadedPhotos.map((photo, index) => ({
        ...photo,
        alt: photo.alt || `Main banner photo ${index + 1}`,
      }));
    }

    return [{ id: 'default-banner-photo', url: firestation, alt: 'BFP Dasmariñas City Fire Station and fire truck' }];
  }, [content.hero.photos]);

  const hasMultiplePhotos = bannerPhotos.length > 1;
  const safeActivePhotoIndex = Math.min(activePhotoIndex, bannerPhotos.length - 1);
  const activePhoto = bannerPhotos[safeActivePhotoIndex] || bannerPhotos[0];

  const goToPhoto = (nextIndex, direction = 'next') => {
    if (!hasMultiplePhotos) return;
    setSlideDirection(direction);
    setActivePhotoIndex((nextIndex + bannerPhotos.length) % bannerPhotos.length);
  };

  const goToPreviousPhoto = () => goToPhoto(safeActivePhotoIndex - 1, 'previous');
  const goToNextPhoto = () => goToPhoto(safeActivePhotoIndex + 1, 'next');

  const handleTouchStart = (event) => {
    if (!hasMultiplePhotos) return;
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (!hasMultiplePhotos || touchStartXRef.current === null) return;

    const touchEndX = event.changedTouches[0]?.clientX;
    if (typeof touchEndX !== 'number') return;

    const swipeDistance = touchEndX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (Math.abs(swipeDistance) < 45) return;
    if (swipeDistance > 0) {
      goToPreviousPhoto();
    } else {
      goToNextPhoto();
    }
  };

  return (
    <section className="hero" id="home">
      <div
        className="hero-carousel"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          key={activePhoto.id || activePhoto.url}
          src={activePhoto.url}
          alt={activePhoto.alt}
          className={`hero-image-img hero-carousel-photo is-${slideDirection}`}
          loading={safeActivePhotoIndex === 0 ? 'eager' : 'lazy'}
          fetchPriority={safeActivePhotoIndex === 0 ? 'high' : 'auto'}
        />
        <div className="hero-image-overlay" aria-hidden="true" />

        <div className="hero-container">
          <div className="hero-content">
            <span className="hero-eyebrow">Official city fire station portal</span>
            <h1>{content.hero.title}</h1>
            <p>
              <span className="hero-lead">{content.hero.lead}</span>
              {content.hero.description}
            </p>
            <div className="hero-actions">
              <a
                className="hero-primary-action"
                href={FSIS_APPLICATION_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Start online application
                <FiExternalLink aria-hidden="true" />
              </a>
              <a className="hero-secondary-action" href="#process">
                View requirements
              </a>
            </div>
          </div>

          <div className="hero-service-status">
            <FiCheckCircle aria-hidden="true" />
            <span>Station services and online guidance available</span>
          </div>
        </div>

        {hasMultiplePhotos && (
          <>
            <button
              type="button"
              className="hero-carousel-arrow hero-carousel-arrow--previous"
              onClick={goToPreviousPhoto}
              aria-label="Show previous banner photo"
            >
              ‹
            </button>
            <button
              type="button"
              className="hero-carousel-arrow hero-carousel-arrow--next"
              onClick={goToNextPhoto}
              aria-label="Show next banner photo"
            >
              ›
            </button>
            <div className="hero-carousel-dots" role="group" aria-label="Main banner photos">
              {bannerPhotos.map((photo, index) => (
                <button
                  key={photo.id || photo.url}
                  type="button"
                  className={`hero-carousel-dot${index === safeActivePhotoIndex ? ' is-active' : ''}`}
                  onClick={() => goToPhoto(index, index > safeActivePhotoIndex ? 'next' : 'previous')}
                  aria-label={`Show banner photo ${index + 1}`}
                  aria-pressed={index === safeActivePhotoIndex}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="hero-services" aria-label="Common public services">
        <a href="#process" className="hero-service-link">
          <FiFileText aria-hidden="true" />
          <span><strong>FSIC &amp; FSEC</strong><small>Requirements and application process</small></span>
          <FiArrowRight aria-hidden="true" />
        </a>
        <a href="#announcements" className="hero-service-link">
          <FiBell aria-hidden="true" />
          <span><strong>Public advisories</strong><small>Latest announcements and updates</small></span>
          <FiArrowRight aria-hidden="true" />
        </a>
        <a href="#contact" className="hero-service-link">
          <FiPhoneCall aria-hidden="true" />
          <span><strong>Contact the station</strong><small>Hotlines and official channels</small></span>
          <FiArrowRight aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}
