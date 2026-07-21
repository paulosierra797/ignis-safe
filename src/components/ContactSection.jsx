import { useState } from 'react'
import { FiCheck, FiCopy, FiFacebook, FiMail, FiPhone, FiSmartphone } from 'react-icons/fi'
import './ContactSection.css'
import firestation from '../assets/firestation.jpg'
import { useLandingContent } from '../context/LandingContentContext';

const toPhoneHref = (value) => `tel:${String(value || '').replace(/[^\d+]/g, '')}`;

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!value) return

    try {
      const textToCopy = String(value)
      let copiedSuccessfully = false

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(textToCopy)
          copiedSuccessfully = true
        } catch {
          copiedSuccessfully = false
        }
      }

      if (!copiedSuccessfully) {
        const copyField = document.createElement('textarea')
        copyField.value = textToCopy
        copyField.setAttribute('readonly', '')
        copyField.style.position = 'fixed'
        copyField.style.opacity = '0'
        document.body.appendChild(copyField)
        copyField.select()
        copiedSuccessfully = document.execCommand('copy')
        document.body.removeChild(copyField)

        if (!copiedSuccessfully) throw new Error('Copy command was not available')
      }

      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" className="contact-copy-button" onClick={handleCopy} aria-label={`Copy ${label}`}>
      {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export default function ContactSection() {
  const { content } = useLandingContent();

  return (
    <section className="contact" id="contact">
      <div className="contact-container">
        <div className="contact-image">
           <img src={firestation} alt="BFP Dasmariñas City Fire Station" className="contact-station-image" />
        </div>
        
        <div className="contact-content">
          <h2>{content.contact.title}</h2>
          
          <div className="emergency-title">
            <h3>{content.contact.emergencyTitle}</h3>
            <div className="phone">
              <div className="contact-detail-card">
                <span className="contact-detail-icon" aria-hidden="true"><FiPhone /></span>
                <div className="contact-detail-copy">
                  <span className="hotline-label">Landline</span>
                  <div className="hotline-values">
                    <a href={toPhoneHref(content.contact.landlinePrimary)}>{content.contact.landlinePrimary}</a>
                    <span className="hotline-separator">/</span>
                    <a href={toPhoneHref(content.contact.landlineSecondary)}>{content.contact.landlineSecondary}</a>
                  </div>
                </div>
                <CopyButton value={`${content.contact.landlinePrimary} / ${content.contact.landlineSecondary}`} label="landline numbers" />
              </div>
              <div className="contact-detail-card">
                <span className="contact-detail-icon" aria-hidden="true"><FiSmartphone /></span>
                <div className="contact-detail-copy">
                  <span className="hotline-label">Mobile</span>
                  <a href={toPhoneHref(content.contact.mobile)}>{content.contact.mobile}</a>
                </div>
                <CopyButton value={content.contact.mobile} label="mobile number" />
              </div>
            </div>
          </div>
          
          <div className="contact-info">
            <div className="contact-detail-card">
              <span className="contact-detail-icon" aria-hidden="true"><FiMail /></span>
              <div className="contact-detail-copy">
                <label>Email</label>
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(content.contact.email || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {content.contact.email}
                </a>
              </div>
              <CopyButton value={content.contact.email} label="email address" />
            </div>
            <div className="contact-detail-card">
              <span className="contact-detail-icon" aria-hidden="true"><FiFacebook /></span>
              <div className="contact-detail-copy">
                <label>Facebook</label>
                <a href={content.contact.facebookUrl} target="_blank" rel="noopener noreferrer">
                  {content.contact.facebookLabel}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
