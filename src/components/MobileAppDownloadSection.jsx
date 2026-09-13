import { FaAndroid } from 'react-icons/fa';
import {
  FiAward,
  FiBell,
  FiBookOpen,
  FiCheckCircle,
  FiDownload,
  FiHome,
  FiPlayCircle,
  FiShield,
  FiSmartphone,
  FiUser,
} from 'react-icons/fi';
import appIcon from '../assets/inLOGO.png';
import appLogo from '../assets/Logo1.png';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';
import './MobileAppDownloadSection.css';

// The final signed APK details and real screenshots will replace this preview.
const MOBILE_APP_RELEASE = null;

export default function MobileAppDownloadSection() {
  const { language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const hasRelease = Boolean(MOBILE_APP_RELEASE?.downloadUrl);

  return (
    <section className="landing-mobile-app" id="mobile-app" aria-labelledby="mobile-app-title">
      <div className="landing-mobile-app-heading">
        <img src={appLogo} alt="IGNIS SAFE" width="245" height="81" />
        <p>{copy.mobileAppEyebrow}</p>
        <h2 id="mobile-app-title">{copy.mobileAppTitle}</h2>
        <span>{copy.mobileAppDescription}</span>
      </div>

      <div className="landing-mobile-app-showcase">
        <div className="landing-mobile-app-details">
          <span className="landing-mobile-app-status"><span aria-hidden="true" />{copy.mobileAppComingSoon}</span>
          <h3>{copy.mobileAppShowcaseTitle}</h3>
          <p>{copy.mobileAppShowcaseText}</p>

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
                <FaAndroid aria-hidden="true" />
                {copy.downloadApkComingSoon}
              </button>
            )}
            <div className="landing-mobile-app-release-note">
              <strong>Android APK</strong>
              <span>{copy.mobileAppAwaitingRelease}</span>
            </div>
          </div>

          <p className="landing-mobile-app-placeholder-note">{copy.mobileAppPlaceholderNote}</p>
        </div>

        <div className="landing-mobile-app-device-stage" aria-label={copy.mobileAppPreviewLabel}>
          <div className="landing-mobile-app-preview-note">
            <FiSmartphone aria-hidden="true" />
            <span>{copy.mobileAppPreviewNote}</span>
          </div>

          <div className="landing-mobile-app-phone" aria-hidden="true">
            <span className="landing-mobile-app-phone-speaker" />
            <div className="landing-mobile-app-screen">
              <header>
                <span><img src={appIcon} alt="" />IGNIS SAFE</span>
                <FiBell />
              </header>

              <div className="landing-mobile-app-screen-body">
                <p className="app-preview-greeting">GOOD DAY</p>
                <h4>Stay ready, stay safe.</h4>

                <section className="app-preview-progress">
                  <div>
                    <span>LEARNING PROGRESS</span>
                    <strong>3 of 5 modules</strong>
                  </div>
                  <b>60%</b>
                  <i><span /></i>
                </section>

                <div className="app-preview-actions">
                  <span><FiBookOpen /><strong>Lessons</strong><small>Learn the basics</small></span>
                  <span><FiPlayCircle /><strong>Simulation</strong><small>Practice safely</small></span>
                </div>

                <section className="app-preview-module">
                  <p>CONTINUE LEARNING</p>
                  <div>
                    <span><FiAward /></span>
                    <div><strong>Electrical Fire Safety</strong><small>Module 3</small></div>
                  </div>
                  <b>Continue</b>
                </section>
              </div>

              <nav aria-label="Application preview navigation">
                <span className="is-active"><FiHome />Home</span>
                <span><FiBookOpen />Learn</span>
                <span><FiAward />Badges</span>
                <span><FiUser />Profile</span>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
