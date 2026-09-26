import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { FiArrowDown, FiArrowUp, FiEye, FiEyeOff, FiMove, FiSettings } from 'react-icons/fi';
import { useLandingContent } from '../context/LandingContentContext';
import HeroSection from './HeroSection';
import TrustAccessibilitySection from './TrustAccessibilitySection';
import MobileAppDownloadSection from './MobileAppDownloadSection';
import LandingAnnouncements from './LandingAnnouncements';
import ProcessSection from './ProcessSection';
import AboutSection from './AboutSection';
import ContactSection from './ContactSection';
import FAQSection from './FAQSection';
import './LandingMotion.css';

gsap.registerPlugin(useGSAP);

const LANDING_SECTIONS = {
  hero: { label: 'Main banner', Component: HeroSection },
  trust: { label: 'Trust and accessibility', Component: TrustAccessibilitySection },
  announcements: { label: 'Announcements', Component: LandingAnnouncements },
  'mobile-app': { label: 'Mobile application', Component: MobileAppDownloadSection },
  process: { label: 'Application process', Component: ProcessSection },
  about: { label: 'About us', Component: AboutSection },
  contact: { label: 'Contact information', Component: ContactSection },
  faq: { label: 'Frequently asked questions', Component: FAQSection },
};

const MOTION_TARGETS = {
  hero: '.hero-content > *, .hero-service-status, .hero-service-link',
  trust: '.landing-trust-heading, .landing-trust-item',
  announcements: '.landing-announcements-header, .landing-announcements-grid, .landing-announcements-empty',
  process: '.process-heading-row, .process-column',
  about: '.about-image-wrap, .about-content > *',
  contact: '.contact-image, .contact-content > h2, .emergency-title, .contact-info',
  faq: '.faq-heading-row, .faq-item',
};

function LandingSectionFrame({ sectionId, className, editMode, children }) {
  const sectionRef = useRef(null);

  useGSAP(() => {
    const frame = sectionRef.current;
    const targetSelector = MOTION_TARGETS[sectionId];
    if (!frame || editMode || !targetSelector) return undefined;

    const targets = Array.from(frame.querySelectorAll(targetSelector));
    if (targets.length === 0) return undefined;

    let observer;
    const media = gsap.matchMedia();

    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set(targets, { autoAlpha: 0, y: sectionId === 'hero' ? 16 : 26 });

      observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;

        frame.classList.add('is-motion-visible');
        gsap.to(targets, {
          autoAlpha: 1,
          y: 0,
          duration: 0.62,
          stagger: 0.065,
          ease: 'power2.out',
          clearProps: 'opacity,visibility,transform',
        });
        observer.disconnect();
      }, { threshold: 0.1, rootMargin: '0px 0px -7% 0px' });

      observer.observe(frame);
      return () => observer?.disconnect();
    });

    media.add('(prefers-reduced-motion: reduce)', () => {
      frame.classList.add('is-motion-visible');
      gsap.set(targets, { clearProps: 'opacity,visibility,transform' });
    });

    return () => {
      observer?.disconnect();
      media.revert();
    };
  }, { scope: sectionRef, dependencies: [editMode, sectionId], revertOnUpdate: true });

  return (
    <div ref={sectionRef} className={className} data-landing-section={sectionId}>
      {children}
    </div>
  );
}

export default function LandingPageSections({
  editMode = false,
  onMoveSection,
  onToggleSection,
  onManageSection,
}) {
  const { content } = useLandingContent();
  const sections = content.layout?.sections || Object.keys(LANDING_SECTIONS);
  const hidden = new Set(content.layout?.hidden || []);

  return sections.map((sectionId, index) => {
    const definition = LANDING_SECTIONS[sectionId];
    if (!definition) return null;

    const isHidden = hidden.has(sectionId);
    if (isHidden && !editMode) return null;

    const SectionComponent = definition.Component;
    return (
      <LandingSectionFrame
        key={sectionId}
        sectionId={sectionId}
        editMode={editMode}
        className={`landing-admin-section${editMode ? ' is-editing' : ''}${isHidden ? ' is-hidden' : ''}`}
      >
        {editMode && (
          <div className="landing-admin-section-tools" data-landing-editor-control="true">
            <span><FiMove aria-hidden="true" /> {definition.label}</span>
            <button
              type="button"
              onClick={() => onMoveSection?.(sectionId, -1)}
              disabled={index === 0}
              aria-label={`Move ${definition.label} section up`}
              title="Move section up"
            >
              <FiArrowUp aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onMoveSection?.(sectionId, 1)}
              disabled={index === sections.length - 1}
              aria-label={`Move ${definition.label} section down`}
              title="Move section down"
            >
              <FiArrowDown aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onToggleSection?.(sectionId)}
              aria-label={`${isHidden ? 'Show' : 'Hide'} ${definition.label} section`}
              title={`${isHidden ? 'Show' : 'Hide'} section`}
            >
              {isHidden ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
            </button>
            {sectionId === 'announcements' && (
              <button
                type="button"
                onClick={() => onManageSection?.(sectionId)}
                aria-label="Manage announcements"
                title="Manage announcements"
              >
                <FiSettings aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {isHidden ? (
          <button
            type="button"
            className="landing-admin-hidden-section"
            onClick={() => onToggleSection?.(sectionId)}
            data-landing-editor-control="true"
          >
            <FiEye aria-hidden="true" />
            <span>{definition.label} is hidden. Select to show it.</span>
          </button>
        ) : (
          <SectionComponent />
        )}
      </LandingSectionFrame>
    );
  });
}
