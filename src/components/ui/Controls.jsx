import { createElement, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertCircle, FiCheckCircle, FiClock, FiInfo, FiMinusCircle, FiX } from 'react-icons/fi';
import { formatStatusLabel } from '../../utils/statusUtils';
import './Controls.css';

// Leave the native button type unchanged; existing form semantics stay intact.
export function Button({ variant = 'primary', className = '', busy = false, disabled, children, ...props }) {
  return <button {...props} disabled={disabled || busy} aria-busy={busy || undefined}
    className={`ui-button ui-button--${variant} ${className}`.trim()}>{busy && <span className="ui-spinner" aria-hidden="true" />}{children}</button>;
}

export function IconButton({ label, children, className = '', variant = 'ghost', type = 'button', ...props }) {
  return <Button type={type} variant={variant} aria-label={label} title={label} {...props}
    className={`ui-icon-button ${className}`}>{children}</Button>;
}

const statusGroups = {
  success: ['active', 'approved', 'completed', 'acknowledged'],
  warning: ['pending', 'under review', 'awaiting acknowledgement', 'on leave'],
  danger: ['rejected', 'failed', 'expired', 'overdue'],
  info: ['submitted', 'scheduled', 'informational'],
};
const statusIcons = { success: FiCheckCircle, warning: FiClock, danger: FiAlertCircle, info: FiInfo, neutral: FiMinusCircle };
export function StatusBadge({ value, children, tone, className = '', ...props }) {
  const label = formatStatusLabel(value ?? children);
  const semantic = tone || Object.keys(statusGroups).find(group => statusGroups[group].includes(label.toLowerCase())) || 'neutral';
  const Icon = statusIcons[semantic] || FiInfo;
  return <span {...props} className={`ui-status ui-status--${semantic} ${className}`}><Icon aria-hidden="true" />{label}</span>;
}

export function Card({ as: Element = 'div', className = '', ...props }) {
  return createElement(Element, { className: `ui-card ${className}`, ...props });
}
export function Panel({ as: Element = 'section', className = '', ...props }) {
  return createElement(Element, { className: `ui-panel ${className}`, ...props });
}
export function Toolbar({ label, className = '', ...props }) {
  return <div role="group" aria-label={label} className={`ui-toolbar ${className}`} {...props} />;
}
export function FormField({ label, htmlFor, hint, error, children, className = '' }) {
  return <div className={`ui-field ${className}`}><label htmlFor={htmlFor}>{label}</label>{children}
    {hint && <p className="ui-field-hint">{hint}</p>}{error && <p role="alert" className="ui-field-error">{error}</p>}</div>;
}
export function EmptyState({ title, children }) {
  return <div className="ui-empty"><FiInfo aria-hidden="true" /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function Feedback({ tone = 'info', children, className = '' }) {
  const Icon = statusIcons[tone] || FiInfo;
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={`ui-feedback ui-status--${tone} ${className}`}><Icon aria-hidden="true" /><div>{children}</div></div>;
}
export function Skeleton({ label = 'Loading', className = '' }) {
  return <div role="status" aria-label={label} className={`ui-skeleton ${className}`} />;
}

export function Dialog({ title, children, actions, onClose, className = '', closeLabel = 'Close', busy = false }) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    dialog.querySelector('[data-dialog-initial-focus]')?.focus();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} className={`ui-dialog ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) closeRef.current?.(); }}>
    <div className="ui-dialog-heading"><h2 id={titleId}>{title}</h2>
      {onClose && <IconButton label={closeLabel} disabled={busy} onClick={onClose}><FiX aria-hidden="true" /></IconButton>}</div>
    <div className="ui-dialog-body">{children}</div>
    {actions && <div className="ui-dialog-actions">{actions}</div>}
  </dialog>, document.body);
}
export function ConfirmationDialog({ title, message, cancelLabel = 'Cancel', confirmLabel = 'Confirm', onCancel, onConfirm, busy = false, variant = 'danger' }) {
  return <Dialog title={title} onClose={onCancel} busy={busy} actions={<>
    <Button type="button" variant="secondary" data-dialog-initial-focus disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
    <Button type="button" variant={variant} busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
  </>}><p>{message}</p></Dialog>;
}
