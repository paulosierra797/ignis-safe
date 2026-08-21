import { useEffect, useRef, useState } from 'react'
import {
  FiUser,
  FiMail,
  FiTag,
  FiMessageSquare,
  FiSend,
  FiCopy,
  FiCheck,
  FiCheckCircle,
  FiHelpCircle,
  FiAlertCircle,
  FiFileText,
  FiUsers,
  FiArrowRight,
} from 'react-icons/fi'
import './SendMessageSection.css'
import { sendContactMessage } from '../utils/contactMessageService'

const DIRECT_EMAIL = 'ignissafe.bfpdasmarinas@gmail.com'
const MESSAGE_MAX_LENGTH = 1000

const TOPIC_OPTIONS = [
  'General Inquiry',
  'Emergency Information',
  'Online Application',
  'Public Assistance',
  'Other',
]

const INQUIRIES = [
  {
    icon: FiHelpCircle,
    label: 'General Inquiry',
    prompt: 'Hello, I would like to ask about ',
  },
  {
    icon: FiAlertCircle,
    label: 'Emergency Information',
    prompt: 'Hello, I would like information about emergency procedures or contact details regarding ',
  },
  {
    icon: FiFileText,
    label: 'Online Application',
    prompt: 'Hello, I need assistance with my online application regarding ',
  },
  {
    icon: FiUsers,
    label: 'Public Assistance',
    prompt: 'Hello, I would like to request public assistance regarding ',
  },
]

const INITIAL_FORM = { name: '', email: '', topic: '', message: '' }

const getInquiryPrompt = (topic) => INQUIRIES.find((inquiry) => inquiry.label === topic)?.prompt || ''

