import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Hint.css';

const GAP = 10;
const VIEWPORT_MARGIN = 8;

// Readable content a tooltip should avoid covering.
const AVOID_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,label,th,button,a,select,input,strong,[data-hint-avoid]';

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

const overlapArea = (a, b) => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

// Tight bounds of an element's text, so block-level headings do not count their empty width.
const getContentRect = (element) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
};

/**
 * Picks the safest spot for a tooltip: beside, below or above the anchor,
 * whichever covers the least readable content and stays inside the viewport.
 */
function computePosition(anchor, tipWidth, tipHeight) {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxX = vw - tipWidth - VIEWPORT_MARGIN;
  const maxY = vh - tipHeight - VIEWPORT_MARGIN;
  const centerY = rect.top + rect.height / 2 - tipHeight / 2;
  const centerX = rect.left + rect.width / 2 - tipWidth / 2;

  // Listed in order of preference; the first lowest-scoring spot wins.
  const candidates = [
    { left: rect.right + GAP, top: centerY },
    { left: rect.left, top: rect.bottom + GAP },
    { left: rect.left - GAP - tipWidth, top: centerY },
    { left: rect.left, top: rect.top - GAP - tipHeight },
    { left: centerX, top: rect.bottom + GAP },
    { left: rect.right - tipWidth, top: rect.bottom + GAP },
    { left: centerX, top: rect.top - GAP - tipHeight },
    { left: rect.right - tipWidth, top: rect.top - GAP - tipHeight },
  ];

  const obstacles = Array.from(document.querySelectorAll(AVOID_SELECTOR))
    .filter((el) => !el.contains(anchor) && !anchor.contains(el))
    .map(getContentRect)
    .filter((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh);

  let best = null;
  candidates.forEach((candidate) => {
    const left = clamp(candidate.left, VIEWPORT_MARGIN, maxX);
    const top = clamp(candidate.top, VIEWPORT_MARGIN, maxY);
    const box = { left, top, right: left + tipWidth, bottom: top + tipHeight };
    // Clamping drags a tooltip off its intended side or back over its anchor; penalise that.
    const shift = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
    const coversAnchor = overlapArea(box, rect) > 0 ? 1e6 : 0;
    const score = obstacles.reduce((sum, r) => sum + overlapArea(box, r), 0) + shift * 50 + coversAnchor;
    if (!best || score < best.score) best = { left, top, score };
  });

  return best;
}

/**
 * Hover/focus explanation for a heading or label. The text lives in a compact
 * tooltip instead of permanently visible copy. It is placed beside, below or
 * above the item (never on top of it) and is focusable for keyboard and touch.
 * `placement` is kept for API compatibility; the position is chosen automatically.
 */
export default function Hint({ text, children, placement = 'top', className = '' }) {
  const id = useId();
  const anchorRef = useRef(null);
  const tipRef = useRef(null);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    const tip = tipRef.current;
    const position = computePosition(anchorRef.current, tip.offsetWidth, tip.offsetHeight);
    if (!position) return;
    tip.style.left = `${position.left}px`;
    tip.style.top = `${position.top}px`;
    tip.style.visibility = 'visible';
  }, [open, text]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, hide]);

  if (!text) return <span className={className}>{children}</span>;

  return (
    <span
      ref={anchorRef}
      className={`hint hint--${placement} ${className}`.trim()}
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && createPortal(
        <span id={id} ref={tipRef} role="tooltip" className="hint-tip">{text}</span>,
        document.body,
      )}
    </span>
  );
}
