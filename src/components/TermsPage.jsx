import LegalPageShell from './LegalPageShell'
import { useLandingContent } from '../context/LandingContentContext'

const EFFECTIVE_DATE = 'September 13, 2026'

const TERMS_SECTIONS = [
  { id: 'terms-scope', label: 'Scope and acceptance' },
  { id: 'terms-services', label: 'Portal services' },
  { id: 'terms-accounts', label: 'Accounts and access' },
  { id: 'terms-use', label: 'Acceptable use' },
  { id: 'terms-submissions', label: 'Messages and submissions' },
  { id: 'terms-emergencies', label: 'Emergency and service information' },
  { id: 'terms-third-parties', label: 'Third-party services' },
  { id: 'terms-content', label: 'Content and intellectual property' },
  { id: 'terms-availability', label: 'Availability and changes' },
  { id: 'terms-enforcement', label: 'Suspension and enforcement' },
  { id: 'terms-liability', label: 'Responsibility and liability' },
  { id: 'terms-law', label: 'Governing law and contact' },
]

export default function TermsPage() {
  const { content } = useLandingContent()
  const contactEmail = content.contact.email

  return (
    <LegalPageShell
      documentType="terms"
      title="Terms and Conditions"
      summary="Rules for using the IGNIS SAFE public website, authorized workspaces, attendance tools, communications, and fire-safety learning services."
      effectiveDate={EFFECTIVE_DATE}
      version="2.0"
      sections={TERMS_SECTIONS}
    >
      <div className="legal-introduction">
        <p>
          These Terms and Conditions govern access to and use of IGNIS SAFE, a digital service used
          by the Bureau of Fire Protection Dasmariñas City Fire Station for public information,
          personnel operations, attendance, announcements, reporting, and fire-safety learning.
        </p>
        <p>
          Please read these terms together with the <a href="/privacy">Privacy Policy</a>. By using
          the public website, submitting information, or signing in to an authorized account, you
          acknowledge that you have read and agree to follow these terms. If you do not agree, do
          not use the affected service.
        </p>
      </div>

      <section className="legal-section" id="terms-scope">
        <span className="legal-section-number">01</span>
        <h2>Scope and acceptance</h2>
        <p>
          These terms apply to public visitors, mobile learning users, BFP personnel, administrators,
          and any person who submits information through IGNIS SAFE. Additional BFP policies,
          employment rules, records-management requirements, or written instructions may also apply
          to authorized users. Where a controlling law or official policy conflicts with these terms,
          the controlling law or policy prevails.
        </p>
        <p>
          A person using IGNIS SAFE on behalf of an office or organization represents that they are
          authorized to do so. Parents or lawful guardians should supervise minors whenever consent
          or assistance is required for an account or submission.
        </p>
      </section>

      <section className="legal-section" id="terms-services">
        <span className="legal-section-number">02</span>
        <h2>Portal services</h2>
        <p>Depending on your role and permissions, IGNIS SAFE may provide:</p>
        <ul>
          <li>Public announcements, station information, contacts, and organizational information.</li>
          <li>Links and guidance for fire-safety inspection and certificate-related processes.</li>
          <li>Public website conversations with authorized station representatives.</li>
          <li>Personnel schedules, leave requests, attendance verification, reports, and announcements.</li>
          <li>Administrator tools for accounts, content, audit records, analytics, and operational oversight.</li>
          <li>Fire-safety learning modules, assessments, progress records, simulations, badges, and completion information.</li>
        </ul>
        <p>
          IGNIS SAFE supports station services but does not replace official emergency channels,
          legally required forms, in-person verification, or other government systems when those are required.
        </p>
      </section>

      <section className="legal-section" id="terms-accounts">
        <span className="legal-section-number">03</span>
        <h2>Accounts and authorized access</h2>
        <p>
          You must provide accurate information, use only the account assigned to you, protect your
          password, verification codes, trusted-device credentials, and visitor conversation recovery
          code, and promptly report suspected unauthorized access. Do not share access credentials or
          attempt to assume another person's identity or role.
        </p>
        <p>
          Personnel and administrator access is role-based and limited to authorized official work.
          Account activity may be recorded for security, accountability, and audit purposes. The station
          may require password resets, additional verification, device removal, or profile confirmation
          when needed to protect the service.
        </p>
      </section>

      <section className="legal-section" id="terms-use">
        <span className="legal-section-number">04</span>
        <h2>Acceptable use</h2>
        <p>You must not use IGNIS SAFE to:</p>
        <ul>
          <li>Break applicable law, violate another person's rights, or interfere with public service operations.</li>
          <li>Access, test, scan, alter, delete, or disclose accounts, systems, or data without authorization.</li>
          <li>Upload malicious code, bypass security controls, automate abusive requests, or disrupt availability.</li>
          <li>Submit false, misleading, threatening, harassing, discriminatory, obscene, or unlawful content.</li>
          <li>Impersonate another person, falsify attendance or reports, or manipulate learning and assessment records.</li>
          <li>Copy, scrape, republish, or commercially exploit protected content except as allowed by law or written permission.</li>
        </ul>
        <p>
          Security research or testing requires prior written authorization. Suspected vulnerabilities
          should be reported privately through the official station contact channels.
        </p>
      </section>

      <section className="legal-section" id="terms-submissions">
        <span className="legal-section-number">05</span>
        <h2>Messages, files, and other submissions</h2>
        <p>
          You are responsible for information and files you submit, including visitor messages, reports,
          leave documents, profile information, photographs, and administrative content. Submit only
          information that is relevant, accurate, lawful, and that you are authorized to provide.
        </p>
        <p>
          Do not send passwords, financial account credentials, or unnecessary sensitive personal data
          through public messaging. By submitting content, you authorize the station to receive, store,
          review, reproduce, and use it as reasonably necessary to provide the requested service, maintain
          official records, secure the portal, and comply with law and policy. This authorization does not
          transfer ownership beyond what is necessary for those purposes.
        </p>
      </section>

      <section className="legal-section legal-section--important" id="terms-emergencies">
        <span className="legal-section-number">06</span>
        <h2>Emergency and service information</h2>
        <p>
          <strong>IGNIS SAFE is not an emergency reporting or dispatch service.</strong> Website messages
          and account notifications may not be monitored continuously. For a fire, rescue, medical, or
          other immediate emergency, call <a href="tel:911">911</a> or use the appropriate official emergency channel.
        </p>
        <p>
          Public guidance and announcements are provided in good faith and may change as official rules,
          schedules, or conditions change. Confirm time-sensitive requirements through the responsible
          government office before relying on them for a filing, payment, inspection, or deadline.
        </p>
      </section>

      <section className="legal-section" id="terms-third-parties">
        <span className="legal-section-number">07</span>
        <h2>Third-party websites and services</h2>
        <p>
          IGNIS SAFE may link to external government portals, social media pages, map, email, storage,
          authentication, hosting, or other service providers. Their own terms and privacy notices apply
          when you leave IGNIS SAFE or interact directly with them. A link does not guarantee availability
          or constitute endorsement of unrelated third-party content.
        </p>
        <p>
          Payments and formal applications completed on an external portal are governed by that portal's
          rules. IGNIS SAFE does not independently control external transactions, outages, or content.
        </p>
      </section>

      <section className="legal-section" id="terms-content">
        <span className="legal-section-number">08</span>
        <h2>Content and intellectual property</h2>
        <p>
          IGNIS SAFE's original interface, software, arrangement, and locally created materials are
          protected to the extent allowed by applicable law. Government seals, marks, official records,
          third-party materials, and linked resources remain subject to their respective laws, policies,
          permissions, and ownership rights.
        </p>
        <p>
          You may view and use public fire-safety information for lawful personal, educational, and public
          service purposes, provided it is not misrepresented, altered deceptively, or presented as an
          official endorsement. Written authorization may be required for commercial reuse or use of official marks.
        </p>
      </section>

      <section className="legal-section" id="terms-availability">
        <span className="legal-section-number">09</span>
        <h2>Availability, maintenance, and changes</h2>
        <p>
          The station may maintain, improve, suspend, replace, or discontinue any part of IGNIS SAFE.
          Availability may be affected by maintenance, connectivity, security incidents, provider outages,
          emergencies, or events beyond reasonable control. Reasonable efforts will be made to preserve
          service continuity and data integrity, but uninterrupted or error-free operation is not guaranteed.
        </p>
        <p>
          Features and content may be corrected or updated without advance notice. Material changes to
          these terms will be shown by a revised effective date or other appropriate notice.
        </p>
      </section>

      <section className="legal-section" id="terms-enforcement">
        <span className="legal-section-number">10</span>
        <h2>Suspension, removal, and enforcement</h2>
        <p>
          Access may be restricted, suspended, or revoked when an account is inactive, unauthorized,
          compromised, no longer required for official duties, or used in violation of these terms. Content
          may be moderated, archived, retained, or removed in accordance with operational needs, due process,
          records obligations, and applicable law.
        </p>
        <p>
          Suspected unlawful activity may be preserved and referred to the appropriate authorities. Ending
          access does not remove obligations or liabilities that arose before access ended.
        </p>
      </section>

      <section className="legal-section" id="terms-liability">
        <span className="legal-section-number">11</span>
        <h2>Responsibility and limitation of liability</h2>
        <p>
          To the extent permitted by Philippine law, IGNIS SAFE is provided for official and public-service
          support on an "as available" basis. The station is not responsible for loss caused solely by a
          user's unlawful conduct, failure to secure credentials, inaccurate submission, unsupported device,
          external service, or use of outdated information after a correction has been published.
        </p>
        <p>
          Nothing in these terms excludes a responsibility that cannot lawfully be excluded, limits a data
          subject's rights, or prevents a person from using an available administrative or legal remedy.
        </p>
      </section>

      <section className="legal-section" id="terms-law">
        <span className="legal-section-number">12</span>
        <h2>Governing law, questions, and notices</h2>
        <p>
          These terms are governed by the laws of the Republic of the Philippines, including applicable
          data privacy, electronic transactions, cybersecurity, public records, and government-service rules.
          Any dispute should first be raised through the station's official contact channels so it can be
          reviewed and addressed by the proper office.
        </p>
        <p>
          Questions about these terms may be sent to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          or raised through the contact information published on the IGNIS SAFE website. Emergency concerns
          must not be sent through email or website messaging.
        </p>
      </section>
    </LegalPageShell>
  )
}