export default function SendMessageSection({ initialTopic = '' }) {
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    topic: initialTopic,
    message: getInquiryPrompt(initialTopic),
  }))
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [copied, setCopied] = useState(false)
  const messageRef = useRef(null)

  const handleChange = (field) => (event) => {
    const { value } = event.target
    setForm((prev) => ({ ...prev, [field]: value }))
    if (submitError) setSubmitError('')
  }

  const handleMessageChange = (event) => {
    const { value } = event.target
    if (value.length > MESSAGE_MAX_LENGTH) return
    setForm((prev) => ({ ...prev, message: value }))
    if (submitError) setSubmitError('')
  }

  const handleInquirySelect = (inquiry) => {
    setForm((prev) => ({
      ...prev,
      topic: inquiry.label,
      message: !prev.message.trim() || INQUIRIES.some((item) => item.prompt === prev.message)
        ? inquiry.prompt
        : prev.message,
    }))
    setSubmitError('')
    requestAnimationFrame(() => {
      messageRef.current?.focus()
      const end = messageRef.current?.value.length || 0
      messageRef.current?.setSelectionRange(end, end)
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setSubmitError('')

    const { success, error } = await sendContactMessage(form)

    setSubmitting(false)

    if (success) {
      setSubmitted(true)
      setForm(INITIAL_FORM)
    } else {
      setSubmitted(false)
      setSubmitError(error || 'Something went wrong while sending your message. Please try again.')
    }
  }

  const handleCopyEmail = async () => {
    try {
      let copiedSuccessfully = false

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(DIRECT_EMAIL)
          copiedSuccessfully = true
        } catch {
          copiedSuccessfully = false
        }
      }

      if (!copiedSuccessfully) {
        const field = document.createElement('textarea')
        field.value = DIRECT_EMAIL
        field.setAttribute('readonly', '')
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        copiedSuccessfully = document.execCommand('copy')
        document.body.removeChild(field)

        if (!copiedSuccessfully) throw new Error('Copy command was not available')
      }

      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const closeSuccessModal = () => setSubmitted(false)

  useEffect(() => {
    if (!submitted) return undefined

    const previousOverflow = document.body.style.overflow
    const handleEscape = (event) => {
      if (event.key === 'Escape') closeSuccessModal()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [submitted])

  return (
    <section className="send-message" id="send-message">
      <div className="send-message-container">
        <div className="send-message-heading">
          <p className="landing-section-eyebrow">Get in touch</p>
          <h2>Send Us a Message</h2>
          <p className="send-message-description">
            Have a question, concern, or request? Fill out the form below and our team at BFP Dasmariñas City will get back to you as soon as possible.
          </p>
        </div>

        <div className="send-message-grid">
          <form className="send-message-card send-message-form" onSubmit={handleSubmit} noValidate>
            <div className="send-message-field">
              <label htmlFor="sm-name"><FiUser aria-hidden="true" /> Name</label>
              <input
                id="sm-name"
                type="text"
                placeholder="Juan Dela Cruz"
                value={form.name}
                onChange={handleChange('name')}
                autoComplete="name"
                required
              />
            </div>

            <div className="send-message-field">
              <label htmlFor="sm-email"><FiMail aria-hidden="true" /> Email</label>
              <input
                id="sm-email"
                type="email"
                placeholder="you@email.com"
                value={form.email}
                onChange={handleChange('email')}
                autoComplete="email"
                required
              />
            </div>

            <div className="send-message-field">
              <label htmlFor="sm-topic"><FiTag aria-hidden="true" /> Topic</label>
              <select
                id="sm-topic"
                value={form.topic}
                onChange={handleChange('topic')}
                required
              >
                <option value="" disabled>Select a topic</option>
                {TOPIC_OPTIONS.map((topic) => (
                  <option key={topic} value={topic}>{topic}</option>
                ))}
              </select>
            </div>

            <div className="send-message-field">
              <div className="send-message-field-label-row">
                <label htmlFor="sm-message"><FiMessageSquare aria-hidden="true" /> Message</label>
                <span className="send-message-char-counter">
                  {form.message.length}/{MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <textarea
                ref={messageRef}
                id="sm-message"
                rows={5}
                placeholder="Tell us how we can help..."
                value={form.message}
                onChange={handleMessageChange}
                maxLength={MESSAGE_MAX_LENGTH}
                required
              />
            </div>

            <button type="submit" className="send-message-submit" disabled={submitting}>
              <FiSend aria-hidden="true" />
              {submitting ? 'Sending...' : 'Send Message'}
            </button>

            {submitError && (
              <p className="send-message-error" role="alert">
                {submitError}
              </p>
            )}
          </form>

          <div className="send-message-side">
            <div className="send-message-card send-message-email-card">
              <div className="send-message-email-header">
                <span className="send-message-icon" aria-hidden="true"><FiMail /></span>
                <h3>Direct Email</h3>
              </div>
              <div className="send-message-email-value">
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(DIRECT_EMAIL)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {DIRECT_EMAIL}
                </a>
                <button
                  type="button"
                  className="send-message-copy-button"
                  onClick={handleCopyEmail}
                  aria-label="Copy direct email address"
                >
                  {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="send-message-card send-message-inquiries-card">
              <h3>Inquiries</h3>
              <p>Choose a concern to prepare the topic and a helpful message starter.</p>
              <ul className="send-message-inquiries-list">
                {INQUIRIES.map((inquiry) => (
                  <li key={inquiry.label}>
                    <button
                      type="button"
                      className={form.topic === inquiry.label ? 'is-selected' : ''}
                      aria-pressed={form.topic === inquiry.label}
                      onClick={() => handleInquirySelect(inquiry)}
                    >
                      <span className="send-message-icon send-message-icon-sm" aria-hidden="true">
                        <inquiry.icon />
                      </span>
                      <span>{inquiry.label}</span>
                      <FiArrowRight className="send-message-inquiry-arrow" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {submitted && (
        <div
          className="send-message-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSuccessModal()
          }}
        >
          <div
            className="send-message-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sendMessageSuccessTitle"
          >
            <span className="send-message-modal-icon" aria-hidden="true">
              <FiCheckCircle />
            </span>
            <h3 id="sendMessageSuccessTitle">Message Sent Successfully!</h3>
            <p>
              Thank you for contacting BFP Dasmariñas. Please wait for our reply through the email address you provided.
            </p>
            <button type="button" className="send-message-modal-ok" onClick={closeSuccessModal}>
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
