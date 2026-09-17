import { QRCodeSVG } from 'qrcode.react';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';
import './MobileAppDownloadSection.css';

const MOBILE_APP_RELEASE = {
  downloadPath: 'https://github.com/andreii2404/ignis-safe-mobile-releases/releases/download/v1.0.0/IGNIS-SAFE-v1.0.0.apk',
  learningImagePath: `${import.meta.env.BASE_URL}mobile-app/learning-materials.jpg`,
  splashImagePath: `${import.meta.env.BASE_URL}mobile-app/ignis-safe-splash.png`,
  fileName: 'IGNIS-SAFE-v1.0.0.apk',
};

export default function MobileAppDownloadSection() {
  const { content, language } = useLandingContent();
  const copy = { ...getLandingUiCopy(language), ...(content.copy?.[language] || {}) };
  const downloadUrl = new URL(MOBILE_APP_RELEASE.downloadPath, window.location.origin).href;
  const learningImage = content.media?.mobileLearningPhoto?.url || MOBILE_APP_RELEASE.learningImagePath;
  const splashImage = content.media?.mobileSplashPhoto?.url || MOBILE_APP_RELEASE.splashImagePath;
  const release = content.mobileRelease || {};
  const installStepTwo = copy.mobileAppInstallStepTwo.replace(
    /[\w.-]+\.apk/gi,
    MOBILE_APP_RELEASE.fileName,
  );

  return (
    <section className="landing-mobile-app" id="mobile-app" aria-labelledby="mobile-app-title">
      <div className="landing-mobile-app-container">
        <div className="landing-mobile-app-device" role="img" aria-label={copy.mobileAppPreviewLabel}>
          <div className="landing-mobile-app-phone-scene" aria-hidden="true">
            <div className="landing-mobile-app-mock-phone is-learning">
              <span className="landing-mobile-app-mock-speaker" />
              <div className="landing-mobile-app-mock-screen">
                <img src={learningImage} alt="" data-landing-edit-image="media.mobileLearningPhoto" data-landing-edit-label="Learning screen image" />
              </div>
            </div>

            <div className="landing-mobile-app-mock-phone is-splash">
              <span className="landing-mobile-app-mock-speaker" />
              <div className="landing-mobile-app-mock-screen">
                <img src={splashImage} alt="" data-landing-edit-image="media.mobileSplashPhoto" data-landing-edit-label="Splash screen image" />
              </div>
            </div>
          </div>
        </div>

        <div className="landing-mobile-app-content">
          <h2 id="mobile-app-title" data-landing-edit-path={`copy.${language}.mobileAppDownloadTitle`} data-landing-edit-label="Mobile app section title">{copy.mobileAppDownloadTitle}</h2>
          <p data-landing-edit-path={`copy.${language}.mobileAppDownloadIntro`} data-landing-edit-label="Mobile app section introduction" data-landing-edit-multiline="true">{copy.mobileAppDownloadIntro}</p>

          <div className="landing-mobile-app-download-row">
            <a
              href={downloadUrl}
              className="landing-mobile-app-download"
              download={MOBILE_APP_RELEASE.fileName}
            >
              <span data-landing-edit-path={`copy.${language}.downloadApk`} data-landing-edit-label="APK download button label">{copy.downloadApk}</span>
            </a>

            <dl className="landing-mobile-app-file-info">
              <div><dt data-landing-edit-path={`copy.${language}.mobileAppVersion`} data-landing-edit-label="Version label">{copy.mobileAppVersion}</dt><dd data-landing-edit-path="mobileRelease.version" data-landing-edit-label="Mobile app version">{release.version}</dd></div>
              <div><dt data-landing-edit-path={`copy.${language}.mobileAppSize`} data-landing-edit-label="Download size label">{copy.mobileAppSize}</dt><dd data-landing-edit-path="mobileRelease.size" data-landing-edit-label="APK download size">{release.size}</dd></div>
              <div><dt data-landing-edit-path={`copy.${language}.mobileAppPlatform`} data-landing-edit-label="Platform label">{copy.mobileAppPlatform}</dt><dd data-landing-edit-path="mobileRelease.compatibility" data-landing-edit-label="Android compatibility">{release.compatibility}</dd></div>
              <div><dt data-landing-edit-path={`copy.${language}.mobileAppArchitecture`} data-landing-edit-label="Device type label">{copy.mobileAppArchitecture}</dt><dd data-landing-edit-path="mobileRelease.architecture" data-landing-edit-label="Supported device type">{release.architecture}</dd></div>
              <div><dt data-landing-edit-path={`copy.${language}.mobileAppFormat`} data-landing-edit-label="File format label">{copy.mobileAppFormat}</dt><dd data-landing-edit-path="mobileRelease.format" data-landing-edit-label="Application file format">{release.format}</dd></div>
              <div><dt data-landing-edit-path={`copy.${language}.mobileAppReleaseDate`} data-landing-edit-label="Release date label">{copy.mobileAppReleaseDate}</dt><dd data-landing-edit-path="mobileRelease.releaseDate" data-landing-edit-label="Application release date">{release.releaseDate}</dd></div>
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
              <figcaption data-landing-edit-path={`copy.${language}.mobileAppQrScan`} data-landing-edit-label="QR code caption">{copy.mobileAppQrScan}</figcaption>
            </figure>

            <div className="landing-mobile-app-instructions">
              <h3 data-landing-edit-path={`copy.${language}.mobileAppInstallTitle`} data-landing-edit-label="Installation instructions title">{copy.mobileAppInstallTitle}</h3>
              <ol>
                <li data-landing-edit-path={`copy.${language}.mobileAppInstallStepOne`} data-landing-edit-label="Installation step 1">{copy.mobileAppInstallStepOne}</li>
                <li data-landing-edit-path={`copy.${language}.mobileAppInstallStepTwo`} data-landing-edit-label="Installation step 2">{installStepTwo}</li>
                <li data-landing-edit-path={`copy.${language}.mobileAppInstallStepThree`} data-landing-edit-label="Installation step 3">{copy.mobileAppInstallStepThree}</li>
                <li data-landing-edit-path={`copy.${language}.mobileAppInstallStepFour`} data-landing-edit-label="Installation step 4">{copy.mobileAppInstallStepFour}</li>
              </ol>
            </div>
          </div>

          <small className="landing-mobile-app-note" data-landing-edit-path={`copy.${language}.mobileAppReleaseNote`} data-landing-edit-label="APK safety note" data-landing-edit-multiline="true">{copy.mobileAppReleaseNote}</small>
        </div>
      </div>
    </section>
  );
}
