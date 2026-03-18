import { Link } from 'react-router-dom'
import './LegalPages.css'

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <h1>Terms and Conditions</h1>
        <p className="legal-updated">Last updated: March 17, 2026</p>

        <section className="legal-section">
          <h2>1. Purpose of the Website</h2>
          <p>
            This website is provided by the Bureau of Fire Protection Dasmarinas City Fire Station
            to share public information, fire safety resources, contact details, and related service
            updates.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Acceptable Use</h2>
          <p>
            Users agree to use this website lawfully and responsibly. You must not attempt to damage,
            disrupt, or gain unauthorized access to any system, account, or data connected to this site.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Informational Nature</h2>
          <p>
            Information on this website is for general guidance. While we strive for accuracy, we do not
            guarantee that all content is complete, up-to-date, or error-free at all times.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. External Links</h2>
          <p>
            This site may contain links to third-party websites. We are not responsible for the content,
            policies, or security practices of external services.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Changes to These Terms</h2>
          <p>
            We may update these terms when needed to reflect legal, policy, or operational changes.
            Continued use of the website means you accept the revised terms.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Contact</h2>
          <p>
            For questions regarding these terms, contact the station through the contact details shown
            on the main website.
          </p>
        </section>

        <Link className="legal-back" to="/">Back to Home</Link>
      </article>
    </main>
  )
}
