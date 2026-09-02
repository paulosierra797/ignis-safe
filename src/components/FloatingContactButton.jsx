import { useCallback, useEffect, useRef, useState } from 'react';
import { FiMessageCircle, FiMove, FiRotateCcw, FiX } from 'react-icons/fi';
import VisitorChat from './VisitorChat';
import './FloatingContactButton.css';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';

export default function FloatingContactButton() {
  const { language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(() => {
    try {
      const saved = window.localStorage.getItem('ignis-safe-message-position');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const widgetRef = useRef(null);
  const dragRef = useRef(null);

  const clampPosition = useCallback((left, top) => {
    const rect = widgetRef.current?.getBoundingClientRect();
    const width = rect?.width || 48;
    const height = rect?.height || 48;
    const edge = 8;

    return {
      left: Math.min(Math.max(edge, left), Math.max(edge, window.innerWidth - width - edge)),
      top: Math.min(Math.max(edge, top), Math.max(edge, window.innerHeight - height - edge)),
    };
  }, []);

  const savePosition = useCallback((nextPosition) => {
    setPosition(nextPosition);
    try {
      window.localStorage.setItem('ignis-safe-message-position', JSON.stringify(nextPosition));
    } catch {
      // The widget still moves when browser storage is unavailable.
    }
  }, []);

  const handleDragStart = (event) => {
    if (event.button !== 0) return;
    const rect = widgetRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleDragMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    savePosition(clampPosition(
      event.clientX - drag.offsetX,
      event.clientY - drag.offsetY
    ));
  };

  const handleDragEnd = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resetPosition = () => {
    setPosition(null);
    try {
      window.localStorage.removeItem('ignis-safe-message-position');
    } catch {
      // Resetting the current view still works without browser storage.
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  useEffect(() => {
    if (!position) return undefined;
    const keepInsideViewport = () => {
      setPosition((current) => current ? clampPosition(current.left, current.top) : null);
    };
    window.addEventListener('resize', keepInsideViewport);
    return () => window.removeEventListener('resize', keepInsideViewport);
  }, [clampPosition, position]);

  const widgetStyle = position
    ? { left: `${position.left}px`, top: `${position.top}px`, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <div
      className={`floating-contact-widget ${open ? 'is-open' : ''}`}
      ref={widgetRef}
      style={widgetStyle}
    >
      {open && (
        <div className="floating-contact-panel" id="floating-contact-panel">
          <div
            className="floating-contact-dragbar"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            <FiMove aria-hidden="true" />
            <span>Move message box</span>
            {position && (
              <button
                type="button"
                className="floating-contact-reset"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={resetPosition}
                aria-label="Reset message box position"
                title="Reset position"
              >
                <FiRotateCcw aria-hidden="true" />
              </button>
            )}
          </div>
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
