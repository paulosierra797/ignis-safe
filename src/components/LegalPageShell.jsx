import { Link } from 'react-router-dom'
import { FiArrowLeft, FiExternalLink } from 'react-icons/fi'
import Header from './Header'
import Footer from './Footer'
import stationPhoto from '../assets/firestation-640.webp'
import './LegalPages.css'

export default function LegalPageShell({
  documentType,
  title,
  summary,
  effectiveDate,
  version,
  sections,
  children,
}) {
  return (
    <div className="legal-site-shell">
      <Header />
      <main className="legal-page" id="main-content">
        <header className="legal-hero">
          <img className="legal-hero-image" src={stationPhoto} alt="" aria-hidden="true" />
          <div className="legal-hero-overlay" aria-hidden="true" />
          <div className="legal-hero-inner">
            <p className="legal-eyebrow">IGNIS SAFE legal information</p>
            <h1>{title}</h1>
            <p className="legal-summary">{summary}</p>
            <dl className="legal-document-meta">
              <div><dt>Effective date</dt><dd>{effectiveDate}</dd></div>
              <div><dt>Document version</dt><dd>{version}</dd></div>
            </dl>
          </div>
        </header>

        <div className="legal-document-layout">
          <aside className="legal-toc-wrap">
            <nav className="legal-toc" aria-label={`${title} contents`}>
              <p>On this page</p>
              <ol>
                {sections.map((section) => (
                  <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>
                ))}
              </ol>
              <div className="legal-related-links">
                <span>Related document</span>
                {documentType === 'terms' ? (
                  <Link to="/privacy">Read the Privacy Policy</Link>
                ) : (
                  <Link to="/terms">Read the Terms and Conditions</Link>
                )}
              </div>
            </nav>
          </aside>

          <article className="legal-document">
            {children}
            <div className="legal-reference-note" aria-label="Official references">
              <h2>Official references</h2>
              <p>
                These documents are informed by applicable Philippine law and official guidance.
                The linked sources remain authoritative if their wording changes.
              </p>
              <div className="legal-reference-links">
                <a href="https://privacy.gov.ph/data-privacy-act/" target="_blank" rel="noopener noreferrer">
                  Data Privacy Act of 2012 <FiExternalLink aria-hidden="true" />
                </a>
                <a href="https://privacy.gov.ph/data-subject-rights/" target="_blank" rel="noopener noreferrer">
                  Data subject rights <FiExternalLink aria-hidden="true" />
                </a>
                <a href="https://lawphil.net/statutes/repacts/ra2000/ra_8792_2000.html" target="_blank" rel="noopener noreferrer">
                  Electronic Commerce Act <FiExternalLink aria-hidden="true" />
                </a>
                <a href="https://lawphil.net/statutes/repacts/ra2012/ra_10175_2012.html" target="_blank" rel="noopener noreferrer">
                  Cybercrime Prevention Act <FiExternalLink aria-hidden="true" />
                </a>
              </div>
            </div>
            <Link className="legal-back" to="/">
              <FiArrowLeft aria-hidden="true" />
              Return to the public website
            </Link>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  )
}
