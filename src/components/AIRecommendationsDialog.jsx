import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { FiChevronRight, FiMessageSquare } from 'react-icons/fi';
import ModuleRecommendations from './ModuleRecommendations';
import CloseButton from './CloseButton';
import './AIRecommendationsDialog.css';

gsap.registerPlugin(useGSAP);

export default function AIRecommendationsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('ignis-recommendations-collapsed') === 'true'; } catch { return false; }
  });
  const panelRef = useRef(null);
  const launcherRef = useRef(null);

  const collapse = () => {
    setCollapsed(true);
    try { localStorage.setItem('ignis-recommendations-collapsed', 'true'); } catch { /* Storage may be disabled. */ }
    launcherRef.current?.focus();
  };

  useGSAP(() => {
    if (!isOpen || !panelRef.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(panelRef.current, { x: 12, opacity: 0 }, {
        x: 0, opacity: 1, duration: 0.22, ease: 'power2.out', clearProps: 'transform,opacity',
      });
    });
    return () => media.revert();
  }, { dependencies: [isOpen], revertOnUpdate: true });

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      const activeDialog = event.target instanceof Element ? event.target.closest('[aria-modal="true"]') : null;
      if (activeDialog && activeDialog !== panelRef.current) return;
      if (event.key === 'Escape') setIsOpen(false);
      if (event.key === 'Tab' && panelRef.current) {
        const controls = [...panelRef.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)')];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };

    const previousOverflow = document.body.style.overflow;
    const launcher = launcherRef.current;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);
    panelRef.current?.querySelector('button')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
      launcher?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <div className={`ai-recommendations-launcher${collapsed ? ' is-collapsed' : ''}`}>
      <button
        ref={launcherRef}
        type="button"
        className="ai-recommendations-fab"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Open AI recommendations"
        title="AI Recommendations"
      >
        <FiMessageSquare aria-hidden="true" />
        {!collapsed && <span>AI Recommendations</span>}
      </button>
      {!collapsed && <button type="button" className="ai-recommendations-collapse"
        onClick={collapse} aria-label="Collapse recommendations shortcut" title="Collapse recommendations shortcut">
        <FiChevronRight aria-hidden="true" />
      </button>}
      </div>

      {isOpen && createPortal((
        <div
          className="ai-recommendations-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            ref={panelRef}
            className="ai-recommendations-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-recommendations-title"
          >
            <div className="ai-recommendations-dialog-header">
              <div>
                <span className="ai-recommendations-eyebrow">AI insights</span>
                <h2 id="ai-recommendations-title">Module Recommendations</h2>
              </div>
              <CloseButton
                className="ai-recommendations-close"
                onClick={() => setIsOpen(false)}
                label="Close AI recommendations"
              />
            </div>
            <div className="ai-recommendations-dialog-body">
              <ModuleRecommendations />
            </div>
          </section>
        </div>
      ), document.body)}
    </>
  );
}
