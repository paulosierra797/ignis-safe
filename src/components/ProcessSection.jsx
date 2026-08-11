import { useState } from 'react'
import './ProcessSection.css'
import { useLandingContent } from '../context/LandingContentContext';
import fsisQrCode from '../assets/qrcode_fsis.e-bfp.com.png';

const FSIS_APPLICATION_URL = 'https://fsis.e-bfp.com/';

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
                {section.steps.map((step) => {
                  const isFsisPortalStep = idx === 0 && step.num === 1;

                  return (
                  <li key={step.num} className={isFsisPortalStep ? 'fsis-portal-step' : undefined}>
                    <span className="step-number">{step.num}</span>
                    <span className="step-text">
                      {isFsisPortalStep ? (
                        <>
                          {isTagalog ? 'Pumunta sa ' : 'Go to '}
                          <a
                            className="fsis-portal-link"
                            href={FSIS_APPLICATION_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            fsis.e-bfp.com
                          </a>
                          {isTagalog ? ' o i-scan ang QR code sa ibaba.' : ' or scan the QR code below.'}
                          <a
                            className="fsis-qr-link"
                            href={FSIS_APPLICATION_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open the FSIS online application portal"
                          >
                            <img
                              className="fsis-qr-image"
                              src={fsisQrCode}
                              alt="QR code for the FSIS online application portal"
                            />
                          </a>
                        </>
                      ) : step.text}
                    </span>
                  </li>
                  );
                })}
              </ol>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
