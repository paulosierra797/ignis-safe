import { FiMessageCircle } from 'react-icons/fi'
import './FloatingContactButton.css'

export default function FloatingContactButton() {
  const handleClick = (event) => {
    event.preventDefault()
    document.getElementById('send-message')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <a
      href="#send-message"
      className="floating-contact-button"
      onClick={handleClick}
      aria-label="Scroll to Send Us a Message form"
    >
      <span className="floating-contact-button-dot" aria-hidden="true">
        <FiMessageCircle />
      </span>
      <span className="floating-contact-button-label">Message Us</span>
    </a>
  )
}
