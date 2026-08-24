import './ProcessSection.css'
import { useLandingContent } from '../context/LandingContentContext';
import fsisQrCode from '../assets/qrcode_fsis.e-bfp.com.png';
import { getLandingUiCopy, normalizeDasmarinasText } from '../utils/landingLanguage';

const FSIS_APPLICATION_URL = 'https://fsis.e-bfp.com/';

export default function ProcessSection() {
  const { content: landingContent, language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const currentContent = landingContent.process[language] || landingContent.process.english;

  return (
    <section className="process" id="process">
      <div className="process-container">
        <div className="process-heading-row">
          <div>
            <p className="landing-section-eyebrow">{copy.processEyebrow}</p>
            <h2>{normalizeDasmarinasText(currentContent.title)}</h2>
            <p className="process-heading-description">
              {copy.processDescription}
            </p>
          </div>
        </div>
        
        <div className="process-grid">
          {currentContent.processSteps.map((section, idx) => (
            <article key={idx} className="process-column">
              <span className="process-column-number">{String(idx + 1).padStart(2, '0')}</span>
              <h3>{normalizeDasmarinasText(section.title)}</h3>
              <ol className="steps-list">
                {section.steps.map((step) => {
                  const isFsisPortalStep = idx === 0 && step.num === 1;

                  return (
                  <li key={step.num} className={isFsisPortalStep ? 'fsis-portal-step' : undefined}>
                    <span className="step-number">{step.num}</span>
                    <span className="step-text">
                      {isFsisPortalStep ? (
                        <>
                          {copy.goToPortal}
                          <a
                            className="fsis-portal-link"
                            href={FSIS_APPLICATION_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            fsis.e-bfp.com
                          </a>
                          {copy.orScanQr}
                          <a
                            className="fsis-qr-link"
                            href={FSIS_APPLICATION_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={copy.openFsisPortal}
                          >
                            <img
                              className="fsis-qr-image"
                              src={fsisQrCode}
                              alt="QR code for the FSIS online application portal"
                            />
                          </a>
                        </>
                      ) : normalizeDasmarinasText(step.text)}
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
