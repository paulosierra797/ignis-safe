import { useCallback, useEffect, useRef, useState } from 'react';
import './Header.css';
import logo from '../assets/bfp_dasma.png';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  const location = useLocation();
  const [activeSection, setActiveSection] = useState(() => {
    // Seed the indicator from the URL hash on first render so a cross-page
    // nav link (which mounts this Header fresh with a target hash already
    // in place) doesn't briefly show "Home" before the scroll effect runs.
    const initialHashId = location.hash ? location.hash.slice(1) : null;
    return initialHashId && NAV_ITEMS.some((item) => item.id === initialHashId)
      ? initialHashId
      : 'home';
  });
  const navigate = useNavigate();
  const isLandingPage = location.pathname === '/';
  const suppressTrackingRef = useRef(false);
  const suppressTimeoutRef = useRef(null);
  // Hash present the moment this Header instance mounts — set when a
  // cross-page nav link routes here with a target section in the URL.
  const initialHashRef = useRef(location.hash);

  const suppressTrackingUntilScrollEnd = useCallback(() => {
    suppressTrackingRef.current = true;
    clearTimeout(suppressTimeoutRef.current);

    const resumeTracking = () => {
      suppressTrackingRef.current = false;
      window.removeEventListener('scrollend', resumeTracking);
    };
    window.addEventListener('scrollend', resumeTracking);
    // Fallback in case `scrollend` doesn't fire (unsupported browser, no scroll needed).
    suppressTimeoutRef.current = setTimeout(resumeTracking, 1500);
  }, []);

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

    const initialHashId = initialHashRef.current ? initialHashRef.current.slice(1) : null;
    if (initialHashId && NAV_ITEMS.some((item) => item.id === initialHashId)) {
      // Arrived here via a cross-page nav link — the router's own scroll
      // effect is about to animate to this section, so keep the indicator
      // (already seeded from the hash above) pinned instead of letting the
      // scroll-driven heuristic below race it.
      suppressTrackingUntilScrollEnd();
    } else {
      updateActiveSection();
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isLandingPage, suppressTrackingUntilScrollEnd]);

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

  const handleSectionClick = (event, sectionId) => {
    setMenuOpen(false);

    if (!isLandingPage) {
      // Not on the landing page: hand off to the router so it mounts the
      // homepage first, then let the hash-scroll effect there take it from
      // there instead of relying on the browser's native (and unreliable,
      // pre-hydration) anchor-scroll for a full page navigation.
      event.preventDefault();
      navigate({ pathname: '/', hash: `#${sectionId}` });
      return;
    }

    setActiveSection(sectionId);
    suppressTrackingUntilScrollEnd();
  };

  const sectionHref = (sectionId) => `${isLandingPage ? '' : '/'}#${sectionId}`;

  return (
    <header className="header">
      <div className="header-container">
        <a className="landing-brand" href={sectionHref('home')} onClick={(event) => handleSectionClick(event, 'home')}>
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
              onClick={(event) => handleSectionClick(event, item.id)}
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
