import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiArchive, FiMoreHorizontal, FiChevronRight } from 'react-icons/fi';
import ArchiveButton from './ArchiveButton';
import './RecordActions.css';

function collectActions(children) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) return collectActions(child.props.children);
    const props = child.props;
    const archive = child.type === ArchiveButton;
    const content = Children.toArray(props.children);
    const hasText = content.some(value => typeof value === 'string' || typeof value === 'number' || value.props?.children);
    return [{
      key: child.key,
      disabled: props.disabled || props.busy,
      title: props.title,
      href: props.href,
      target: props.target,
      rel: props.rel,
      onSelect: props.onClick,
      destructive: /delete|reject|danger/.test(props.className || ''),
      content: archive ? <><FiArchive aria-hidden="true" /><span>{props.busy ? 'Archiving...' : props.label || 'Archive'}</span></> : <>
        {!content.some(isValidElement) && <FiChevronRight aria-hidden="true" />}
        {props.children}
        {!hasText && <span>{props['aria-label'] || props.title || 'Open'}</span>}
      </>
    }];
  });
}

export default function RecordActions({ children, label = 'Record actions', actions: suppliedActions, disabled = false }) {
  const actions = suppliedActions || collectActions(children);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !menu.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const { width, height } = menu.current.getBoundingClientRect();
      const top = rect.bottom + height + 8 > innerHeight - 12 ? rect.top - height - 8 : rect.bottom + 8;
      setPosition({ top: Math.max(12, Math.min(top, innerHeight - height - 12)), left: Math.max(12, Math.min(rect.right - width, innerWidth - width - 12)) });
    };
    place();
    menu.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false);
    };
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const navigate = event => {
    if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const current = items.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[index]?.focus();
  };

  if (!actions.length) return null;
  return <>
    <button ref={trigger} type="button" className="record-actions-trigger" title={label} aria-label={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
      onClick={event => { event.stopPropagation(); setOpen(value => !value); }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <FiMoreHorizontal aria-hidden="true" />
    </button>
    {open && createPortal(<div id={id} ref={menu} role="menu" aria-label={label} className="record-actions-menu" style={position} onKeyDown={navigate} onClick={event => event.stopPropagation()}>
      {actions.map((action, index) => {
        const Item = action.href ? 'a' : 'button';
        return <Item type={action.href ? undefined : 'button'} href={action.href} target={action.target} rel={action.rel} key={action.key || index} role="menuitem" className="record-actions-item"
        data-destructive={action.destructive || undefined} disabled={action.disabled} title={action.title}
        onClick={event => { setOpen(false); trigger.current?.focus(); action.onSelect?.(event); }}>
        {action.content || <>{action.icon}<span>{action.label}</span></>}
      </Item>;
      })}
    </div>, document.body)}
  </>;
}
