import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { FiCheck, FiCopy, FiInfo } from 'react-icons/fi';
import './BackupSetupHelp.css';

const KEY_COMMAND = `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`;
const SET_COMMAND = 'npx supabase secrets set BACKUP_ENCRYPTION_KEY=YOUR_KEY --project-ref mvgpeiejwstrxjmfslke';
const POPOVER_WIDTH = 360;
const EDGE = 12;

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="bsh-copy" onClick={copy} aria-label={copied ? 'Copied' : label}>
      {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

function Command({ text, label }) {
  return (
    <div className="bsh-command">
      <code>{text}</code>
      <CopyButton text={text} label={label} />
    </div>
  );
}

// Explains how to finish backup encryption setup. Shown beside the setup error.
// `checking` and `onRecheck` drive the "Check setup" step; the key is never shown.
export default function BackupSetupHelp({ checking = false, onRecheck }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState({ visibility: 'hidden' });
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const hoverTimer = useRef(0);
  const id = useId();

  const place = useCallback(() => {
    const button = buttonRef.current;
    const popover = popoverRef.current;
    if (!button || !popover) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - EDGE * 2);
    const height = popover.offsetHeight;
    const left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - EDGE);
    const below = rect.bottom + 8;
    const fitsBelow = below + height <= window.innerHeight - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, rect.top - 8 - height);
    setStyle({ left, top, width, maxHeight: window.innerHeight - EDGE * 2, visibility: 'visible' });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(popoverRef.current, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: 'power2.out', clearProps: 'transform,opacity' });
      gsap.from('.bsh-step', { y: 6, opacity: 0, duration: 0.3, stagger: 0.05, delay: 0.06, ease: 'power2.out', clearProps: 'transform,opacity' });
    });

    const close = () => setOpen(false);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (!popoverRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) close();
    };
    const scroller = buttonRef.current?.closest('.archive-dialog-body');
    window.addEventListener('resize', place);
    scroller?.addEventListener('scroll', place, { passive: true });
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      media.revert();
      window.removeEventListener('resize', place);
      scroller?.removeEventListener('scroll', place);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, place]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const hoverOpen = (event) => {
    if (event.pointerType !== 'mouse') return;
    window.clearTimeout(hoverTimer.current);
    setOpen(true);
  };
  const hoverClose = (event) => {
    if (event.pointerType !== 'mouse') return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="bsh-trigger"
        aria-label="How to finish backup setup"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onPointerEnter={hoverOpen}
        onPointerLeave={hoverClose}
      >
        <FiInfo aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          id={id}
          className="bsh-popover"
          role="dialog"
          aria-label="Finish backup setup"
          style={style}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
        >
          <h3 className="bsh-title">Finish backup setup</h3>
          <p className="bsh-lead">Backups are locked with a secret key. It only needs to be set once.</p>

          <ol className="bsh-steps">
            <li className="bsh-step">
              <strong>Open the terminal</strong>
              <span>In VS Code, open the project and choose Terminal → New Terminal.</span>
            </li>
            <li className="bsh-step">
              <strong>Create a key</strong>
              <span>Run this. It prints a long random text.</span>
              <Command text={KEY_COMMAND} label="Copy the key-creation command" />
            </li>
            <li className="bsh-step">
              <strong>Save the key safely</strong>
              <span>Keep it in a password manager. Don’t share it or paste it in chat.</span>
            </li>
            <li className="bsh-step">
              <strong>Add it to Supabase</strong>
              <span>Replace YOUR_KEY with the text from step 2, then run:</span>
              <Command text={SET_COMMAND} label="Copy the Supabase command" />
            </li>
            <li className="bsh-step">
              <strong>Check and try again</strong>
              <span>This message disappears once the setup is confirmed.</span>
              {onRecheck && (
                <button type="button" className="bsh-recheck" onClick={onRecheck} disabled={checking}>
                  {checking ? 'Checking…' : 'Check setup'}
                </button>
              )}
            </li>
          </ol>

          <p className="bsh-warning">
            Already set up before? Don’t replace the key. Old backups can only be opened with the key that made them.
          </p>
        </div>,
        document.body
      )}
    </>
  );
}
