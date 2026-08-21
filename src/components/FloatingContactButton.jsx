import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FiAlertCircle,
  FiArrowRight,
  FiFileText,
  FiHelpCircle,
  FiMessageCircle,
  FiPhone,
  FiUsers,
  FiX,
} from 'react-icons/fi'
import './FloatingContactButton.css'

const QUICK_INQUIRIES = [
  { label: 'General Inquiry', icon: FiHelpCircle },
  { label: 'Emergency Information', icon: FiAlertCircle },
  { label: 'Online Application', icon: FiFileText },
  { label: 'Public Assistance', icon: FiUsers },
]

export default function FloatingContactButton() {
  const [open, setOpen] = useState(false)
  const widgetRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (!widgetRef.current?.contains(event.target)) setOpen(false)
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    requestAnimationFrame(() => closeButtonRef.current?.focus())

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div className={`floating-contact-widget ${open ? 'is-open' : ''}`} ref={widgetRef}>
      {open && (
        <aside className="floating-contact-panel" id="floating-contact-panel" aria-label="Message BFP Dasmarinas">
          <div className="floating-contact-panel-header">
            <span className="floating-contact-panel-icon" aria-hidden="true"><FiMessageCircle /></span>
            <div>
              <h2>Message Us</h2>
              <p>How can we help?</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="floating-contact-close"
              onClick={() => setOpen(false)}
              aria-label="Close message box"
            >
              <FiX aria-hidden="true" />
            </button>
          </div>

          <div className="floating-contact-panel-body">
            <p className="floating-contact-intro">Select a concern and we will prepare the message form for you.</p>
            <div className="floating-contact-options">
              {QUICK_INQUIRIES.map((item) => (
                <Link
                  key={item.label}
                  to={`/send-message?topic=${encodeURIComponent(item.label)}`}
                  onClick={() => setOpen(false)}
                >
                  <item.icon aria-hidden="true" />
                  <span>{item.label}</span>
                  <FiArrowRight aria-hidden="true" />
                </Link>
              ))}
            </div>

            <Link className="floating-contact-write" to="/send-message" onClick={() => setOpen(false)}>
              Write a message
              <FiArrowRight aria-hidden="true" />
            </Link>

            <a className="floating-contact-emergency" href="tel:911">
              <FiPhone aria-hidden="true" />
              <span><strong>Emergency?</strong> Call 911 immediately.</span>
            </a>
          </div>
        </aside>
      )}

      <button
        type="button"
        className="floating-contact-button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'Close Message Us box' : 'Open Message Us box'}
        aria-expanded={open}
        aria-controls="floating-contact-panel"
      >
        <span className="floating-contact-button-dot" aria-hidden="true">
          {open ? <FiX /> : <FiMessageCircle />}
        </span>
        <span className="floating-contact-button-label">{open ? 'Close' : 'Message Us'}</span>
      </button>
    </div>
  )
}
