import appIcon from '../assets/inLOGO.png';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';
import './MobileAppDownloadSection.css';

// Add the final signed APK URL and release details here when they are ready.
const MOBILE_APP_RELEASE = null;

export default function MobileAppDownloadSection() {
  const { language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const hasRelease = Boolean(MOBILE_APP_RELEASE?.downloadUrl);

  return (
    <section className="landing-mobile-app" id="mobile-app" aria-labelledby="mobile-app-title">
      <div className="landing-mobile-app-container">
        <div className="landing-mobile-app-device" aria-label={copy.mobileAppPreviewLabel}>
          <div className="landing-mobile-app-phone" aria-hidden="true">
            <span className="landing-mobile-app-phone-speaker" />
            <div className="landing-mobile-app-screen">
              <header>
                <span><img src={appIcon} alt="" />IGNIS SAFE</span>
                <small>PREVIEW</small>
              </header>

              <div className="landing-mobile-app-screen-body">
                <p>GOOD DAY</p>
                <h3>Stay ready, stay safe.</h3>

                <section className="app-preview-progress">
                  <span>LEARNING PROGRESS</span>
                  <strong>3 of 5 modules</strong>
                  <b>60%</b>
                  <i><span /></i>
                </section>

                <div className="app-preview-shortcuts">
                  <span><strong>Lessons</strong><small>Learn the basics</small></span>
                  <span><strong>Simulation</strong><small>Practice safely</small></span>
                </div>

                <section className="app-preview-module">
                  <p>CONTINUE LEARNING</p>
                  <div>
                    <span>03</span>
                    <div><strong>Electrical Fire Safety</strong><small>Module 3</small></div>
                  </div>
                  <b>Continue</b>
                </section>
              </div>

              <nav>
                <span className="is-active">Home</span>
                <span>Learn</span>
                <span>Badges</span>
                <span>Profile</span>
              </nav>
            </div>
          </div>
        </div>

        <div className="landing-mobile-app-content">
          <h2 id="mobile-app-title">{copy.mobileAppDownloadTitle}</h2>
          <p>{copy.mobileAppDownloadIntro}</p>

          <div className="landing-mobile-app-download-row">
            {hasRelease ? (
              <a href={MOBILE_APP_RELEASE.downloadUrl} className="landing-mobile-app-download" download>
                {copy.downloadApk}
              </a>
            ) : (
              <button type="button" className="landing-mobile-app-download" disabled>
                {copy.downloadApkComingSoon}
              </button>
            )}

            <dl className="landing-mobile-app-file-info">
              <div><dt>{copy.mobileAppPlatform}</dt><dd>Android</dd></div>
              <div><dt>{copy.mobileAppFormat}</dt><dd>APK</dd></div>
              <div><dt>{copy.mobileAppVersion}</dt><dd>{copy.mobileAppAwaitingRelease}</dd></div>
            </dl>
          </div>

          <div className="landing-mobile-app-guidance">
            <div className="landing-mobile-app-qr-placeholder" aria-label={copy.mobileAppQrTitle}>
              <span>{copy.mobileAppQrPending}</span>
            </div>

            <div className="landing-mobile-app-instructions">
              <h3>{copy.mobileAppInstallTitle}</h3>
              <ol>
                <li>{copy.mobileAppInstallStepOne}</li>
                <li>{copy.mobileAppInstallStepTwo}</li>
                <li>{copy.mobileAppInstallStepThree}</li>
              </ol>
            </div>
          </div>

          <small className="landing-mobile-app-note">{copy.mobileAppPlaceholderNote}</small>
        </div>
      </div>
    </section>
  );
}
