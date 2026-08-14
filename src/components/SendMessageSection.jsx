import { useState } from 'react'
import {
  FiUser,
  FiMail,
  FiTag,
  FiMessageSquare,
  FiSend,
  FiCopy,
  FiCheck,
  FiHelpCircle,
  FiAlertCircle,
  FiFileText,
  FiUsers,
} from 'react-icons/fi'
import './SendMessageSection.css'
import { sendContactMessage } from '../utils/contactMessageService'

const DIRECT_EMAIL = 'ignissafe.bfpdasmarinas@gmail.com'

const TOPIC_OPTIONS = [
  'General Inquiry',
  'Emergency Information',
  'Online Application',
  'Public Assistance',
  'Other',
]

const INQUIRIES = [
  { icon: FiHelpCircle, label: 'General Inquiry' },
  { icon: FiAlertCircle, label: 'Emergency Information' },
  { icon: FiFileText, label: 'Online Application' },
  { icon: FiUsers, label: 'Public Assistance' },
]

const INITIAL_FORM = { name: '', email: '', topic: '', message: '' }

export default function SendMessageSection() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleChange = (field) => (event) => {
    const { value } = event.target
    setForm((prev) => ({ ...prev, [field]: value }))
    if (submitted) setSubmitted(false)
    if (submitError) setSubmitError('')
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
              <label htmlFor="sm-message"><FiMessageSquare aria-hidden="true" /> Message</label>
              <textarea
                id="sm-message"
                rows={5}
                placeholder="Tell us how we can help..."
                value={form.message}
                onChange={handleChange('message')}
                required
              />
            </div>

            <button type="submit" className="send-message-submit" disabled={submitting}>
              <FiSend aria-hidden="true" />
              {submitting ? 'Sending...' : 'Send Message'}
            </button>

            {submitted && (
              <p className="send-message-success" role="status">
                Thank you! Your message has been noted. We&apos;ll get back to you shortly.
              </p>
            )}

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
              <ul className="send-message-inquiries-list">
                {INQUIRIES.map((inquiry) => (
                  <li key={inquiry.label}>
                    <span className="send-message-icon send-message-icon-sm" aria-hidden="true">
                      <inquiry.icon />
                    </span>
                    <span>{inquiry.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
