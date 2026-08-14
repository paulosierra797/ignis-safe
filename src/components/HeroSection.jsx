import { useMemo, useRef, useState } from 'react';
import './HeroSection.css'
import bfppic from '../assets/bfp_pic.jpg'
import { useLandingContent } from '../context/LandingContentContext';

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

    return [{ id: 'default-banner-photo', url: bfppic, alt: 'BFP Dasmarinas fire station personnel' }];
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
      <div className="hero-container">
        <div className="hero-content">
          <h1>{content.hero.title}</h1>
          <p>
            <span className="hero-lead">{content.hero.lead}</span>
            {content.hero.description}
          </p>
        </div>
        <div className="hero-image">
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
            />

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
        </div>
      </div>
    </section>
  )
}
