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
import firestation from '../assets/firestation.webp'
import firestationSmall from '../assets/firestation-640.webp'
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy, getLocalizedSection, normalizeDasmarinasText } from '../utils/landingLanguage';

const FSIS_APPLICATION_URL = 'https://fsis.e-bfp.com/';

export default function HeroSection() {
  const { content, language } = useLandingContent();
  const copy = { ...getLandingUiCopy(language), ...(content.copy?.[language] || {}) };
  const heroContent = getLocalizedSection(content.hero, language);
  const touchStartXRef = useRef(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState('next');
  const [hasChangedPhoto, setHasChangedPhoto] = useState(false);
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

    return [{
      id: 'default-banner-photo',
      url: firestation,
      srcSet: `${firestationSmall} 640w, ${firestation} 1360w`,
      sizes: '100vw',
      alt: 'BFP Dasmariñas City Fire Station and fire truck',
    }];
  }, [content.hero.photos]);

  const hasMultiplePhotos = bannerPhotos.length > 1;
  const safeActivePhotoIndex = Math.min(activePhotoIndex, bannerPhotos.length - 1);
  const activePhoto = bannerPhotos[safeActivePhotoIndex] || bannerPhotos[0];

  const goToPhoto = (nextIndex, direction = 'next') => {
    if (!hasMultiplePhotos) return;
    setHasChangedPhoto(true);
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
    <section className="hero" id="home" data-language={language}>
      <div
        className="hero-carousel"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          key={activePhoto.id || activePhoto.url}
          src={activePhoto.url}
          srcSet={activePhoto.srcSet}
          sizes={activePhoto.sizes}
          alt={normalizeDasmarinasText(activePhoto.alt)}
          className={`hero-image-img hero-carousel-photo is-${slideDirection}${hasChangedPhoto ? '' : ' is-initial'}`}
          loading={safeActivePhotoIndex === 0 ? 'eager' : 'lazy'}
          fetchPriority={safeActivePhotoIndex === 0 ? 'high' : 'auto'}
          data-landing-edit-image="hero.photos"
          data-landing-edit-label="Main banner photos"
        />
        <div className="hero-image-overlay" aria-hidden="true" />

        <div className="hero-container">
          <div className="hero-content">
            <span className="hero-eyebrow" data-landing-edit-path={`copy.${language}.heroEyebrow`} data-landing-edit-label="Main banner eyebrow">{copy.heroEyebrow}</span>
            <h1
              data-landing-edit-path={language === 'tagalog' ? 'hero.tagalog.title' : 'hero.title'}
              data-landing-edit-label="Main page title"
            >
              {normalizeDasmarinasText(heroContent.title)}
            </h1>
            <p>
              <span
                className="hero-lead"
                data-landing-edit-path={language === 'tagalog' ? 'hero.tagalog.lead' : 'hero.lead'}
                data-landing-edit-label="Welcome message"
              >
                {normalizeDasmarinasText(heroContent.lead)}
              </span>
              <span
                data-landing-edit-path={language === 'tagalog' ? 'hero.tagalog.description' : 'hero.description'}
                data-landing-edit-label="Supporting description"
                data-landing-edit-multiline="true"
              >
                {normalizeDasmarinasText(heroContent.description)}
              </span>
            </p>
            <div className="hero-actions">
              <a
                className="hero-primary-action"
                href={FSIS_APPLICATION_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span data-landing-edit-path={`copy.${language}.startApplication`} data-landing-edit-label="Application button label">{copy.startApplication}</span>
                <FiExternalLink aria-hidden="true" />
              </a>
              <a className="hero-secondary-action" href="#process">
                <span data-landing-edit-path={`copy.${language}.viewRequirements`} data-landing-edit-label="Requirements button label">{copy.viewRequirements}</span>
              </a>
            </div>
          </div>

          <div className="hero-service-status">
            <FiCheckCircle aria-hidden="true" />
            <span data-landing-edit-path={`copy.${language}.servicesAvailable`} data-landing-edit-label="Service status text">{copy.servicesAvailable}</span>
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
          <span><strong data-landing-edit-path={`copy.${language}.fsicFsec`} data-landing-edit-label="Service link title">{copy.fsicFsec}</strong><small data-landing-edit-path={`copy.${language}.requirementsProcess`} data-landing-edit-label="Service link description">{copy.requirementsProcess}</small></span>
          <FiArrowRight aria-hidden="true" />
        </a>
        <a href="#announcements" className="hero-service-link">
          <FiBell aria-hidden="true" />
          <span><strong data-landing-edit-path={`copy.${language}.publicAdvisories`} data-landing-edit-label="Advisories link title">{copy.publicAdvisories}</strong><small data-landing-edit-path={`copy.${language}.latestUpdates`} data-landing-edit-label="Advisories link description">{copy.latestUpdates}</small></span>
          <FiArrowRight aria-hidden="true" />
        </a>
        <a href="#contact" className="hero-service-link">
          <FiPhoneCall aria-hidden="true" />
          <span><strong data-landing-edit-path={`copy.${language}.contactStation`} data-landing-edit-label="Contact link title">{copy.contactStation}</strong><small data-landing-edit-path={`copy.${language}.hotlinesChannels`} data-landing-edit-label="Contact link description">{copy.hotlinesChannels}</small></span>
          <FiArrowRight aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}
