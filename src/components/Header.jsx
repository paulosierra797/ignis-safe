import { useCallback, useEffect, useRef, useState } from 'react';
import './Header.css';
import logo from '../assets/bfp_dasma-280.webp';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiChevronDown, FiGlobe, FiLogIn, FiMenu, FiPhoneCall, FiX } from 'react-icons/fi';
import { useLandingContent } from '../context/LandingContentContext';
import { getLandingUiCopy } from '../utils/landingLanguage';

// Order matches the actual DOM order of sections on the landing page — the
// scroll-spy loop below relies on this order, which is independent of the
// order these ids are presented in the nav.
const SCROLL_SECTION_IDS = ['home', 'announcements', 'process', 'about', 'contact', 'faq'];

const PRIMARY_NAV_ITEMS = [
  { id: 'home', labelKey: 'home' },
  { id: 'announcements', labelKey: 'announcements' },
  { id: 'process', labelKey: 'onlineApplication' }
];

const ABOUT_MENU_ITEMS = [
  { id: 'about', labelKey: 'aboutUs', type: 'section' },
  { id: 'faq', labelKey: 'faq', type: 'section' },
  { id: 'organizational-chart', labelKey: 'organizationalChart', type: 'route', to: '/organizational-chart' }
];

const CONTACT_MENU_ITEMS = [
  { id: 'contact', labelKey: 'contactUs', type: 'section' },
  { id: 'send-message', labelKey: 'sendMessage', type: 'route', to: '/send-message' }
];

// Sets up the shared outside-click / Escape-to-close behavior for a hover-or-click
// nav dropdown. Takes refs rather than returning them, since a custom hook handing
// back an object containing a ref is ambiguous for the React Compiler's ref-safety
// analysis (it can't tell which returned fields are refs vs plain values).
function useDropdownAutoClose(open, onClose, containerRef, toggleRef) {
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open, onClose, containerRef]);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
        toggleRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose, toggleRef]);
}

