import './Footer.css'
import logo from '../assets/bfp_dasma-280.webp'
import { Link, useLocation } from 'react-router-dom'
import { FiFacebook, FiMail, FiPhone } from 'react-icons/fi'
import { useLandingContent } from '../context/LandingContentContext'
import { getLandingUiCopy, normalizeDasmarinasText } from '../utils/landingLanguage'

export default function Footer() {
  const { content, language } = useLandingContent()
  const copy = { ...getLandingUiCopy(language), ...(content.copy?.[language] || {}) }
  const location = useLocation()
  const currentYear = new Date().getFullYear()
  const isLandingPage = location.pathname === '/'
  const sectionHref = (sectionId) => `${isLandingPage ? '' : '/'}#${sectionId}`

  return (
    <footer className="footer">
      <div className="footer-container footer-main">
        <div className="footer-brand">
          <div className="footer-logo">
            <span className="footer-logo-image-frame">
              <img
                src={content.media?.brandLogo?.url || logo}
                alt="BFP Dasmariñas City Fire Station seal"
                className="footer-logo-image"
                loading="lazy"
                decoding="async"
                width="280"
                height="234"
                data-landing-edit-image="media.brandLogo"
                data-landing-edit-label="Station logo"
              />
            </span>
            <div>
              <span data-landing-edit-path={`copy.${language}.brandAgency`} data-landing-edit-label="Agency name">{copy.brandAgency}</span>
              <h3 data-landing-edit-path={`copy.${language}.brandStation`} data-landing-edit-label="Station name">{copy.brandStation}</h3>
            </div>
          </div>
          <p data-landing-edit-path={`copy.${language}.footerSummary`} data-landing-edit-label="Footer description" data-landing-edit-multiline="true">{copy.footerSummary}</p>
        </div>

        <nav className="footer-navigation" aria-label="Footer navigation">
          <h4 data-landing-edit-path={`copy.${language}.explore`} data-landing-edit-label="Footer navigation title">{copy.explore}</h4>
          <div className="footer-nav-links">
            <a href={sectionHref('home')} data-landing-edit-path={`copy.${language}.home`} data-landing-edit-label="Home link label">{copy.home}</a>
            <a href={sectionHref('announcements')} data-landing-edit-path={`copy.${language}.announcements`} data-landing-edit-label="Announcements link label">{copy.announcements}</a>
            <a href={sectionHref('about')} data-landing-edit-path={`copy.${language}.aboutUs`} data-landing-edit-label="About link label">{copy.aboutUs}</a>
            <a href={sectionHref('process')} data-landing-edit-path={`copy.${language}.onlineApplication`} data-landing-edit-label="Application link label">{copy.onlineApplication}</a>
            <a href={sectionHref('contact')} data-landing-edit-path={`copy.${language}.contactUs`} data-landing-edit-label="Contact link label">{copy.contactUs}</a>
            <Link to="/send-message" data-landing-edit-path={`copy.${language}.sendMessage`} data-landing-edit-label="Message link label">{copy.sendMessage}</Link>
            <a href={sectionHref('faq')} data-landing-edit-path={`copy.${language}.faq`} data-landing-edit-label="FAQ link label">{copy.faq}</a>
          </div>
        </nav>

        <div className="footer-contact">
          <h4 data-landing-edit-path={`copy.${language}.contactAndEmergency`} data-landing-edit-label="Footer contact title">{copy.contactAndEmergency}</h4>
          <a href="tel:911" className="footer-emergency-link">
            <FiPhone aria-hidden="true" />
            <span><small data-landing-edit-path={`copy.${language}.emergencyHotline`} data-landing-edit-label="Emergency hotline label">{copy.emergencyHotline}</small><strong>911</strong></span>
          </a>
          <a
            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(content.contact.email || '')}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FiMail aria-hidden="true" />
            <span data-landing-edit-path="contact.email" data-landing-edit-label="Email address">{content.contact.email}</span>
          </a>
          <a href={content.contact.facebookUrl} target="_blank" rel="noopener noreferrer">
            <FiFacebook aria-hidden="true" />
            <span data-landing-edit-path="contact.facebookLabel" data-landing-edit-label="Facebook page name">{normalizeDasmarinasText(content.contact.facebookLabel)}</span>
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-container footer-bottom-inner">
          <p>&copy; {currentYear} BFP Dasmariñas City Fire Station. <span data-landing-edit-path={`copy.${language}.rightsReserved`} data-landing-edit-label="Copyright text">{copy.rightsReserved}</span></p>
          <div className="footer-links">
            <Link to="/terms">{copy.terms}</Link>
            <Link to="/privacy">{copy.privacy}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
