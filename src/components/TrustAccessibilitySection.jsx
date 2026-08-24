import { FiEye, FiLock, FiShield } from 'react-icons/fi';
import { useLandingContent } from '../context/LandingContentContext';
import { normalizeDasmarinasText } from '../utils/landingLanguage';
import './TrustAccessibilitySection.css';

const TRUST_ICONS = [FiShield, FiEye, FiLock];

export default function TrustAccessibilitySection() {
  const { content, language } = useLandingContent();
  const trustContent = content.trust?.[language] || content.trust?.english;

  if (!trustContent) return null;

  return (
    <section className="landing-trust" id="trust-accessibility" aria-labelledby="landing-trust-title">
      <div className="landing-trust-container">
        <div className="landing-trust-heading">
          <p>{normalizeDasmarinasText(trustContent.eyebrow)}</p>
          <h2 id="landing-trust-title">{normalizeDasmarinasText(trustContent.title)}</h2>
          <span>{normalizeDasmarinasText(trustContent.intro)}</span>
        </div>

        <div className="landing-trust-items">
          {(trustContent.items || []).slice(0, 3).map((item, index) => {
            const Icon = TRUST_ICONS[index] || FiShield;
            return (
              <article key={`${item.title}-${index}`} className="landing-trust-item">
                <Icon aria-hidden="true" />
                <div>
                  <h3>{normalizeDasmarinasText(item.title)}</h3>
                  <p>{normalizeDasmarinasText(item.text)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
