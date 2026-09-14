import './ProcessSection.css'
import { useLandingContent } from '../context/LandingContentContext';
import fsisQrCode from '../assets/qrcode_fsis.e-bfp.com.png';
import { getLandingUiCopy, normalizeDasmarinasText } from '../utils/landingLanguage';

const FSIS_APPLICATION_URL = 'https://fsis.e-bfp.com/';

export default function ProcessSection() {
  const { content: landingContent, language } = useLandingContent();
  const copy = { ...getLandingUiCopy(language), ...(landingContent.copy?.[language] || {}) };
  const currentContent = landingContent.process[language] || landingContent.process.english;

  const renderPortalStep = (text) => {
    const normalizedText = normalizeDasmarinasText(text);
    const [beforePortal, ...afterPortalParts] = normalizedText.split('fsis.e-bfp.com');

    if (afterPortalParts.length === 0) return normalizedText;

    return (
      <>
        {beforePortal}
        <a className="fsis-portal-link" href={FSIS_APPLICATION_URL} target="_blank" rel="noopener noreferrer">
          fsis.e-bfp.com
        </a>
        {afterPortalParts.join('fsis.e-bfp.com')}
        <a className="fsis-qr-link" href={FSIS_APPLICATION_URL} target="_blank" rel="noopener noreferrer" aria-label={copy.openFsisPortal}>
          <img className="fsis-qr-image" src={fsisQrCode} alt="QR code for the FSIS online application portal" />
        </a>
      </>
    );
  };

  return (
    <section className="process" id="process">
      <div className="process-container">
        <div className="process-heading-row">
          <div>
            <p className="landing-section-eyebrow" data-landing-edit-path={`copy.${language}.processEyebrow`} data-landing-edit-label="Process section eyebrow">{copy.processEyebrow}</p>
            <h2 data-landing-edit-path={`process.${language}.title`} data-landing-edit-label="Application process heading" data-landing-edit-multiline="true">{normalizeDasmarinasText(currentContent.title)}</h2>
            <p className="process-heading-description">
              <span data-landing-edit-path={`copy.${language}.processDescription`} data-landing-edit-label="Process section description" data-landing-edit-multiline="true">{copy.processDescription}</span>
            </p>
          </div>
        </div>
        
        <div className="process-grid">
          {currentContent.processSteps.map((section, idx) => (
            <article key={idx} className="process-column">
              <span className="process-column-number" aria-hidden="true">{String(idx + 1).padStart(2, '0')}</span>
              <h3 data-landing-edit-path={`process.${language}.processSteps.${idx}.title`} data-landing-edit-label={`Process card ${idx + 1} title`}>{normalizeDasmarinasText(section.title)}</h3>
              <ol className="steps-list">
                {section.steps.map((step, stepIndex) => {
                  const isFsisPortalStep = idx === 0 && step.num === 1;

                  return (
                  <li key={step.num} className={isFsisPortalStep ? 'fsis-portal-step' : undefined}>
                    <span className="step-number">{step.num}</span>
                    <span
                      className="step-text"
                      data-landing-edit-path={`process.${language}.processSteps.${idx}.steps.${stepIndex}.text`}
                      data-landing-edit-label={`Process card ${idx + 1}, step ${step.num}`}
                      data-landing-edit-multiline="true"
                    >
                      {isFsisPortalStep ? renderPortalStep(step.text) : normalizeDasmarinasText(step.text)}
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
