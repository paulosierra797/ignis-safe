import { useState } from 'react'
import './ProcessSection.css'
import { useLandingContent } from '../context/LandingContentContext';

export default function ProcessSection() {
  const [isTagalog, setIsTagalog] = useState(false)
  const { content: landingContent } = useLandingContent();

  const currentContent = isTagalog ? landingContent.process.tagalog : landingContent.process.english

  return (
    <section className="process">
      <div className="process-container">
        <h2>{currentContent.title}</h2>
        <button 
          className="tagalog-btn"
          onClick={() => setIsTagalog(!isTagalog)}
        >
          {isTagalog ? 'ENGLISH' : 'TAGALOG'}
        </button>
        
        <div className="process-grid">
          {currentContent.processSteps.map((section, idx) => (
            <div key={idx} className="process-column">
              <h3>{section.title}</h3>
              <ol className="steps-list">
                {section.steps.map((step) => (
                  <li key={step.num}>
                    <span className="step-number">{step.num}</span>
                    <span className="step-text">{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