function NavDropdown({
  menuId,
  ariaLabel,
  toggleLabel,
  toggleActive,
  items,
  open,
  containerRef,
  toggleRef,
  itemRefs,
  onToggleClick,
  onToggleKeyDown,
  onMouseEnter,
  onMouseLeave,
  onBlur,
  onItemKeyDown,
  isLandingPage,
  activeSection,
  location,
  sectionHref,
  onItemSectionClick,
  onItemRouteClick
}) {
  return (
    <div
      className="nav-dropdown"
      ref={containerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onBlur={onBlur}
    >
      <button
        type="button"
        ref={toggleRef}
        className={`nav-link nav-dropdown-toggle ${toggleActive ? 'is-active' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onToggleClick}
        onKeyDown={onToggleKeyDown}
      >
        {toggleLabel}
        <FiChevronDown aria-hidden="true" className={`nav-dropdown-arrow ${open ? 'open' : ''}`} />
      </button>

      <ul id={menuId} role="menu" aria-label={ariaLabel} className={`nav-dropdown-menu ${open ? 'open' : ''}`}>
        {items.map((item, index) => (
          <li key={item.id} role="none">
            {item.type === 'route' ? (
              <Link
                role="menuitem"
                ref={(el) => { itemRefs.current[index] = el; }}
                to={item.to}
                className={location.pathname === item.to ? 'is-active' : ''}
                aria-current={location.pathname === item.to ? 'page' : undefined}
                onClick={onItemRouteClick}
                onKeyDown={(event) => onItemKeyDown(event, index)}
              >
                {item.label}
              </Link>
            ) : (
              <a
                role="menuitem"
                ref={(el) => { itemRefs.current[index] = el; }}
                href={sectionHref(item.id)}
                className={isLandingPage && activeSection === item.id ? 'is-active' : ''}
                aria-current={isLandingPage && activeSection === item.id ? 'location' : undefined}
                onClick={(event) => onItemSectionClick(event, item.id)}
                onKeyDown={(event) => onItemKeyDown(event, index)}
              >
                {item.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Header() {
  const { language, toggleLanguage } = useLandingContent();
  const copy = getLandingUiCopy(language);
  const [menuOpen, setMenuOpen] = useState(false);
  // Single source of truth for which nav dropdown is open — only one of
  // 'about' | 'contact' | null at a time, so opening one always closes the
  // other instead of letting them overlap via independent hover states.
  const [openDropdown, setOpenDropdown] = useState(null);
  const aboutOpen = openDropdown === 'about';
  const contactOpen = openDropdown === 'contact';
  const location = useLocation();
  const [activeSection, setActiveSection] = useState(() => {
    // Seed the indicator from the URL hash on first render so a cross-page
    // nav link (which mounts this Header fresh with a target hash already
    // in place) doesn't briefly show "Home" before the scroll effect runs.
    const initialHashId = location.hash ? location.hash.slice(1) : null;
    return initialHashId && SCROLL_SECTION_IDS.includes(initialHashId)
      ? initialHashId
      : 'home';
  });
  const navigate = useNavigate();
  const isLandingPage = location.pathname === '/';
  const isAboutActive =
    (isLandingPage && (activeSection === 'about' || activeSection === 'faq')) ||
    location.pathname === '/organizational-chart';
  const isContactActive =
    (isLandingPage && activeSection === 'contact') || location.pathname === '/send-message';
  const suppressTrackingRef = useRef(false);
  const suppressTimeoutRef = useRef(null);
  // Hash present the moment this Header instance mounts — set when a
  // cross-page nav link routes here with a target section in the URL.
  const initialHashRef = useRef(location.hash);
  const aboutRef = useRef(null);
  const aboutToggleRef = useRef(null);
  const aboutItemRefs = useRef([]);
  const aboutHoverTimeoutRef = useRef(null);
  const contactRef = useRef(null);
  const contactToggleRef = useRef(null);
  const contactItemRefs = useRef([]);
  const contactHoverTimeoutRef = useRef(null);
  const supportsHoverRef = useRef(
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
  const primaryNavItems = PRIMARY_NAV_ITEMS.map((item) => ({ ...item, label: copy[item.labelKey] }));
  const aboutMenuItems = ABOUT_MENU_ITEMS.map((item) => ({ ...item, label: copy[item.labelKey] }));
  const contactMenuItems = CONTACT_MENU_ITEMS.map((item) => ({ ...item, label: copy[item.labelKey] }));

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
    const sections = SCROLL_SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      if (suppressTrackingRef.current) return;

      entries.forEach((entry) => {
        if (entry.isIntersecting) setActiveSection(entry.target.id);
      });
    }, {
      rootMargin: '-140px 0px -65% 0px',
      threshold: 0,
    });

    sections.forEach((section) => observer.observe(section));

    const initialHashId = initialHashRef.current ? initialHashRef.current.slice(1) : null;
    if (initialHashId && SCROLL_SECTION_IDS.includes(initialHashId)) {
      // Arrived here via a cross-page nav link — the router's own scroll
      // effect is about to animate to this section, so keep the indicator
      // (already seeded from the hash above) pinned instead of letting the
      // scroll-driven heuristic below race it.
      suppressTrackingUntilScrollEnd();
    }

    return () => {
      observer.disconnect();
    };
  }, [isLandingPage, suppressTrackingUntilScrollEnd]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setOpenDropdown(null);
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => () => clearTimeout(suppressTimeoutRef.current), []);

  const openAbout = useCallback(() => setOpenDropdown('about'), []);
  const closeAbout = useCallback(
    () => setOpenDropdown((current) => (current === 'about' ? null : current)),
    []
  );
  const toggleAbout = useCallback(
    () => setOpenDropdown((current) => (current === 'about' ? null : 'about')),
    []
  );

  const openContact = useCallback(() => setOpenDropdown('contact'), []);
  const closeContact = useCallback(
    () => setOpenDropdown((current) => (current === 'contact' ? null : current)),
    []
  );
  const toggleContact = useCallback(
    () => setOpenDropdown((current) => (current === 'contact' ? null : 'contact')),
    []
  );

  // Close each dropdown on outside click/tap and on Escape.
  useDropdownAutoClose(aboutOpen, closeAbout, aboutRef, aboutToggleRef);
  useDropdownAutoClose(contactOpen, closeContact, contactRef, contactToggleRef);

  useEffect(() => () => {
    clearTimeout(aboutHoverTimeoutRef.current);
    clearTimeout(contactHoverTimeoutRef.current);
  }, []);

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

  const handleAboutSectionSelect = (event, sectionId) => {
    handleSectionClick(event, sectionId);
    closeAbout();
  };

  const handleAboutRouteSelect = () => {
    closeAbout();
    setMenuOpen(false);
  };

  const handleAboutToggleClick = () => {
    // On hover-capable pointers, a real click always fires mouseenter first
    // (which already opens the menu), so toggling here would immediately
    // flip it back closed. Just ensure it's open; mouseleave/outside-click/
    // Escape/item-select handle closing. Touch/no-hover devices get a
    // normal open/close toggle since there's no hover to open it for them.
    if (supportsHoverRef.current) {
      openAbout();
    } else {
      toggleAbout();
    }
  };

  const handleAboutMouseEnter = () => {
    if (!supportsHoverRef.current) return;
    clearTimeout(aboutHoverTimeoutRef.current);
    openAbout();
  };

  const handleAboutMouseLeave = () => {
    if (!supportsHoverRef.current) return;
    aboutHoverTimeoutRef.current = setTimeout(closeAbout, 150);
  };

  const handleAboutBlur = (event) => {
    if (aboutRef.current && !aboutRef.current.contains(event.relatedTarget)) {
      closeAbout();
    }
  };

  const handleAboutToggleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAbout();
      requestAnimationFrame(() => aboutItemRefs.current[0]?.focus());
    }
  };

  const handleAboutItemKeyDown = (event, index) => {
    const items = aboutItemRefs.current;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  const handleContactSectionSelect = (event, sectionId) => {
    handleSectionClick(event, sectionId);
    closeContact();
  };

  const handleContactRouteSelect = () => {
    closeContact();
    setMenuOpen(false);
  };

  const handleContactToggleClick = () => {
    if (supportsHoverRef.current) {
      openContact();
    } else {
      toggleContact();
    }
  };

  const handleContactMouseEnter = () => {
    if (!supportsHoverRef.current) return;
    clearTimeout(contactHoverTimeoutRef.current);
    openContact();
  };

  const handleContactMouseLeave = () => {
    if (!supportsHoverRef.current) return;
    contactHoverTimeoutRef.current = setTimeout(closeContact, 150);
  };

  const handleContactBlur = (event) => {
    if (contactRef.current && !contactRef.current.contains(event.relatedTarget)) {
      closeContact();
    }
  };

  const handleContactToggleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openContact();
      requestAnimationFrame(() => contactItemRefs.current[0]?.focus());
    }
  };

  const handleContactItemKeyDown = (event, index) => {
    const items = contactItemRefs.current;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  return (
    <header className="header">
      <a className="landing-skip-link" href="#main-content">Skip to main content</a>
      <div className="landing-emergency-bar">
        <div className="landing-emergency-content">
          <a href="tel:911" className="landing-emergency-call">
            <FiPhoneCall aria-hidden="true" />
            <span>{copy.emergencyMessage}</span>
          </a>
          <a
            href={sectionHref('contact')}
            className="landing-hotline-link"
            onClick={(event) => handleSectionClick(event, 'contact')}
          >
            {copy.stationHotlines}
          </a>
        </div>
      </div>
      <div className="header-container">
        <a className="landing-brand" href={sectionHref('home')} onClick={(event) => handleSectionClick(event, 'home')}>
          <span className="landing-brand-logo-frame">
            <img src={logo} alt="BFP Dasmariñas City Fire Station seal" className="landing-brand-logo" width="280" height="234" />
          </span>
          <div className="landing-brand-text">
            <h4>BUREAU OF FIRE PROTECTION</h4>
            <h4>DASMARIÑAS CITY FIRE STATION</h4>
          </div>
        </a>

        <button
          className="menu-btn"
          onClick={() => {
            setMenuOpen((open) => !open);
            setOpenDropdown(null);
          }}
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
            onClick={() => {
              setMenuOpen(false);
              setOpenDropdown(null);
            }}
          />
        )}

        <nav id="landing-navigation" className={`nav ${menuOpen ? 'active' : ''}`} aria-label="Main navigation">
          {primaryNavItems.map((item) => (
            <a
              key={item.id}
              className={`nav-link ${isLandingPage && activeSection === item.id ? 'is-active' : ''}`}
              href={sectionHref(item.id)}
              aria-current={isLandingPage && activeSection === item.id ? 'location' : undefined}
              onClick={(event) => handleSectionClick(event, item.id)}
            >
              {item.label}
            </a>
          ))}

          <NavDropdown
            menuId="about-us-menu"
            ariaLabel={copy.aboutUs}
            toggleLabel={copy.aboutUs}
            toggleActive={isAboutActive}
            items={aboutMenuItems}
            open={aboutOpen}
            containerRef={aboutRef}
            toggleRef={aboutToggleRef}
            itemRefs={aboutItemRefs}
            onToggleClick={handleAboutToggleClick}
            onToggleKeyDown={handleAboutToggleKeyDown}
            onMouseEnter={handleAboutMouseEnter}
            onMouseLeave={handleAboutMouseLeave}
            onBlur={handleAboutBlur}
            onItemKeyDown={handleAboutItemKeyDown}
            isLandingPage={isLandingPage}
            activeSection={activeSection}
            location={location}
            sectionHref={sectionHref}
            onItemSectionClick={handleAboutSectionSelect}
            onItemRouteClick={handleAboutRouteSelect}
          />

          <NavDropdown
            menuId="contact-us-menu"
            ariaLabel={copy.contactUs}
            toggleLabel={copy.contactUs}
            toggleActive={isContactActive}
            items={contactMenuItems}
            open={contactOpen}
            containerRef={contactRef}
            toggleRef={contactToggleRef}
            itemRefs={contactItemRefs}
            onToggleClick={handleContactToggleClick}
            onToggleKeyDown={handleContactToggleKeyDown}
            onMouseEnter={handleContactMouseEnter}
            onMouseLeave={handleContactMouseLeave}
            onBlur={handleContactBlur}
            onItemKeyDown={handleContactItemKeyDown}
            isLandingPage={isLandingPage}
            activeSection={activeSection}
            location={location}
            sectionHref={sectionHref}
            onItemSectionClick={handleContactSectionSelect}
            onItemRouteClick={handleContactRouteSelect}
          />

          <button
            type="button"
            className="landing-language-toggle"
            onClick={toggleLanguage}
            aria-label={`Language: ${copy.languageName}. Switch to ${copy.alternateLanguageName}.`}
          >
            <FiGlobe aria-hidden="true" />
            <span>{copy.languageCode}</span>
          </button>

          <Link className="landing-login-link login-btn" to="/login" onClick={() => setMenuOpen(false)}>
            <FiLogIn aria-hidden="true" />
            {copy.login}
          </Link>
        </nav>
      </div>
    </header>
  );
}
