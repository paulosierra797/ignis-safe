import { Link } from 'react-router-dom'
import './LegalPages.css'

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: March 17, 2026</p>

        <section className="legal-section">
          <h2>1. Information We Collect</h2>
          <p>
            We may collect basic information you provide, such as your name, contact details, and
            submitted concerns, when you interact with forms or communication channels on this site.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. How We Use Information</h2>
          <ul>
            <li>To respond to inquiries and service-related requests.</li>
            <li>To improve website content, performance, and user experience.</li>
            <li>To maintain records required for public service operations.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Data Protection</h2>
          <p>
            We apply reasonable administrative and technical safeguards to protect personal data.
            However, no online transmission or storage method is completely secure.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Sharing of Information</h2>
          <p>
            We do not sell personal information. Data may only be shared when required by law, policy,
            or for legitimate public safety and operational purposes.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Your Rights</h2>
          <p>
            Subject to applicable laws and regulations, you may request access, correction, or updates
            to your personal information by contacting the office through official channels.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Policy Updates</h2>
          <p>
            This policy may be updated periodically. Material changes will be reflected by updating the
            "Last updated" date on this page.
          </p>
        </section>

        <Link className="legal-back" to="/">Back to Home</Link>
      </article>
    </main>
  )
}
