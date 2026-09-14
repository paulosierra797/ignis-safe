import { useState } from 'react'
import { FiCheck, FiCopy, FiFacebook, FiMail, FiPhone, FiSmartphone } from 'react-icons/fi'
import './ContactSection.css'
import firestation from '../assets/firestation.webp'
import firestationSmall from '../assets/firestation-640.webp'
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy, getLocalizedSection, normalizeDasmarinasText } from '../utils/landingLanguage';

const toPhoneHref = (value) => `tel:${String(value || '').replace(/[^\d+]/g, '')}`;

function CopyButton({ value, label, copy }) {
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
      <span>{copied ? copy.copied : copy.copy}</span>
    </button>
  )
}

export default function ContactSection() {
  const { content, language } = useLandingContent();
  const copy = { ...getLandingUiCopy(language), ...(content.copy?.[language] || {}) };
  const contactContent = getLocalizedSection(content.contact, language);
  const contactPhoto = content.media?.contactPhoto;

  return (
    <section className="contact" id="contact">
      <div className="contact-container">
        <div className="contact-image">
           <img
             src={contactPhoto?.url || firestation}
             srcSet={contactPhoto?.url ? undefined : `${firestationSmall} 640w, ${firestation} 1360w`}
             sizes="(max-width: 767px) calc(100vw - 2rem), 50vw"
             alt="BFP Dasmariñas City Fire Station"
             className="contact-station-image"
             loading="lazy"
             decoding="async"
             width="1360"
             height="765"
             data-landing-edit-image="media.contactPhoto"
             data-landing-edit-label="Contact section photo"
           />
        </div>
        
        <div className="contact-content">
          <h2 data-landing-edit-path={language === 'tagalog' ? 'contact.tagalog.title' : 'contact.title'} data-landing-edit-label="Contact section heading">{normalizeDasmarinasText(contactContent.title)}</h2>
          
          <div className="emergency-title">
            <h3 data-landing-edit-path={language === 'tagalog' ? 'contact.tagalog.emergencyTitle' : 'contact.emergencyTitle'} data-landing-edit-label="Emergency hotline heading">{normalizeDasmarinasText(contactContent.emergencyTitle)}</h3>
            <div className="phone">
              <div className="contact-detail-card">
                <span className="contact-detail-icon" aria-hidden="true"><FiPhone /></span>
                <div className="contact-detail-copy">
                  <span className="hotline-label" data-landing-edit-path={`copy.${language}.landline`} data-landing-edit-label="Landline label">{copy.landline}</span>
                  <div className="hotline-values">
                    <a href={toPhoneHref(content.contact.landlinePrimary)} data-landing-edit-path="contact.landlinePrimary" data-landing-edit-label="Primary landline number">{content.contact.landlinePrimary}</a>
                    <span className="hotline-separator">/</span>
                    <a href={toPhoneHref(content.contact.landlineSecondary)} data-landing-edit-path="contact.landlineSecondary" data-landing-edit-label="Secondary landline number">{content.contact.landlineSecondary}</a>
                  </div>
                </div>
                <CopyButton value={`${content.contact.landlinePrimary} / ${content.contact.landlineSecondary}`} label="landline numbers" copy={copy} />
              </div>
              <div className="contact-detail-card">
                <span className="contact-detail-icon" aria-hidden="true"><FiSmartphone /></span>
                <div className="contact-detail-copy">
                  <span className="hotline-label" data-landing-edit-path={`copy.${language}.mobile`} data-landing-edit-label="Mobile label">{copy.mobile}</span>
                  <a href={toPhoneHref(content.contact.mobile)} data-landing-edit-path="contact.mobile" data-landing-edit-label="Mobile number">{content.contact.mobile}</a>
                </div>
                <CopyButton value={content.contact.mobile} label="mobile number" copy={copy} />
              </div>
            </div>
          </div>
          
          <div className="contact-info">
            <div className="contact-detail-card">
              <span className="contact-detail-icon" aria-hidden="true"><FiMail /></span>
              <div className="contact-detail-copy">
                <label data-landing-edit-path={`copy.${language}.email`} data-landing-edit-label="Email label">{copy.email}</label>
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(content.contact.email || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-landing-edit-path="contact.email"
                  data-landing-edit-label="Email address"
                >
                  {content.contact.email}
                </a>
              </div>
              <CopyButton value={content.contact.email} label="email address" copy={copy} />
            </div>
            <div className="contact-detail-card">
              <span className="contact-detail-icon" aria-hidden="true"><FiFacebook /></span>
              <div className="contact-detail-copy">
                <label data-landing-edit-path={`copy.${language}.facebook`} data-landing-edit-label="Facebook label">{copy.facebook}</label>
                <a
                  href={content.contact.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-landing-edit-path="contact.facebookLabel"
                  data-landing-edit-label="Facebook page"
                  data-landing-edit-secondary-path="contact.facebookUrl"
                  data-landing-edit-secondary-label="Facebook page URL"
                >
                  {normalizeDasmarinasText(content.contact.facebookLabel)}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
