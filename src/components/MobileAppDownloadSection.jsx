import { FaAndroid } from 'react-icons/fa';
import { FiCheckCircle, FiDownload, FiShield, FiSmartphone } from 'react-icons/fi';
import appLogo from '../assets/Logo1.png';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';
import './MobileAppDownloadSection.css';

// The final signed APK details will replace this placeholder release.
const MOBILE_APP_RELEASE = null;

export default function MobileAppDownloadSection() {
  const { language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const hasRelease = Boolean(MOBILE_APP_RELEASE?.downloadUrl);

  return (
    <section className="landing-mobile-app" id="mobile-app" aria-labelledby="mobile-app-title">
      <div className="landing-mobile-app-container">
        <div className="landing-mobile-app-content">
          <img
            className="landing-mobile-app-wordmark"
            src={appLogo}
            alt="IGNIS SAFE"
            width="245"
            height="81"
          />
          <p className="landing-mobile-app-eyebrow">{copy.mobileAppEyebrow}</p>
          <h2 id="mobile-app-title">{copy.mobileAppTitle}</h2>
          <p className="landing-mobile-app-description">{copy.mobileAppDescription}</p>

          <div className="landing-mobile-app-highlights" aria-label={copy.mobileAppHighlightsLabel}>
            <span><FiShield aria-hidden="true" />{copy.mobileAppOfficial}</span>
            <span><FiSmartphone aria-hidden="true" />{copy.mobileAppAndroidOnly}</span>
            <span><FiCheckCircle aria-hidden="true" />{copy.mobileAppVerifiedRelease}</span>
          </div>

          <div className="landing-mobile-app-action">
            {hasRelease ? (
              <a href={MOBILE_APP_RELEASE.downloadUrl} className="landing-mobile-app-download" download>
                <FiDownload aria-hidden="true" />
                {copy.downloadApk}
              </a>
            ) : (
              <button type="button" className="landing-mobile-app-download" disabled>
                <FiDownload aria-hidden="true" />
                {copy.downloadApkComingSoon}
              </button>
            )}
            <p>{copy.mobileAppPlaceholderNote}</p>
          </div>
        </div>

        <aside className="landing-mobile-app-release" aria-label={copy.mobileAppReleaseStatus}>
          <div className="landing-mobile-app-release-heading">
            <span><FaAndroid aria-hidden="true" /></span>
            <div>
              <p>{copy.mobileAppReleaseStatus}</p>
              <h3>{copy.mobileAppPreparingBuild}</h3>
            </div>
          </div>

          <dl>
            <div>
              <dt>{copy.mobileAppPlatform}</dt>
              <dd>Android</dd>
            </div>
            <div>
              <dt>{copy.mobileAppFormat}</dt>
              <dd>APK</dd>
            </div>
            <div>
              <dt>{copy.mobileAppVersion}</dt>
              <dd>{copy.mobileAppAwaitingRelease}</dd>
            </div>
            <div>
              <dt>{copy.mobileAppAvailability}</dt>
              <dd className="is-coming-soon"><span aria-hidden="true" />{copy.mobileAppComingSoon}</dd>
            </div>
          </dl>

          <div className="landing-mobile-app-qr-placeholder">
            <FiSmartphone aria-hidden="true" />
            <div>
              <strong>{copy.mobileAppQrTitle}</strong>
              <p>{copy.mobileAppQrNote}</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
