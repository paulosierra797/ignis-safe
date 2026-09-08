import React from 'react';
import { FiX } from 'react-icons/fi';
import './AppDialog.css';
import { IconButton } from './ui/Controls';

export default function CloseButton({
  className = '',
  label = 'Close',
  title = 'Close',
  type = 'button',
  ...props
}) {
  return (
    <IconButton
      type={type}
      className={`app-close-button ${className}`.trim()}
      label={label}
      title={title}
      {...props}
    >
      <FiX aria-hidden="true" />
    </IconButton>
  );
}
