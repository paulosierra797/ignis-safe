import './Footer.css'
import logo from '../assets/bfp_dasma.png'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-logo">
          <img src={logo} alt="BFP Dasmariñas City Fire Station seal" className="footer-logo-image" />
          <h3>BUREAU OF FIRE PROTECTION DASMARIÑAS CITY FIRE STATION</h3>
        </div>
        <div className="footer-links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </div>
      </div>
    </footer>
  )
}
