import React, { useCallback, useEffect, useRef, useState } from 'react';
import './StationHouseRulesModal.css';

// Station House Rules & Personnel Guidelines gate for Personnel attendance.
//
// Behaviour required by the flow:
//  - Only the rules content area scrolls; header and action buttons stay fixed.
//  - The acknowledgement checkbox stays disabled until the personnel has
//    scrolled to the very bottom of the rules.
//  - "Acknowledge & Time In" / "Acknowledge & Time Out" stays disabled until the
//    checkbox is checked.
//  - Cancel / closing the modal records nothing.
//
// `mode` is 'in' (start-of-duty acknowledgement) or 'out' (end-of-duty
// attestation that the rules were complied with during the shift).
const MODE_COPY = {
  in: {
    intro: 'Please read the guidelines below. Your Time In is recorded only after you acknowledge them.',
    checkbox:
      'I acknowledge that I have read and understood the Station House Rules and Personnel Guidelines and agree to comply with them while on duty.',
    action: 'Acknowledge & Time In'
  },
  out: {
    intro: 'Please read the guidelines below. Your Time Out is recorded only after you acknowledge them.',
    checkbox:
      'I acknowledge that I have read and understood the Station House Rules and Personnel Guidelines and have complied with them during my duty.',
    action: 'Acknowledge & Time Out'
  }
};

const StationHouseRulesModal = ({ mode = 'in', onCancel, onAcknowledge, isProcessing }) => {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const scrollRef = useRef(null);
  const copy = MODE_COPY[mode] || MODE_COPY.in;

  const evaluateScroll = useCallback((element) => {
    if (!element) return;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    // Treat "content fits without scrolling" as already read, otherwise the
    // checkbox could never be enabled on very large screens.
    if (remaining <= 8) {
      setScrolledToBottom(true);
    }
  }, []);

  useEffect(() => {
    // Re-check once mounted/laid out in case the rules already fit on screen.
    const frame = window.requestAnimationFrame(() => evaluateScroll(scrollRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [evaluateScroll]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isProcessing) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isProcessing, onCancel]);

  const canAcknowledge = acknowledged && scrolledToBottom && !isProcessing;

  return (
    <div
      className="house-rules-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isProcessing) onCancel();
      }}
    >
      <section
        className="house-rules-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="houseRulesTitle"
      >
        <header className="house-rules-header">
          <span className="house-rules-eyebrow">IGNIS SAFE · Personnel</span>
          <h2 id="houseRulesTitle">Station House Rules &amp; Personnel Guidelines</h2>
          <p>{copy.intro}</p>
        </header>

        <div
          className="house-rules-content"
          ref={scrollRef}
          onScroll={(event) => evaluateScroll(event.currentTarget)}
          tabIndex={0}
        >
          <h3>Station and Equipment Rules</h3>
          <ul>
            <li>
              <strong>Keep apparatus bays clear:</strong> Park fire trucks and rescue vehicles
              properly, with equipment ready for immediate dispatch.
            </li>
            <li>
              <strong>Inspect equipment daily:</strong> Check water levels, hoses, tools, and other
              equipment during every shift change.
            </li>
            <li>
              <strong>Maintain cleanliness:</strong> Keep the mess hall, sleeping quarters, work
              areas, and restrooms clean after use.
            </li>
            <li>
              <strong>Secure hazardous materials:</strong> Store fuel, chemicals, spare
              extinguishers, and other hazardous materials only in designated and properly
              ventilated storage areas.
            </li>
          </ul>

          <h3>Personnel and Conduct Rules</h3>
          <ul>
            <li>
              <strong>Be on time:</strong> Personnel must report to the station on time and attend
              required briefings or formations.
            </li>
            <li>
              <strong>Wear proper uniform:</strong> Wear the prescribed BFP or authorized fire
              brigade uniform and appropriate personal protective equipment (PPE) while on duty.
            </li>
            <li>
              <strong>Be ready for emergency response:</strong> Personnel must remain prepared to
              respond immediately whenever an emergency alarm or dispatch is received.
            </li>
            <li>
              <strong>Log all calls and visitors:</strong> Properly record emergency calls,
              dispatches, visitors, and other required station activities in the official station
              logbook.
            </li>
            <li>
              <strong>Observe the chain of command:</strong> Report operational updates, incidents,
              concerns, and issues to the appropriate shift-in-charge or authorized superior.
            </li>
          </ul>

          <div className="house-rules-end-marker" aria-hidden="true" />
        </div>

        <div className="house-rules-ack">
          {!scrolledToBottom && (
            <p className="house-rules-scroll-hint">
              Please scroll through the entire Station House Rules before acknowledging.
            </p>
          )}
          <label className={`house-rules-checkbox ${scrolledToBottom ? '' : 'is-disabled'}`}>
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={!scrolledToBottom || isProcessing}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{copy.checkbox}</span>
          </label>
        </div>

        <footer className="house-rules-footer">
          <button
            type="button"
            className="house-rules-cancel"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="house-rules-approve"
            onClick={() => onAcknowledge({ acknowledgedAt: new Date().toISOString() })}
            disabled={!canAcknowledge}
          >
            {isProcessing ? 'Recording...' : copy.action}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default StationHouseRulesModal;
