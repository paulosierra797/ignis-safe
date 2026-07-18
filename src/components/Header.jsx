import { useState } from 'react';
import './Header.css';
import logo from '../assets/bfp_dasma.png';
import { Link } from 'react-router-dom';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <img src={logo} alt="Logo" className="logo-icon" />
          <div className="logo-text">
            <h4>BUREAU OF FIRE PROTECTION</h4>
            <h4>DASMARIÑAS CITY FIRE STATION</h4>
          </div>
        </div>

        <button
          className="menu-btn"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>

        <nav className={`nav ${menuOpen ? 'active' : ''}`}>
          <a href="#home" onClick={() => setMenuOpen(false)}>Home</a>
          <a href="#announcements" onClick={() => setMenuOpen(false)}>Announcements</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <a href="#contact" onClick={() => setMenuOpen(false)}>Contact Us</a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>

          <Link to="/login" onClick={() => setMenuOpen(false)}>
            <button className="login-btn">Login</button>
          </Link>
        </nav>
      </div>
    </header>
  );
}