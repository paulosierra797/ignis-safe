import { useEffect, useId, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function PublicTrendsCarousel({ language, children }) {
  const id = useId();
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  const [position, setPosition] = useState({ previous: false, next: false, progress: 0, offset: 0, visible: 1 });
  const filipino = language === 'tagalog';
  const previousLabel = filipino ? 'Nakaraang graph' : 'Previous graph';
  const nextLabel = filipino ? 'Susunod na graph' : 'Next graph';

  useEffect(() => {
    const track = trackRef.current;
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = track.scrollWidth - track.clientWidth;
        setPosition({
          previous: track.scrollLeft > 2,
          next: track.scrollLeft < max - 2,
          progress: max > 0 ? Math.round(track.scrollLeft / max * 100) : 0,
          offset: track.scrollLeft / track.scrollWidth * 100,
          visible: track.clientWidth / track.scrollWidth,
        });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(track);
    Array.from(track.children).forEach((child) => observer.observe(child));
    track.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      track.removeEventListener('scroll', update);
    };
  }, []);

  const scrollTo = (left) => {
    trackRef.current.scrollTo({ left, behavior: reducedMotion() ? 'instant' : 'smooth' });
  };

  const step = (direction) => {
    const track = trackRef.current;
    const cards = Array.from(track.children);
    const origin = cards[0].offsetLeft;
    const stops = cards.map((card) => Math.min(card.offsetLeft - origin, track.scrollWidth - track.clientWidth));
    const target = direction > 0
      ? stops.find((stop) => stop > track.scrollLeft + 2)
      : stops.findLast((stop) => stop < track.scrollLeft - 2);
    if (target !== undefined) scrollTo(target);
  };

  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    const track = trackRef.current;
    track.classList.remove('is-dragging');
    if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    if (!drag.moved) return;
    const origin = track.firstElementChild.offsetLeft;
    const stops = Array.from(track.children, (card) => (
      Math.min(card.offsetLeft - origin, track.scrollWidth - track.clientWidth)
    ));
    const closest = stops.reduce((best, stop) => (
      Math.abs(stop - track.scrollLeft) < Math.abs(best - track.scrollLeft) ? stop : best
    ));
    scrollTo(closest);
  };

  return (
    <div className="trends-carousel" role="region" aria-roledescription="carousel"
      aria-label={filipino ? 'Mga graph ng komunidad' : 'Community trend graphs'}>
      <div className="trends-carousel-controls">
        <button type="button" aria-label={previousLabel} title={previousLabel} aria-controls={id}
          disabled={!position.previous} onClick={() => step(-1)}>
          <FiChevronLeft aria-hidden="true" />
        </button>
        <button type="button" aria-label={nextLabel} title={nextLabel} aria-controls={id}
          disabled={!position.next} onClick={() => step(1)}>
          <FiChevronRight aria-hidden="true" />
        </button>
      </div>
      <div id={id} ref={trackRef} className="trends-grid" tabIndex={0}
        aria-label={filipino ? 'Mga graph' : 'Graphs'}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            step(event.key === 'ArrowRight' ? 1 : -1);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            scrollTo(event.key === 'Home' ? 0 : event.currentTarget.scrollWidth);
          }
        }}
        onPointerDown={(event) => {
          suppressClick.current = false;
          dragRef.current = null;
          if (event.pointerType !== 'mouse' || event.button !== 0
            || event.target.closest('button, a, input, select, textarea')) return;
          dragRef.current = {
            id: event.pointerId, x: event.clientX, y: event.clientY,
            left: event.currentTarget.scrollLeft, moved: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== event.pointerId) return;
          if (!(event.buttons & 1)) {
            dragRef.current = null;
            return;
          }
          const distance = event.clientX - drag.x;
          if (!drag.moved) {
            if (Math.abs(distance) < 6) return;
            if (Math.abs(event.clientY - drag.y) > Math.abs(distance)) {
              dragRef.current = null;
              return;
            }
            drag.moved = true;
            suppressClick.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.classList.add('is-dragging');
          }
          event.preventDefault();
          event.currentTarget.scrollLeft = drag.left - distance;
        }}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}>
        {children}
      </div>
      <div className="trends-carousel-position" role="progressbar"
        aria-label={filipino ? 'Posisyon ng mga graph' : 'Graph scroll position'}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={position.progress}>
        <span style={{ transform: `translateX(${position.offset}%) scaleX(${position.visible})` }} />
      </div>
    </div>
  );
}
