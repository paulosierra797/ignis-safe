import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiEdit3 } from 'react-icons/fi';
import Header from './Header';
import HeroSection from './HeroSection';
import TrustAccessibilitySection from './TrustAccessibilitySection';
import MobileAppDownloadSection from './MobileAppDownloadSection';
import LandingAnnouncements from './LandingAnnouncements';
import ProcessSection from './ProcessSection';
import AboutSection from './AboutSection';
import ContactSection from './ContactSection';
import FAQSection from './FAQSection';
import Footer from './Footer';
import { LandingContentPreviewProvider } from '../context/LandingContentContext';
import './LandingPreview.css';

const DEVICE_PRESETS = [
  { id: 'desktop', label: 'Desktop', width: 1280, height: 720 },
  { id: 'tablet', label: 'Tablet', width: 834, height: 780 },
  { id: 'mobile', label: 'Mobile', width: 390, height: 780 },
];

const blockLinkNavigation = (event) => {
  const link = event.target.closest('a');
  if (!link) return;

  event.preventDefault();
  event.stopPropagation();

  const href = link.getAttribute('href') || '';
  const hashIndex = href.indexOf('#');
  if (hashIndex < 0) return;

  const sectionId = decodeURIComponent(href.slice(hashIndex + 1));
  const section = sectionId ? link.ownerDocument.getElementById(sectionId) : null;
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function PreviewFrame({ width, height, children }) {
  const iframeRef = useRef(null);
  const [mountNode, setMountNode] = useState(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    doc.head.innerHTML = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      doc.head.appendChild(node.cloneNode(true));
    });

    doc.documentElement.style.margin = '0';
    doc.documentElement.style.height = '100%';
    doc.body.style.margin = '0';
    doc.body.style.minHeight = '100%';
    doc.body.innerHTML = '';

    const container = doc.createElement('div');
    container.style.minHeight = '100%';
    doc.body.appendChild(container);
    setMountNode(container);
  }, []);

  return (
    <>
      <iframe
        ref={iframeRef}
        title="Live landing page editor"
        className="landing-preview-iframe"
        sandbox="allow-same-origin"
        style={{ width, height }}
      />
      {mountNode && createPortal(children, mountNode)}
    </>
  );
}

function EditablePreviewSection({ label, sectionKey, onEditSection, children }) {
  return (
    <div className="landing-preview-editable-section">
      {children}
      <button
        type="button"
        className="landing-preview-edit-action"
        onClick={() => onEditSection?.(sectionKey)}
        aria-label={`Edit ${label}`}
      >
        <FiEdit3 aria-hidden="true" />
        <span>{label}</span>
      </button>
    </div>
  );
}

export default function LandingPreview({ content, editorMode = false, onEditSection }) {
  const [device, setDevice] = useState('desktop');
  const [scale, setScale] = useState(1);
  const canvasRef = useRef(null);

  const preset = DEVICE_PRESETS.find((item) => item.id === device) || DEVICE_PRESETS[0];

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl || typeof ResizeObserver === 'undefined') return undefined;

    const updateScale = () => {
      const availableWidth = canvasEl.clientWidth - 32;
      if (!availableWidth) return;
      setScale(Math.min(1, availableWidth / preset.width));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(canvasEl);
    return () => observer.disconnect();
  }, [preset.width]);

  const renderSection = (sectionKey, label, section) => (
    editorMode ? (
      <EditablePreviewSection
        key={sectionKey}
        label={label}
        sectionKey={sectionKey}
        onEditSection={onEditSection}
      >
        {section}
      </EditablePreviewSection>
    ) : section
  );

  return (
    <section className="editor-card landing-preview-card">
      <div className="landing-preview-toolbar">
        <div>
          <h3 className="landing-preview-title">Live Landing Page</h3>
          <p className="landing-preview-hint">
            Scroll through the real page and select a section to edit its published content.
          </p>
        </div>
        <div className="landing-preview-devices" role="group" aria-label="Landing page screen size">
          {DEVICE_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`landing-preview-device-btn${device === item.id ? ' is-active' : ''}`}
              onClick={() => setDevice(item.id)}
              aria-pressed={device === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="landing-preview-canvas" ref={canvasRef}>
        <div
          className="landing-preview-stage"
          style={{ width: preset.width * scale, height: preset.height * scale }}
        >
          <div
            className="landing-preview-scaler"
            style={{ width: preset.width, height: preset.height, transform: `scale(${scale})` }}
          >
            <PreviewFrame width={preset.width} height={preset.height}>
              <LandingContentPreviewProvider content={content}>
                <div className="app landing-preview-app" onClickCapture={blockLinkNavigation}>
                  <Header />
                  <main id="main-content">
                    {renderSection('hero', 'Edit Main Banner', <HeroSection />)}
                    {renderSection('trust', 'Edit Trust Section', <TrustAccessibilitySection />)}
                    <MobileAppDownloadSection />
                    {renderSection('announcements', 'Manage Announcements', <LandingAnnouncements />)}
                    {renderSection('process', 'Edit Application Process', <ProcessSection />)}
                    {renderSection('about', 'Edit About Section', <AboutSection />)}
                    {renderSection('contact', 'Edit Contact Details', <ContactSection />)}
                    {renderSection('faq', 'Edit FAQs', <FAQSection />)}
                  </main>
                  <Footer />
                </div>
              </LandingContentPreviewProvider>
            </PreviewFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
