import { useEffect, useRef, useState } from 'react';
import { FiMessageCircle, FiX } from 'react-icons/fi';
import VisitorChat from './VisitorChat';
import './FloatingContactButton.css';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';

export default function FloatingContactButton() {
  const { language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const [open, setOpen] = useState(false);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  return (
    <div className={`floating-contact-widget ${open ? 'is-open' : ''}`} ref={widgetRef}>
      {open && (
        <div className="floating-contact-panel" id="floating-contact-panel">
          <VisitorChat variant="compact" active onClose={() => setOpen(false)} />
        </div>
      )}

      <button
        type="button"
        className="floating-contact-button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? copy.close : copy.messageUs}
        aria-expanded={open}
        aria-controls="floating-contact-panel"
      >
        <span className="floating-contact-button-dot" aria-hidden="true">
          {open ? <FiX /> : <FiMessageCircle />}
        </span>
        <span className="floating-contact-button-label">{open ? copy.close : copy.messageUs}</span>
      </button>
    </div>
  );
}
