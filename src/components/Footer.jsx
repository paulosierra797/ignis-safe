import './Footer.css'
import logo from '../assets/bfp_dasma.png'
import { Link } from 'react-router-dom'
import { FiFacebook, FiMail, FiPhone } from 'react-icons/fi'
import { useLandingContent } from '../context/LandingContentContext'

export default function Footer() {
  const { content } = useLandingContent()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="footer-container footer-main">
        <div className="footer-brand">
          <div className="footer-logo">
            <img src={logo} alt="BFP Dasmarinas City Fire Station seal" className="footer-logo-image" />
            <div>
              <span>Bureau of Fire Protection</span>
              <h3>Dasmarinas City Fire Station</h3>
            </div>
          </div>
          <p>Serving the community through fire prevention, emergency response, and public safety education.</p>
        </div>

        <nav className="footer-navigation" aria-label="Footer navigation">
          <h4>Explore</h4>
          <div className="footer-nav-links">
            <a href="#home">Home</a>
            <a href="#announcements">Announcements</a>
            <a href="#about">About</a>
            <a href="#process">Online Application</a>
            <a href="#contact">Contact Us</a>
            <a href="#faq">FAQ</a>
          </div>
        </nav>

        <div className="footer-contact">
          <h4>Contact and Emergency</h4>
          <a href="tel:911" className="footer-emergency-link">
            <FiPhone aria-hidden="true" />
            <span><small>Emergency hotline</small><strong>911</strong></span>
          </a>
          <a href={`mailto:${content.contact.email}`}>
            <FiMail aria-hidden="true" />
            <span>{content.contact.email}</span>
          </a>
          <a href={content.contact.facebookUrl} target="_blank" rel="noopener noreferrer">
            <FiFacebook aria-hidden="true" />
            <span>{content.contact.facebookLabel}</span>
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-container footer-bottom-inner">
          <p>&copy; {currentYear} BFP Dasmarinas City Fire Station. All rights reserved.</p>
          <div className="footer-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
