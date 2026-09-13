import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiArchive } from 'react-icons/fi';
import CloseButton from './CloseButton';
import './ArchiveListModal.css';

export default function ArchiveListModal({
  open,
  id,
  title,
  description,
  count = 0,
  countLabel = 'records',
  onClose,
  busy = false,
  children,
  size = 'wide'
}) {
  const generatedTitleId = useId();
  const titleId = id ? `${id}-title` : generatedTitleId;
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !busyRef.current) onCloseRef.current?.();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="shared-archive-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        id={id}
        className={`shared-archive-dialog shared-archive-dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="shared-archive-header">
          <div className="shared-archive-heading">
            <span className="shared-archive-icon" aria-hidden="true"><FiArchive /></span>
            <div>
              <span className="shared-archive-eyebrow">Archived records</span>
              <h2 id={titleId}>{title}</h2>
              {description && <p>{description}</p>}
            </div>
          </div>
          <div className="shared-archive-header-actions">
            <span className="shared-archive-count">{count} {count === 1 ? countLabel.replace(/s$/, '') : countLabel}</span>
            <CloseButton label={`Close ${title}`} onClick={onClose} disabled={busy} />
          </div>
        </header>
        <div className="shared-archive-body">{children}</div>
      </section>
    </div>,
    document.body
  );
}
