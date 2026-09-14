import './AboutSection.css'
import { FiArrowRight, FiEye, FiShield } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import personnelPhoto from '../assets/bfp_pic.webp';
import personnelPhotoSmall from '../assets/bfp_pic-640.webp';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy, getLocalizedSection, normalizeDasmarinasText } from '../utils/landingLanguage';

export default function AboutSection() {
  const { content, language } = useLandingContent();
  const copy = { ...getLandingUiCopy(language), ...(content.copy?.[language] || {}) };
  const aboutContent = getLocalizedSection(content.about, language);
  const aboutPhoto = content.media?.aboutPhoto;

  return (
    <section className="about" id="about">
      <div className="about-container">
        <div className="about-image-wrap">
          <img
            src={aboutPhoto?.url || personnelPhoto}
            srcSet={aboutPhoto?.url ? undefined : `${personnelPhotoSmall} 640w, ${personnelPhoto} 940w`}
            sizes="(max-width: 767px) calc(100vw - 2rem), 50vw"
            alt="BFP Dasmariñas City Fire Station personnel"
            className="about-image"
            loading="lazy"
            decoding="async"
            width="940"
            height="692"
            data-landing-edit-image="media.aboutPhoto"
            data-landing-edit-label="About us photo"
          />
        </div>

        <div className="about-content">
          <p className="about-eyebrow" data-landing-edit-path={`copy.${language}.servingCity`} data-landing-edit-label="About section eyebrow">{copy.servingCity}</p>
          <h2 data-landing-edit-path={language === 'tagalog' ? 'about.tagalog.title' : 'about.title'} data-landing-edit-label="About us heading">{normalizeDasmarinasText(aboutContent.title)}</h2>
          <p className="about-intro" data-landing-edit-path={language === 'tagalog' ? 'about.tagalog.intro' : 'about.intro'} data-landing-edit-label="About us description" data-landing-edit-multiline="true">
            {normalizeDasmarinasText(aboutContent.intro)}
          </p>

          <div className="values-grid">
            <div className="value-card">
              <FiShield aria-hidden="true" />
              <div>
                <h3 data-landing-edit-path="about.missionTitle" data-landing-edit-label="Mission title">{normalizeDasmarinasText(aboutContent.missionTitle)}</h3>
                <p data-landing-edit-path="about.missionText" data-landing-edit-label="Mission description" data-landing-edit-multiline="true">{normalizeDasmarinasText(aboutContent.missionText)}</p>
              </div>
            </div>
            <div className="value-card highlight">
              <FiEye aria-hidden="true" />
              <div>
                <h3 data-landing-edit-path="about.visionTitle" data-landing-edit-label="Vision title">{normalizeDasmarinasText(aboutContent.visionTitle)}</h3>
                <p data-landing-edit-path="about.visionText" data-landing-edit-label="Vision description" data-landing-edit-multiline="true">{normalizeDasmarinasText(aboutContent.visionText)}</p>
              </div>
            </div>
          </div>

          <Link className="about-chart-link" to="/organizational-chart">
            <span data-landing-edit-path={`copy.${language}.viewOrgChart`} data-landing-edit-label="Organization chart link label">{copy.viewOrgChart}</span>
            <FiArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
