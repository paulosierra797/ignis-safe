import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Header from './Header';
import HeroSection from './HeroSection';
import AboutSection from './AboutSection';
import ProcessSection from './ProcessSection';
import ContactSection from './ContactSection';
import FAQSection from './FAQSection';
import Footer from './Footer';
import { LandingContentPreviewProvider } from '../context/LandingContentContext';
import './LandingPreview.css';

// Real device widths so the landing page's own @media breakpoints (which are
// viewport-width based, not container-based) kick in exactly like they would
// on an actual device. A plain CSS transform on a div can't trigger those.
const DEVICE_PRESETS = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 834 },
  { id: 'mobile', label: 'Mobile', width: 390 },
];

const MIN_PREVIEW_HEIGHT = 320;

// Blocks link navigation inside the preview (Header's Login link, Footer's
// Terms/Privacy links) so clicking around the preview can't route the admin
// away from the editor. Buttons (FAQ accordion, EN/TL toggles, copy buttons)
// have no default browser action, so they're unaffected and stay interactive.
const blockLinkNavigation = (event) => {
  if (event.target.closest('a')) {
    event.preventDefault();
  }
};

function PreviewFrame({ width, height, onNaturalHeightChange, children }) {
  const iframeRef = useRef(null);
  const [mountNode, setMountNode] = useState(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;

    doc.head.innerHTML = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      doc.head.appendChild(node.cloneNode(true));
    });

    doc.documentElement.style.margin = '0';
    doc.body.style.margin = '0';
    doc.body.innerHTML = '';

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    setMountNode(container);
  }, []);

  useEffect(() => {
    if (!mountNode || !onNaturalHeightChange) return undefined;
    const doc = mountNode.ownerDocument;

    const measure = () => {
      onNaturalHeightChange(Math.ceil(doc.documentElement.scrollHeight));
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(mountNode);
    return () => observer.disconnect();
  }, [mountNode, onNaturalHeightChange]);

  return (
    <>
      <iframe
        ref={iframeRef}
        title="Landing page preview"
        className="landing-preview-iframe"
        style={{ width, height }}
      />
      {mountNode && createPortal(children, mountNode)}
    </>
  );
}

export default function LandingPreview({ content }) {
  const [device, setDevice] = useState('desktop');
  const [naturalHeight, setNaturalHeight] = useState(MIN_PREVIEW_HEIGHT);
  const [scale, setScale] = useState(1);
  const canvasRef = useRef(null);

  const preset = DEVICE_PRESETS.find((item) => item.id === device) || DEVICE_PRESETS[0];
  const frameHeight = Math.max(naturalHeight, MIN_PREVIEW_HEIGHT);

  const handleNaturalHeightChange = useCallback((height) => {
    setNaturalHeight(Math.max(height, MIN_PREVIEW_HEIGHT));
  }, []);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl || typeof ResizeObserver === 'undefined') return undefined;

    const updateScale = () => {
      const availableWidth = canvasEl.clientWidth;
      if (!availableWidth) return;
      setScale(Math.min(1, availableWidth / preset.width));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(canvasEl);
    return () => observer.disconnect();
  }, [preset.width]);

  return (
    <section className="editor-card landing-preview-card">
      <div className="landing-preview-toolbar">
        <div>
          <h3 className="landing-preview-title">Quick Preview</h3>
          <p className="landing-preview-hint">
            Live view of the public landing page, built from your current edits.
          </p>
        </div>
        <div className="landing-preview-devices" role="group" aria-label="Preview screen size">
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
          style={{ width: preset.width * scale, height: frameHeight * scale }}
        >
          <div
            className="landing-preview-scaler"
            style={{ width: preset.width, height: frameHeight, transform: `scale(${scale})` }}
          >
            <PreviewFrame
              width={preset.width}
              height={frameHeight}
              onNaturalHeightChange={handleNaturalHeightChange}
            >
              <LandingContentPreviewProvider content={content}>
                <div className="app" onClickCapture={blockLinkNavigation}>
                  <Header />
                  <HeroSection />
                  <ProcessSection />
                  <AboutSection />
                  <ContactSection />
                  <FAQSection />
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
