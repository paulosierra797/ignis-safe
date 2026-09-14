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

const LANDING_SECTIONS = {
  hero: { label: 'Main banner', Component: HeroSection },
  trust: { label: 'Trust and accessibility', Component: TrustAccessibilitySection },
  'mobile-app': { label: 'Mobile application', Component: MobileAppDownloadSection },
  announcements: { label: 'Announcements', Component: LandingAnnouncements },
  process: { label: 'Application process', Component: ProcessSection },
  about: { label: 'About us', Component: AboutSection },
  contact: { label: 'Contact information', Component: ContactSection },
  faq: { label: 'Frequently asked questions', Component: FAQSection },
};

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
      <div
        key={sectionId}
        className={`landing-admin-section${editMode ? ' is-editing' : ''}${isHidden ? ' is-hidden' : ''}`}
        data-landing-section={sectionId}
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
      </div>
    );
  });
}
