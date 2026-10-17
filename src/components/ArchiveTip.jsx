import { Children, cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { FiInfo } from 'react-icons/fi';
import './ArchiveTip.css';

const TOUCH_HIDE_MS = 3200;
const GAP = 10;
const EDGE = 8;

// Short explanation shown on hover, keyboard focus, or tap. Wrap any element
// (`<Tip text="…"><button>…</button></Tip>`), or use `info` to add a small
// "i" button next to a label (`<Tip info label="Section" text="…" />`).
export default function Tip({ text, children, info = false, label = '' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, below: false });
  const anchorRef = useRef(null);
  const bubbleRef = useRef(null);
  const timerRef = useRef(0);
  const tooltipId = useId();

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Place above the trigger when there is room, otherwise below; keep inside the screen.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !bubbleRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const bubble = bubbleRef.current.getBoundingClientRect();
    const below = anchor.top - bubble.height - GAP < EDGE;
    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2 - bubble.width / 2, EDGE),
      window.innerWidth - bubble.width - EDGE
    );
    setPosition({ left, top: below ? anchor.bottom + GAP : anchor.top - bubble.height - GAP, below });
  }, [open, text]);

  useEffect(() => {
    if (!open) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(bubbleRef.current, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' });
    });
    const onKeyDown = (event) => {
      if (event.key === 'Escape') hide();
    };
    const onOutside = (event) => {
      if (!anchorRef.current?.contains(event.target)) hide();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      media.revert();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  if (!text) return children ?? null;

  const handlers = {
    onPointerEnter: (event) => {
      if (event.pointerType === 'mouse') show();
    },
    onPointerLeave: (event) => {
      if (event.pointerType === 'mouse') hide();
    },
    onPointerDown: (event) => {
      if (event.pointerType !== 'touch' || info) return;
      show();
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(hide, TOUCH_HIDE_MS);
    },
    onFocus: (event) => {
      if (event.target.matches?.(':focus-visible')) show();
    },
    onBlur: hide
  };

  const bubble = createPortal(
    <span
      ref={bubbleRef}
      id={tooltipId}
      role="tooltip"
      className="at-tip-bubble"
      hidden={!open}
      style={{ top: position.top, left: position.left }}
    >
      {text}
    </span>,
    document.body
  );

  if (info) {
    return (
      <span ref={anchorRef} className="at-tip-anchor at-tip-anchor--info" {...handlers}>
        {label}
        <button
          type="button"
          className="at-info"
          aria-label={`About ${label || 'this'}`}
          aria-describedby={tooltipId}
          aria-expanded={open}
          onClick={() => (open ? hide() : show())}
        >
          <FiInfo aria-hidden="true" />
        </button>
        {bubble}
      </span>
    );
  }

  const child = Children.only(children);
  return (
    <span ref={anchorRef} className="at-tip-anchor" {...handlers}>
      {cloneElement(child, { 'aria-describedby': [child.props['aria-describedby'], tooltipId].filter(Boolean).join(' ') })}
      {bubble}
    </span>
  );
}
