import { FiArchive } from 'react-icons/fi';
import './ArchiveButton.css';

export default function ArchiveButton({ label = 'Archive', busy = false, showLabel = false, disabled = false, ...props }) {
  const accessibleLabel = busy ? 'Archiving...' : label;
  return (
    <button
      {...props}
      type="button"
      className={`archive-control${showLabel ? ' archive-control--labelled' : ''}`}
      aria-label={accessibleLabel}
      aria-busy={busy || undefined}
      title={props.title || accessibleLabel}
      disabled={disabled || busy}
    >
      <FiArchive aria-hidden="true" />
      {showLabel && <span>{accessibleLabel}</span>}
    </button>
  );
}
