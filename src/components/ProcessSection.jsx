import { useState } from 'react'
import './ProcessSection.css'
import { useLandingContent } from '../context/LandingContentContext';

export default function ProcessSection() {
  const [isTagalog, setIsTagalog] = useState(false)
  const { content: landingContent } = useLandingContent();

  const currentContent = isTagalog ? landingContent.process.tagalog : landingContent.process.english

  return (
    <section className="process" id="process">
      <div className="process-container">
        <div className="process-heading-row">
          <div>
            <p className="landing-section-eyebrow">Step-by-step processing guide</p>
            <h2>{currentContent.title}</h2>
            <p className="process-heading-description">
              Follow the required account, application, payment, and document-release steps.
            </p>
          </div>
          <button
            type="button"
            className="language-toggle process-language-toggle"
            onClick={() => setIsTagalog(!isTagalog)}
            aria-label={`Show process guide in ${isTagalog ? 'English' : 'Tagalog'}`}
          >
            <span aria-hidden="true">文</span>
            {isTagalog ? 'English' : 'Tagalog'}
          </button>
        </div>
        
        <div className="process-grid">
          {currentContent.processSteps.map((section, idx) => (
            <article key={idx} className="process-column">
              <span className="process-column-number">{String(idx + 1).padStart(2, '0')}</span>
              <h3>{section.title}</h3>
              <ol className="steps-list">
                {section.steps.map((step) => (
                  <li key={step.num}>
                    <span className="step-number">{step.num}</span>
                    <span className="step-text">{step.text}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
