import { useEffect, useRef, useState } from 'react';
import './Header.css';
import logo from '../assets/bfp_dasma.png';
import { Link, useLocation } from 'react-router-dom';
import { FiLogIn, FiMenu, FiX } from 'react-icons/fi';

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'about', label: 'About' },
  { id: 'process', label: 'Online Application' },
  { id: 'contact', label: 'Contact Us' },
  { id: 'faq', label: 'FAQ' }
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  const suppressTrackingRef = useRef(false);
  const suppressTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isLandingPage) return undefined;

    let animationFrameId = 0;

    const updateActiveSection = () => {
      // While a nav click is smooth-scrolling the page toward its target section,
      // skip updates so the indicator doesn't flash through every section it
      // scrolls past before settling on the one that was actually clicked.
      if (suppressTrackingRef.current) return;

      const marker = window.scrollY + 150;
      let currentSection = NAV_ITEMS[0].id;

      NAV_ITEMS.forEach(({ id }) => {
        const section = document.getElementById(id);
        if (section && section.offsetTop <= marker) {
          currentSection = id;
        }
      });

      setActiveSection(currentSection);
    };

    const handleScroll = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isLandingPage]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => () => clearTimeout(suppressTimeoutRef.current), []);

  const handleSectionClick = (sectionId) => {
    setActiveSection(sectionId);
    setMenuOpen(false);

    suppressTrackingRef.current = true;
    clearTimeout(suppressTimeoutRef.current);

    const resumeTracking = () => {
      suppressTrackingRef.current = false;
      window.removeEventListener('scrollend', resumeTracking);
    };
    window.addEventListener('scrollend', resumeTracking);
    // Fallback in case `scrollend` doesn't fire (unsupported browser, no scroll needed).
    suppressTimeoutRef.current = setTimeout(resumeTracking, 1500);
  };

  const sectionHref = (sectionId) => `${isLandingPage ? '' : '/'}#${sectionId}`;

  return (
    <header className="header">
      <div className="header-container">
        <a className="landing-brand" href={sectionHref('home')} onClick={() => setMenuOpen(false)}>
          <img src={logo} alt="BFP Dasmarinas City Fire Station seal" className="landing-brand-logo" />
          <div className="landing-brand-text">
            <h4>BUREAU OF FIRE PROTECTION</h4>
            <h4>DASMARINAS CITY FIRE STATION</h4>
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

        {menuOpen && (
          <button
            type="button"
            className="landing-nav-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <nav id="landing-navigation" className={`nav ${menuOpen ? 'active' : ''}`} aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={sectionHref(item.id)}
              className={isLandingPage && activeSection === item.id ? 'is-active' : ''}
              aria-current={isLandingPage && activeSection === item.id ? 'location' : undefined}
              onClick={() => handleSectionClick(item.id)}
            >
              {item.label}
            </a>
          ))}

          <Link
            to="/organizational-chart"
            className={location.pathname === '/organizational-chart' ? 'is-active' : ''}
            aria-current={location.pathname === '/organizational-chart' ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}
          >
            Organizational Chart
          </Link>

          <Link className="landing-login-link login-btn" to="/login" onClick={() => setMenuOpen(false)}>
            <FiLogIn aria-hidden="true" />
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
