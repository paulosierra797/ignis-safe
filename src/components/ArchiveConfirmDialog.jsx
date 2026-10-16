import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { FiAlertTriangle, FiArchive, FiRotateCcw } from 'react-icons/fi';
import CloseButton from './CloseButton';
import './ArchiveConfirmDialog.css';

const TONE_ICONS = {
  archive: FiArchive,
  restore: FiRotateCcw,
  danger: FiAlertTriangle
};

// Shared confirmation for archive, restore, and irreversible deletion.
// `confirmPhrase` makes the admin type a word before an irreversible action;
// `showReason={false}` hides the note field for quick, reversible actions.
// The panel mounts only while open, so its fields start empty every time.
export default function ArchiveConfirmDialog({ open, ...props }) {
  return open ? <ArchiveConfirmPanel {...props} /> : null;
}

function ArchiveConfirmPanel({
  tone = 'archive',
  title,
  description,
  recordLabel,
  recordMeta,
  reasonLabel = 'Reason',
  reasonPlaceholder = '',
  reasonRequired = false,
  showReason = true,
  confirmPhrase = '',
  confirmLabel = 'Confirm',
  busyLabel = 'Working…',
  busy = false,
  error = '',
  onConfirm,
  onClose
}) {
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const confirmRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const phraseId = useId();

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(dialogRef.current, { y: 18, scale: 0.97, opacity: 0 }, {
        y: 0, scale: 1, opacity: 1, duration: 0.32, ease: 'power3.out', clearProps: 'transform,opacity'
      });
    });

    const focusTimer = window.setTimeout(() => {
      (firstFieldRef.current || confirmRef.current)?.focus();
    }, 30);

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        onCloseRef.current?.();
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      media.revert();
      if (returnFocusTo instanceof HTMLElement) returnFocusTo.focus();
    };
  }, []);

  const Icon = TONE_ICONS[tone] || FiArchive;
  const reasonMissing = showReason && reasonRequired && !reason.trim();
  const phraseMissing = Boolean(confirmPhrase) && phrase.trim() !== confirmPhrase;
  const canConfirm = !busy && !reasonMissing && !phraseMissing;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canConfirm) onConfirm?.(reason.trim());
  };

  return createPortal(
    <div
      className="archive-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <form
        ref={dialogRef}
        className={`archive-dialog archive-dialog--${tone}`}
        role={tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={handleSubmit}
      >
        <header className="archive-dialog-header">
          <span className="archive-dialog-icon" aria-hidden="true"><Icon /></span>
          <h2 id={titleId}>{title}</h2>
          <CloseButton label="Close dialog" onClick={onClose} disabled={busy} />
        </header>

        <div className="archive-dialog-body">
          <div id={descriptionId} className="archive-dialog-description">{description}</div>

          {recordLabel && (
            <div className="archive-dialog-record">
              <strong>{recordLabel}</strong>
              {recordMeta && <span>{recordMeta}</span>}
            </div>
          )}

          {showReason && (
            <>
              <label className="archive-dialog-label" htmlFor={reasonId}>
                {reasonLabel}
                {!reasonRequired && <span> (optional)</span>}
              </label>
              <textarea
                id={reasonId}
                ref={firstFieldRef}
                className="archive-dialog-input"
                rows={2}
                maxLength={500}
                value={reason}
                placeholder={reasonPlaceholder}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy}
                required={reasonRequired}
              />
            </>
          )}

          {confirmPhrase && (
            <>
              <label className="archive-dialog-label" htmlFor={phraseId}>
                Type <strong>{confirmPhrase}</strong> to continue
              </label>
              <input
                id={phraseId}
                className="archive-dialog-input"
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                autoComplete="off"
                spellCheck="false"
                disabled={busy}
              />
            </>
          )}

          {error && <p className="archive-dialog-error" role="alert">{error}</p>}
        </div>

        <footer className="archive-dialog-footer">
          <button type="button" className="archive-dialog-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button ref={confirmRef} type="submit" className="archive-dialog-confirm" disabled={!canConfirm} aria-busy={busy || undefined}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </footer>
      </form>
    </div>,
    document.body
  );
}
