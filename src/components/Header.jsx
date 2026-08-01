import { useEffect, useState } from 'react';
import './Header.css';
import logo from '../assets/bfp_dasma.png';
import { Link, useLocation } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';

const SECTION_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact Us' },
  { id: 'faq', label: 'FAQ' }
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const location = useLocation();
  const isLandingPage = location.pathname === '/';

  useEffect(() => {
    if (!isLandingPage) return undefined;

    const sections = SECTION_LINKS
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean);

    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [isLandingPage]);

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
          {SECTION_LINKS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={isLandingPage && activeSection === id ? 'active' : ''}
              aria-current={isLandingPage && activeSection === id ? 'true' : undefined}
              onClick={() => {
                setActiveSection(id);
                setMenuOpen(false);
              }}
            >
              {label}
            </a>
          ))}

          <Link
            to="/organizational-chart"
            className={location.pathname === '/organizational-chart' ? 'active' : ''}
            aria-current={location.pathname === '/organizational-chart' ? 'true' : undefined}
            onClick={() => setMenuOpen(false)}
          >
            Organizational Chart
          </Link>

          <Link className="landing-login-link" to="/login" onClick={() => setMenuOpen(false)}>
            <button className="login-btn">Login</button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
