import './AboutSection.css'
import { FiArrowRight, FiEye, FiShield } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import personnelPhoto from '../assets/bfp_pic.jpg';
import { useLandingContent } from '../context/LandingContentContext';

export default function AboutSection() {
  const { content } = useLandingContent();

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
          <p className="about-eyebrow">Serving Dasmariñas</p>
          <h2>{content.about.title}</h2>
          <p className="about-intro">
            {content.about.intro}
          </p>

          <div className="values-grid">
            <div className="value-card">
              <FiShield aria-hidden="true" />
              <div>
                <h3>{content.about.missionTitle}</h3>
                <p>{content.about.missionText}</p>
              </div>
            </div>
            <div className="value-card highlight">
              <FiEye aria-hidden="true" />
              <div>
                <h3>{content.about.visionTitle}</h3>
                <p>{content.about.visionText}</p>
              </div>
            </div>
          </div>

          <Link className="about-chart-link" to="/organizational-chart">
            View organizational chart
            <FiArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
