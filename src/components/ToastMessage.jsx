import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertCircle, FiCheckCircle, FiInfo, FiX } from 'react-icons/fi';
import './ToastMessage.css';

const ICONS = {
  error: FiAlertCircle,
  success: FiCheckCircle,
  info: FiInfo
};

function ToastEntry({ message, type, duration }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (duration <= 0) return undefined;
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  const normalizedType = ICONS[type] ? type : 'info';
  const Icon = ICONS[normalizedType];

  return (
    <div className={`app-toast app-toast-${normalizedType}`} role={normalizedType === 'error' ? 'alert' : 'status'}>
      <Icon className="app-toast-icon" aria-hidden="true" />
      <p>{message}</p>
      <button type="button" className="app-toast-close" onClick={() => setVisible(false)} aria-label="Dismiss message">
        <FiX aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ToastMessage({ message, type = 'info', duration = 5000 }) {
  if (!message || typeof document === 'undefined') return null;

  let region = document.getElementById('app-toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'app-toast-region';
    region.className = 'app-toast-region';
    region.setAttribute('aria-label', 'System notifications');
    document.body.appendChild(region);
  }

  return createPortal(
    <ToastEntry key={`${type}:${message}`} message={message} type={type} duration={duration} />,
    region
  );
}
