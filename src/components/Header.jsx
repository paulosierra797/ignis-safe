import { useState } from 'react';
import './Header.css';
import logo from '../assets/bfp_dasma.png';
import { Link } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="header">
      <div className="header-container">
        <a className="landing-brand" href="#home" onClick={() => setMenuOpen(false)}>
          <img src={logo} alt="BFP Dasmariñas City Fire Station seal" className="landing-brand-logo" />
          <div className="landing-brand-text">
            <h4>BUREAU OF FIRE PROTECTION</h4>
            <h4>DASMARIÑAS CITY FIRE STATION</h4>
          </div>
        </a>

        <button
          className="menu-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
        >
          {menuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
        </button>

        <nav id="landing-navigation" className={`nav ${menuOpen ? 'active' : ''}`} aria-label="Main navigation">
          <a href="#home" onClick={() => setMenuOpen(false)}>Home</a>
          <a href="#announcements" onClick={() => setMenuOpen(false)}>Announcements</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <a href="#contact" onClick={() => setMenuOpen(false)}>Contact Us</a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>

          <Link className="landing-login-link" to="/login" onClick={() => setMenuOpen(false)}>
            <button className="login-btn">Login</button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
