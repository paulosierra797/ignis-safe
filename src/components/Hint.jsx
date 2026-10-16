import React, { useId } from 'react';
import './Hint.css';

/**
 * Hover/focus explanation for a heading or label. The text lives in a tooltip
 * instead of permanently visible copy. Focusable so keyboard and touch users
 * can open it too.
 */
export default function Hint({ text, children, placement = 'top', className = '' }) {
  const id = useId();
  if (!text) return <span className={className}>{children}</span>;

  return (
    <span className={`hint hint--${placement} ${className}`.trim()} tabIndex={0} aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className="hint-tip">{text}</span>
    </span>
  );
}
