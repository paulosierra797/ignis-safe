import './Footer.css'
import logo from '../assets/bfp_dasma.png'
import { Link, useLocation } from 'react-router-dom'
import { FiFacebook, FiMail, FiPhone } from 'react-icons/fi'
import { useLandingContent } from '../context/LandingContentContext'
import { getLandingUiCopy, normalizeDasmarinasText } from '../utils/landingLanguage'

export default function Footer() {
  const { content, language } = useLandingContent()
  const copy = getLandingUiCopy(language)
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
              <img src={logo} alt="BFP Dasmariñas City Fire Station seal" className="footer-logo-image" />
            </span>
            <div>
              <span>Bureau of Fire Protection</span>
              <h3>Dasmariñas City Fire Station</h3>
            </div>
          </div>
          <p>{copy.footerSummary}</p>
        </div>

        <nav className="footer-navigation" aria-label="Footer navigation">
          <h4>{copy.explore}</h4>
          <div className="footer-nav-links">
            <a href={sectionHref('home')}>{copy.home}</a>
            <a href={sectionHref('announcements')}>{copy.announcements}</a>
            <a href={sectionHref('about')}>{copy.aboutUs}</a>
            <a href={sectionHref('process')}>{copy.onlineApplication}</a>
            <a href={sectionHref('contact')}>{copy.contactUs}</a>
            <Link to="/send-message">{copy.sendMessage}</Link>
            <a href={sectionHref('faq')}>{copy.faq}</a>
          </div>
        </nav>

        <div className="footer-contact">
          <h4>{copy.contactAndEmergency}</h4>
          <a href="tel:911" className="footer-emergency-link">
            <FiPhone aria-hidden="true" />
            <span><small>{copy.emergencyHotline}</small><strong>911</strong></span>
          </a>
          <a href={`mailto:${content.contact.email}`}>
            <FiMail aria-hidden="true" />
            <span>{content.contact.email}</span>
          </a>
          <a href={content.contact.facebookUrl} target="_blank" rel="noopener noreferrer">
            <FiFacebook aria-hidden="true" />
            <span>{normalizeDasmarinasText(content.contact.facebookLabel)}</span>
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-container footer-bottom-inner">
          <p>&copy; {currentYear} BFP Dasmariñas City Fire Station. {copy.rightsReserved}</p>
          <div className="footer-links">
            <Link to="/terms">{copy.terms}</Link>
            <Link to="/privacy">{copy.privacy}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
