import React, { useEffect, useState } from 'react';
import ModuleRecommendations from './ModuleRecommendations';
import './AIRecommendationsDialog.css';

export default function AIRecommendationsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="ai-recommendations-fab"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="ai-recommendations-fab-icon" aria-hidden="true">✦</span>
        <span>AI Recommendations</span>
      </button>

      {isOpen && (
        <div
          className="ai-recommendations-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
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
              <button
                type="button"
                className="ai-recommendations-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close AI recommendations"
              >
                ×
              </button>
            </div>
            <div className="ai-recommendations-dialog-body">
              <ModuleRecommendations />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
