import './AboutSection.css'
import { FiArrowRight, FiEye, FiShield } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import personnelPhoto from '../assets/bfp_pic.jpg';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy, getLocalizedSection, normalizeDasmarinasText } from '../utils/landingLanguage';

export default function AboutSection() {
  const { content, language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const aboutContent = getLocalizedSection(content.about, language);

  return (
    <section className="about" id="about">
      <div className="about-container">
        <div className="about-image-wrap">
          <img
            src={personnelPhoto}
            alt="BFP Dasmariñas City Fire Station personnel"
            className="about-image"
            loading="lazy"
          />
        </div>

        <div className="about-content">
          <p className="about-eyebrow">{copy.servingCity}</p>
          <h2>{normalizeDasmarinasText(aboutContent.title)}</h2>
          <p className="about-intro">
            {normalizeDasmarinasText(aboutContent.intro)}
          </p>

          <div className="values-grid">
            <div className="value-card">
              <FiShield aria-hidden="true" />
              <div>
                <h3>{normalizeDasmarinasText(aboutContent.missionTitle)}</h3>
                <p>{normalizeDasmarinasText(aboutContent.missionText)}</p>
              </div>
            </div>
            <div className="value-card highlight">
              <FiEye aria-hidden="true" />
              <div>
                <h3>{normalizeDasmarinasText(aboutContent.visionTitle)}</h3>
                <p>{normalizeDasmarinasText(aboutContent.visionText)}</p>
              </div>
            </div>
          </div>

          <Link className="about-chart-link" to="/organizational-chart">
            {copy.viewOrgChart}
            <FiArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
