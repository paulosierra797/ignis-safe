import React from 'react';
import { FiX } from 'react-icons/fi';
import './AppDialog.css';

export default function CloseButton({
  className = '',
  label = 'Close',
  title = 'Close',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`app-close-button ${className}`.trim()}
      aria-label={label}
      title={title}
      {...props}
    >
      <FiX aria-hidden="true" />
    </button>
  );
}
