import React, { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { FiArrowRight, FiRefreshCw } from 'react-icons/fi';
import { translateContent } from '../utils/translationClient';
import {
  applyTranslationResults,
  collectTranslationPairs,
  countExistingTranslationTargets,
} from '../utils/translationUtils';
import './TranslationControls.css';

const DIRECTIONS = [
  { sourceLanguage: 'en', targetLanguage: 'fil', sourceLabel: 'English', targetLabel: 'Filipino' },
  { sourceLanguage: 'fil', targetLanguage: 'en', sourceLabel: 'Filipino', targetLabel: 'English' },
];

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

export default function TranslationControls({
  value,
  onChange,
  section,
  compact = false,
  scopeLabel = 'Translation assistant',
  helperText,
  summarizeAffected,
}) {
  const [busyDirection, setBusyDirection] = useState('');
  const [status, setStatus] = useState(null);
  const statusRef = useRef(null);
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  const revealStatus = () => {
    if (!statusRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(statusRef.current, { autoAlpha: 0, y: 5 }, {
      autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out', clearProps: 'transform,opacity,visibility',
    });
  };

  const handleTranslate = async (direction) => {
    const pairs = collectTranslationPairs(value, direction.sourceLanguage, direction.targetLanguage);
    const skipped = countExistingTranslationTargets(value, direction.sourceLanguage, direction.targetLanguage);
    if (pairs.length === 0) {
      setStatus({
        type: 'info',
        text: skipped > 0
          ? `Nothing to translate. ${skipped} existing translation${skipped === 1 ? '' : 's'} stayed unchanged.`
          : `Add ${direction.sourceLabel} text to a blank paired field first.`,
      });
      requestAnimationFrame(revealStatus);
      return;
    }

    const directionKey = `${direction.sourceLanguage}-${direction.targetLanguage}`;
    setBusyDirection(directionKey);
    setStatus({ type: 'loading', text: `Translating ${pairs.length} field${pairs.length === 1 ? '' : 's'}…` });
    const { data, error } = await translateContent({
      texts: pairs.map((pair) => pair.text),
      sourceLanguage: direction.sourceLanguage,
      targetLanguage: direction.targetLanguage,
      section,
    });

    if (error) {
      setBusyDirection('');
      setStatus({ type: 'error', text: error });
      requestAnimationFrame(revealStatus);
      return;
    }

    try {
      // Editors stay usable during the network request. Apply into the latest
      // render so typing elsewhere cannot be rolled back by a slower response.
      const result = applyTranslationResults(latestValueRef.current, pairs, data.translations);
      onChange(result.value);
      const affectedSummary = summarizeAffected?.(pairs, latestValueRef.current);
      const remaining = Number.isFinite(Number(data?.usage?.remainingCharacters))
        ? ` ${formatNumber(data.usage.remainingCharacters)} monthly characters remain.`
        : '';
      setStatus({
        type: 'success',
        text: `${result.appliedCount} draft translation${result.appliedCount === 1 ? '' : 's'} added for review.${skipped ? ` ${skipped} existing value${skipped === 1 ? '' : 's'} stayed unchanged.` : ''}${affectedSummary ? ` ${affectedSummary}` : ''}${remaining}`,
      });
    } catch {
      setStatus({ type: 'error', text: 'Translation returned an incomplete result. Your text is unchanged and manual editing is still available.' });
    } finally {
      setBusyDirection('');
      requestAnimationFrame(revealStatus);
    }
  };

  return (
    <aside className={`translation-assistant${compact ? ' translation-assistant--compact' : ''}`} aria-busy={Boolean(busyDirection)}>
      <div className="translation-assistant-copy">
        <span className="translation-assistant-kicker"><FiRefreshCw aria-hidden="true" /> {scopeLabel}</span>
        <p className={compact ? 'is-compact-cue' : undefined}>
          {helperText || (compact
            ? 'Draft only · existing text is kept.'
            : 'Fills blank language fields with a draft. Existing translations stay unchanged; review before saving.')}
        </p>
      </div>
      <div className="translation-assistant-actions">
        {DIRECTIONS.map((direction) => {
          const key = `${direction.sourceLanguage}-${direction.targetLanguage}`;
          return (
            <button
              key={key}
              type="button"
              className={direction.sourceLanguage === 'en' ? 'is-primary' : ''}
              onClick={() => handleTranslate(direction)}
              disabled={Boolean(busyDirection)}
            >
              {busyDirection === key ? <span className="translation-assistant-spinner" aria-hidden="true" /> : null}
              <span>{direction.sourceLabel}</span>
              <FiArrowRight aria-hidden="true" />
              <span>{direction.targetLabel}</span>
            </button>
          );
        })}
      </div>
      {status && (
        <div
          ref={statusRef}
          className={`translation-assistant-status is-${status.type}`}
          role={status.type === 'error' ? 'alert' : 'status'}
          aria-live={status.type === 'error' ? 'assertive' : 'polite'}
        >
          {status.text}
        </div>
      )}
      {busyDirection && <span className="translation-assistant-progress" aria-hidden="true" />}
    </aside>
  );
}
