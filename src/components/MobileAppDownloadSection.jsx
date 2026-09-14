import { QRCodeSVG } from 'qrcode.react';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';
import './MobileAppDownloadSection.css';

const MOBILE_APP_RELEASE = {
  downloadPath: `${import.meta.env.BASE_URL}downloads/ignis-safe.apk`,
  learningImagePath: `${import.meta.env.BASE_URL}mobile-app/learning-materials.jpg`,
  splashImagePath: `${import.meta.env.BASE_URL}mobile-app/ignis-safe-splash.png`,
  fileName: 'ignis-safe.apk',
  version: '1.0.0 (build 1)',
  size: '223.91 MB',
  compatibility: 'Android 7.1+',
  architecture: '64-bit ARM',
  releaseDate: 'September 1, 2026',
  checksum: '5BA0AE8C9BCEEE54F177CD29ED69291E2CA80F1065633339D9FFAE36CE6CEA56',
};

export default function MobileAppDownloadSection() {
  const { language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const downloadUrl = new URL(MOBILE_APP_RELEASE.downloadPath, window.location.origin).href;

  return (
    <section className="landing-mobile-app" id="mobile-app" aria-labelledby="mobile-app-title">
      <div className="landing-mobile-app-container">
        <div className="landing-mobile-app-device" role="img" aria-label={copy.mobileAppPreviewLabel}>
          <div className="landing-mobile-app-phone-scene" aria-hidden="true">
            <div className="landing-mobile-app-mock-phone is-learning">
              <span className="landing-mobile-app-mock-speaker" />
              <div className="landing-mobile-app-mock-screen">
                <img src={MOBILE_APP_RELEASE.learningImagePath} alt="" />
              </div>
            </div>

            <div className="landing-mobile-app-mock-phone is-splash">
              <span className="landing-mobile-app-mock-speaker" />
              <div className="landing-mobile-app-mock-screen">
                <img src={MOBILE_APP_RELEASE.splashImagePath} alt="" />
              </div>
            </div>
          </div>
        </div>

        <div className="landing-mobile-app-content">
          <h2 id="mobile-app-title">{copy.mobileAppDownloadTitle}</h2>
          <p>{copy.mobileAppDownloadIntro}</p>

          <div className="landing-mobile-app-download-row">
            <a
              href={MOBILE_APP_RELEASE.downloadPath}
              className="landing-mobile-app-download"
              download={MOBILE_APP_RELEASE.fileName}
            >
              {copy.downloadApk}
            </a>

            <dl className="landing-mobile-app-file-info">
              <div><dt>{copy.mobileAppVersion}</dt><dd>{MOBILE_APP_RELEASE.version}</dd></div>
              <div><dt>{copy.mobileAppSize}</dt><dd>{MOBILE_APP_RELEASE.size}</dd></div>
              <div><dt>{copy.mobileAppPlatform}</dt><dd>{MOBILE_APP_RELEASE.compatibility}</dd></div>
              <div><dt>{copy.mobileAppArchitecture}</dt><dd>{MOBILE_APP_RELEASE.architecture}</dd></div>
              <div><dt>{copy.mobileAppFormat}</dt><dd>APK</dd></div>
              <div><dt>{copy.mobileAppReleaseDate}</dt><dd>{MOBILE_APP_RELEASE.releaseDate}</dd></div>
            </dl>
          </div>

          <div className="landing-mobile-app-guidance">
            <figure className="landing-mobile-app-qr">
              <QRCodeSVG
                value={downloadUrl}
                size={116}
                level="M"
                marginSize={0}
                role="img"
                aria-label={copy.mobileAppQrTitle}
              />
              <figcaption>{copy.mobileAppQrScan}</figcaption>
            </figure>

            <div className="landing-mobile-app-instructions">
              <h3>{copy.mobileAppInstallTitle}</h3>
              <ol>
                <li>{copy.mobileAppInstallStepOne}</li>
                <li>{copy.mobileAppInstallStepTwo}</li>
                <li>{copy.mobileAppInstallStepThree}</li>
                <li>{copy.mobileAppInstallStepFour}</li>
              </ol>
            </div>
          </div>

          <details className="landing-mobile-app-checksum">
            <summary>{copy.mobileAppChecksum}</summary>
            <code>{MOBILE_APP_RELEASE.checksum}</code>
          </details>

          <small className="landing-mobile-app-note">{copy.mobileAppReleaseNote}</small>
        </div>
      </div>
    </section>
  );
}
