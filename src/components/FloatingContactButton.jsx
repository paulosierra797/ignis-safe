import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FiMessageCircle, FiX } from 'react-icons/fi';
import VisitorChat from './VisitorChat';
import './FloatingContactButton.css';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';

const STORAGE_KEY = 'ignis-safe-message-position';
const viewport = () => ({
  left: window.visualViewport?.offsetLeft || 0,
  top: window.visualViewport?.offsetTop || 0,
  width: window.visualViewport?.width || window.innerWidth,
  height: window.visualViewport?.height || window.innerHeight,
});
const bounded = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));

export default function FloatingContactButton() {
  const { language } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(saved?.left) && Number.isFinite(saved?.top) ? saved : null;
    } catch { return null; }
  });
  const [panelPosition, setPanelPosition] = useState({});
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  const positionRef = useRef(position);

  const clampPosition = useCallback((left, top) => {
    const view = viewport();
    const rect = buttonRef.current?.getBoundingClientRect();
    return {
      left: bounded(left, view.left + 8, view.left + view.width - (rect?.width || 48) - 8),
      top: bounded(top, view.top + 8, view.top + view.height - (rect?.height || 48) - 8),
    };
  }, []);

  const updatePosition = useCallback(next => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  const handleDragStart = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const rect = buttonRef.current.getBoundingClientRect();
    suppressClick.current = false;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleDragMove = event => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    suppressClick.current = true;
    updatePosition(clampPosition(drag.left + dx, drag.top + dy));
  };
  const handleDragEnd = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (dragRef.current.moved) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(positionRef.current)); } catch { /* Dragging also works without storage. */ }
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useLayoutEffect(() => {
    const keepInsideViewport = () => {
      if (positionRef.current) updatePosition(clampPosition(positionRef.current.left, positionRef.current.top));
    };
    keepInsideViewport();
    window.addEventListener('resize', keepInsideViewport);
    window.visualViewport?.addEventListener('resize', keepInsideViewport);
    window.visualViewport?.addEventListener('scroll', keepInsideViewport);
    return () => {
      window.removeEventListener('resize', keepInsideViewport);
      window.visualViewport?.removeEventListener('resize', keepInsideViewport);
      window.visualViewport?.removeEventListener('scroll', keepInsideViewport);
    };
  }, [clampPosition, updatePosition]);

  useLayoutEffect(() => {
    if (!open) return;
    const placePanel = () => {
      const anchor = buttonRef.current.getBoundingClientRect();
      const panel = panelRef.current.getBoundingClientRect();
      const view = viewport();
      const above = anchor.top - panel.height - 12;
      setPanelPosition({
        left: bounded(anchor.right - panel.width, view.left + 8, view.left + view.width - panel.width - 8),
        top: bounded(above >= view.top + 8 ? above : anchor.bottom + 12, view.top + 8, view.top + view.height - panel.height - 8),
        maxHeight: Math.max(100, view.height - 80),
      });
    };
    placePanel();
    const observer = new ResizeObserver(placePanel);
    observer.observe(panelRef.current);
    window.addEventListener('resize', placePanel);
    window.visualViewport?.addEventListener('resize', placePanel);
    window.visualViewport?.addEventListener('scroll', placePanel);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', placePanel);
      window.visualViewport?.removeEventListener('resize', placePanel);
      window.visualViewport?.removeEventListener('scroll', placePanel);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const escape = event => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);

  const widgetStyle = open
    ? undefined
    : position
      ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' }
      : undefined;

  return <div className={`floating-contact-widget${open ? ' is-open' : ''}`} style={widgetStyle}>
    {open && <div ref={panelRef} className="floating-contact-panel" id="floating-contact-panel" style={panelPosition}>
      <VisitorChat variant="compact" active onClose={() => { setOpen(false); buttonRef.current?.focus(); }} />
    </div>}
    <button ref={buttonRef} type="button" className="floating-contact-button"
      onPointerDown={handleDragStart} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerCancel={handleDragEnd} onLostPointerCapture={handleDragEnd}
      onClick={event => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } setOpen(value => !value); }}
      aria-label={open ? copy.close : copy.messageUs} title={open ? copy.close : copy.messageUs} aria-expanded={open} aria-controls="floating-contact-panel">
      {open ? <FiX aria-hidden="true" /> : <FiMessageCircle aria-hidden="true" />}
    </button>
  </div>;
}
