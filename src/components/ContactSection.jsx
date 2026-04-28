import './ContactSection.css'
import firestation from '../assets/firestation.jpg'
import { useLandingContent } from '../context/LandingContentContext';

const toPhoneHref = (value) => `tel:${String(value || '').replace(/[^\d+]/g, '')}`;


export default function ContactSection() {
  const { content } = useLandingContent();

  return (
    <section className="contact" id="contact">
      <div className="contact-container">
        <div className="contact-image">
           <img src={firestation} alt="firestation" className="hero-image-img" />
        </div>
        
        <div className="contact-content">
          <h2>{content.contact.title}</h2>
          
          <div className="emergency-title">
            <h3>{content.contact.emergencyTitle}</h3>
            <div className="phone">
              <div className="hotline-row">
                <span className="hotline-icon" aria-hidden="true">&#9742;</span>
                <span className="hotline-label">Landline:</span>
                <a href={toPhoneHref(content.contact.landlinePrimary)}>{content.contact.landlinePrimary}</a>
                <span className="hotline-separator">/</span>
                <a href={toPhoneHref(content.contact.landlineSecondary)}>{content.contact.landlineSecondary}</a>
              </div>
              <div className="hotline-row">
                <span className="hotline-icon" aria-hidden="true">&#128241;</span>
                <span className="hotline-label">Mobile:</span>
                <a href={toPhoneHref(content.contact.mobile)}>{content.contact.mobile}</a>
              </div>
            </div>
          </div>
          
          <div className="contact-info">
            <div className="info-item">
              <label>EMAIL:</label>
              <a
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(content.contact.email || '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {content.contact.email}
              </a>
            </div>
            <div className="info-item">
              <label>FACEBOOK:</label>
              <a href={content.contact.facebookUrl} target="_blank" rel="noopener noreferrer">
                {content.contact.facebookLabel}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
