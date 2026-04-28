import './AboutSection.css'
import { useLandingContent } from '../context/LandingContentContext';

export default function AboutSection() {
  const { content } = useLandingContent();

  return (
    <section className="about" id="about">
      <div className="about-container">
        <h2>{content.about.title}</h2>
        <p className="about-intro">
          {content.about.intro}
        </p>
        
        <div className="values-grid">
          <div className="value-card">
            <h3>{content.about.missionTitle}</h3>
            <p>{content.about.missionText}</p>
          </div>
          <div className="value-card highlight">
            <h3>{content.about.visionTitle}</h3>
            <p>{content.about.visionText}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
