import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronDown, FiGlobe } from 'react-icons/fi';
import './TranslationMenu.css';

const DIRECTIONS = [
  { key: 'en-fil', label: 'English to Filipino' },
  { key: 'fil-en', label: 'Filipino to English' },
];

export default function TranslationMenu({ label = 'Translate tab', busy, disabled, onSelect, className = '' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(232, window.innerWidth - 24);
      const height = menuRef.current?.offsetHeight || 96;
      setPosition({
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        top: rect.bottom + height + 8 <= window.innerHeight - 12 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6),
        width,
      });
    };
    place();
    const focusFrame = requestAnimationFrame(() => menuRef.current?.querySelector('button')?.focus());
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === 'Tab') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`translation-menu-trigger ${className}`.trim()}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {busy ? <span className="translation-assistant-spinner" aria-hidden="true" /> : <FiGlobe aria-hidden="true" />}
        <span>{busy ? 'Translating...' : label}</span>
        <FiChevronDown aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          className="translation-menu-list"
          style={position || { visibility: 'hidden' }}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const items = [...menuRef.current.querySelectorAll('button')];
            const index = items.indexOf(document.activeElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {DIRECTIONS.map((direction) => (
            <button key={direction.key} type="button" role="menuitem" onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
              onSelect(direction.key);
            }}>{direction.label}</button>
          ))}
        </div>, document.body,
      )}
    </>
  );
}
