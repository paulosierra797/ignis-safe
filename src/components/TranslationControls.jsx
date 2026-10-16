import React, { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { FiArrowRight, FiRefreshCw } from 'react-icons/fi';
import { translateContent } from '../utils/translationClient';
import {
  applyTranslationResults,
  collectTranslationPairs,
  countExistingTranslationTargets,
  snapshotTranslatableText,
  translationPathKey,
} from '../utils/translationUtils';
import './TranslationControls.css';

const DIRECTIONS = [
  { sourceLanguage: 'en', targetLanguage: 'fil', sourceLabel: 'English', targetLabel: 'Filipino' },
  { sourceLanguage: 'fil', targetLanguage: 'en', sourceLabel: 'Filipino', targetLabel: 'English' },
];

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

// "station_heading_en" -> "Station heading"; array entries get their position.
const describePath = (path) => {
  const index = typeof path.at(-1) === 'number' ? path.at(-1) + 1 : null;
  const key = [...path].reverse().find((part) => typeof part === 'string') || 'Field';
  const words = key.replace(/_(en|tl)$/, '').replace(/_/g, ' ').trim();
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return index ? `${label} ${index}` : label;
};

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
  const [pending, setPending] = useState(null);
  const statusRef = useRef(null);
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  // Text as first loaded (or as last translated). A source field that differs
  // from this has been edited, so its existing translation may be stale.
  const baselineRef = useRef({});
  if (Object.keys(baselineRef.current).length === 0) baselineRef.current = snapshotTranslatableText(value);

  const markTranslated = (pairs) => {
    pairs.forEach((pair) => { baselineRef.current[translationPathKey(pair.sourcePath)] = pair.text; });
  };

  const revealStatus = () => {
    if (!statusRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(statusRef.current, { autoAlpha: 0, y: 5 }, {
      autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out', clearProps: 'transform,opacity,visibility',
    });
  };

  const handleTranslate = async (direction) => {
    setPending(null);
    const pairs = collectTranslationPairs(value, direction.sourceLanguage, direction.targetLanguage, baselineRef.current);
    const skipped = countExistingTranslationTargets(value, direction.sourceLanguage, direction.targetLanguage) - pairs.filter((pair) => pair.existing !== undefined).length;
    if (pairs.length === 0) {
      setStatus({
        type: 'info',
        text: skipped > 0
          ? `Nothing new to translate. Edit the ${direction.sourceLabel} text to refresh a translation; ${skipped} existing translation${skipped === 1 ? '' : 's'} stayed unchanged.`
          : `Add ${direction.sourceLabel} text to a paired field first.`,
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
      if (!Array.isArray(data.translations) || data.translations.length !== pairs.length) {
        throw new Error('Mismatched translation response.');
      }
      // Blank targets are filled straight away; replacing existing text waits
      // for the admin's confirmation.
      const blankIdx = pairs.map((pair, i) => (pair.existing === undefined ? i : -1)).filter((i) => i >= 0);
      const overwriteIdx = pairs.map((pair, i) => (pair.existing === undefined ? -1 : i)).filter((i) => i >= 0);
      const blankPairs = blankIdx.map((i) => pairs[i]);
      let appliedCount = 0;
      if (blankPairs.length > 0) {
        const result = applyTranslationResults(latestValueRef.current, blankPairs, blankIdx.map((i) => data.translations[i]));
        onChange(result.value);
        appliedCount = result.appliedCount;
        markTranslated(blankPairs);
      }
      const affectedSummary = summarizeAffected?.(blankPairs, latestValueRef.current);
      const remaining = Number.isFinite(Number(data?.usage?.remainingCharacters))
        ? ` ${formatNumber(data.usage.remainingCharacters)} monthly characters remain.`
        : '';
      if (overwriteIdx.length > 0) {
        setPending({
          direction,
          remaining,
          items: overwriteIdx.map((i) => ({ pair: pairs[i], translation: String(data.translations[i] || ''), label: describePath(pairs[i].sourcePath) })),
        });
      }
      const parts = [];
      if (appliedCount) parts.push(`${appliedCount} draft translation${appliedCount === 1 ? '' : 's'} added for review.`);
      if (overwriteIdx.length) parts.push(`${overwriteIdx.length} edited field${overwriteIdx.length === 1 ? '' : 's'} need${overwriteIdx.length === 1 ? 's' : ''} your confirmation below.`);
      if (skipped) parts.push(`${skipped} existing value${skipped === 1 ? '' : 's'} stayed unchanged.`);
      if (affectedSummary) parts.push(affectedSummary);
      setStatus({ type: 'success', text: `${parts.join(' ')}${overwriteIdx.length ? '' : remaining}` });
    } catch {
      setStatus({ type: 'error', text: 'Translation returned an incomplete result. Your text is unchanged and manual editing is still available.' });
    } finally {
      setBusyDirection('');
      requestAnimationFrame(revealStatus);
    }
  };

  const confirmReplace = () => {
    if (!pending) return;
    const { items, direction, remaining } = pending;
    const pairs = items.map((item) => item.pair);
    try {
      // Applied to the latest render; a field edited since the preview is kept.
      const result = applyTranslationResults(latestValueRef.current, pairs, items.map((item) => item.translation));
      onChange(result.value);
      markTranslated(pairs);
      const kept = items.length - result.appliedCount;
      setStatus({
        type: 'success',
        text: `${result.appliedCount} ${direction.targetLabel} translation${result.appliedCount === 1 ? '' : 's'} replaced for review.${kept ? ` ${kept} changed meanwhile and stayed as you left ${kept === 1 ? 'it' : 'them'}.` : ''}${remaining}`,
      });
    } catch {
      setStatus({ type: 'error', text: 'Could not apply the translation. Your text is unchanged.' });
    }
    setPending(null);
    requestAnimationFrame(revealStatus);
  };

  const cancelReplace = () => {
    setPending(null);
    setStatus({ type: 'info', text: 'Existing translations kept. Nothing was replaced.' });
    requestAnimationFrame(revealStatus);
  };

  return (
    <aside className={`translation-assistant${compact ? ' translation-assistant--compact' : ''}`} aria-busy={Boolean(busyDirection)}>
      <div className="translation-assistant-copy">
        <span className="translation-assistant-kicker"><FiRefreshCw aria-hidden="true" /> {scopeLabel}</span>
        <p className={compact ? 'is-compact-cue' : undefined}>
          {helperText || (compact
            ? 'Draft only · you confirm any replacement.'
            : 'Fills blank fields with a draft. Edited source text can refresh its translation after you confirm.')}
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
      {pending && (
        <div className="translation-assistant-preview" role="group" aria-label="Review translations before replacing">
          <p className="translation-assistant-preview-title">
            Replace {pending.items.length} existing {pending.direction.targetLabel} translation{pending.items.length === 1 ? '' : 's'}? Source text was edited.
          </p>
          <ul className="translation-assistant-preview-list">
            {pending.items.map((item) => (
              <li key={translationPathKey(item.pair.targetPath)}>
                <span className="translation-assistant-preview-label">{item.label}</span>
                <span className="translation-assistant-preview-old">{item.pair.existing}</span>
                <span className="translation-assistant-preview-new">{item.translation}</span>
              </li>
            ))}
          </ul>
          <div className="translation-assistant-preview-actions">
            <button type="button" onClick={cancelReplace}>Keep existing</button>
            <button type="button" className="is-primary" onClick={confirmReplace}>
              Replace {pending.items.length === 1 ? 'translation' : `${pending.items.length} translations`}
            </button>
          </div>
        </div>
      )}
      {busyDirection && <span className="translation-assistant-progress" aria-hidden="true" />}
    </aside>
  );
}
