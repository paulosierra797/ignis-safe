import LegalPageShell from './LegalPageShell'
import { useLandingContent } from '../context/LandingContentContext'

const EFFECTIVE_DATE = 'September 13, 2026'

const PRIVACY_SECTIONS = [
  { id: 'privacy-scope', label: 'Scope and accountability' },
  { id: 'privacy-data', label: 'Personal data we process' },
  { id: 'privacy-sources', label: 'Where data comes from' },
  { id: 'privacy-purposes', label: 'Why data is processed' },
  { id: 'privacy-camera', label: 'Camera, face, and location data' },
  { id: 'privacy-storage', label: 'Browser storage and devices' },
  { id: 'privacy-sharing', label: 'Access and disclosure' },
  { id: 'privacy-retention', label: 'Retention and deletion' },
  { id: 'privacy-security', label: 'Security safeguards' },
  { id: 'privacy-rights', label: 'Your privacy rights' },
  { id: 'privacy-minors', label: 'Minors and supervised use' },
  { id: 'privacy-updates', label: 'Updates and contact' },
]

export default function PrivacyPage() {
  const { content } = useLandingContent()
  const contactEmail = content.contact.email

  return (
    <LegalPageShell
      documentType="privacy"
      title="Privacy Policy"
      summary="How IGNIS SAFE collects, uses, protects, retains, and shares personal data across its public, personnel, attendance, communication, and learning services."
      effectiveDate={EFFECTIVE_DATE}
      version="2.0"
      sections={PRIVACY_SECTIONS}
    >
      <div className="legal-introduction">
        <p>
          The Bureau of Fire Protection Dasmariñas City Fire Station respects your right to privacy.
          This Privacy Policy explains the personal data processing connected with IGNIS SAFE and is
          intended to provide the transparency required by Republic Act No. 10173, the Data Privacy Act
          of 2012, its Implementing Rules and Regulations, and related issuances.
        </p>
        <p>
          The data collected depends on how you use the service. Browsing public information does not
          require the same information as opening an account, sending a message, recording attendance,
          filing an official request, or completing a learning assessment.
        </p>
      </div>

      <section className="legal-section" id="privacy-scope">
        <span className="legal-section-number">01</span>
        <h2>Scope and accountability</h2>
        <p>
          This policy covers the IGNIS SAFE website, its authorized administrator and personnel
          workspaces, visitor messaging, attendance functions, and connected mobile learning records
          made available through the portal. It does not replace the privacy notice of an external
          government portal, social network, or other third-party website reached through a link.
        </p>
        <p>
          For personal data processed through IGNIS SAFE for station purposes, BFP Dasmariñas City Fire
          Station acts as the responsible office or personal information controller, subject to applicable
          BFP and government policies. Authorized personnel and contracted technology providers may process
          data only for approved purposes and under appropriate safeguards.
        </p>
      </section>

      <section className="legal-section" id="privacy-data">
        <span className="legal-section-number">02</span>
        <h2>Personal data we process</h2>
        <p>Depending on the feature used, IGNIS SAFE may process the following:</p>
        <div className="legal-data-table" role="region" aria-label="Categories of personal data" tabIndex="0">
          <table>
            <thead>
              <tr><th>Context</th><th>Examples of data</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Public conversations</td>
                <td>Name, optional email address, message content, replies, conversation status, dates, and a private recovery code.</td>
              </tr>
              <tr>
                <td>Accounts and profiles</td>
                <td>Name, email, username, role, rank, position, assigned section, status, profile photo, language, barangay, and account dates.</td>
              </tr>
              <tr>
                <td>Personnel operations</td>
                <td>Shift assignments, duty status, leave requests, supporting documents, approval history, reports, and uploaded files.</td>
              </tr>
              <tr>
                <td>Attendance verification</td>
                <td>Time and date, attendance type, verification results, device or session references, location coordinates or checks, verification photo, and registered face template.</td>
              </tr>
              <tr>
                <td>Announcements</td>
                <td>Intended recipients, delivery scope, acknowledgement status and time, reminders, and archive status.</td>
              </tr>
              <tr>
                <td>Learning and mobile activity</td>
                <td>Module and simulation progress, assessment attempts and answers, scores, completion, badges or medals, activity dates, session records, language, and barangay-level summaries.</td>
              </tr>
              <tr>
                <td>Security and administration</td>
                <td>Sign-in and device-trust records, audit events, changes made, record status, timestamps, and technical information needed to secure and diagnose the service.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Some attendance, face, location, health-related leave, or official-document information may
          qualify as sensitive personal information. It receives additional protection and is processed
          only when there is an appropriate lawful basis and operational need.
        </p>
      </section>

      <section className="legal-section" id="privacy-sources">
        <span className="legal-section-number">03</span>
        <h2>Where personal data comes from</h2>
        <p>Information may be obtained:</p>
        <ul>
          <li>Directly from you when you register, update a profile, send a message, upload a file, or complete an activity.</li>
          <li>From authorized administrators or personnel who create accounts, assign schedules, review requests, publish announcements, or maintain official records.</li>
          <li>Automatically from your browser or device when needed for authentication, security, attendance verification, session continuity, or basic system operation.</li>
          <li>From connected official records or mobile learning services where integration and access are authorized.</li>
        </ul>
        <p>
          Please keep your information accurate and submit another person's information only when you
          have authority and a valid purpose to do so.
        </p>
      </section>

      <section className="legal-section" id="privacy-purposes">
        <span className="legal-section-number">04</span>
        <h2>Why and on what basis data is processed</h2>
        <p>Personal data is processed only for specified and legitimate purposes, including to:</p>
        <ul>
          <li>Create, verify, secure, and administer accounts and permissions.</li>
          <li>Deliver public inquiries, official replies, announcements, acknowledgements, and reminders.</li>
          <li>Manage personnel schedules, attendance, leave, reports, and workplace responsibilities.</li>
          <li>Provide learning content, assessments, progress, recognition, and aggregated program insights.</li>
          <li>Maintain auditability, prevent misuse, investigate incidents, troubleshoot errors, and improve reliability.</li>
          <li>Meet legal, regulatory, public-safety, employment, records-management, and accountability obligations.</li>
        </ul>
        <p>
          Processing is based, as applicable, on consent; steps necessary to provide a requested service;
          compliance with a legal obligation; protection of life, health, or safety; fulfillment of a public
          authority or government mandate; an employer-employee relationship; or another basis permitted
          by the Data Privacy Act. Data is not collected merely because it may be useful later.
        </p>
      </section>

      <section className="legal-section legal-section--important" id="privacy-camera">
        <span className="legal-section-number">05</span>
        <h2>Camera, face verification, and location data</h2>
        <p>
          Camera access is requested only when you choose or are required to register Face ID, complete
          a liveness check, capture an attendance verification image, or use another clearly identified
          image feature. Location permission may be requested for attendance checks. The browser or device
          will ask for permission where required, and access can be managed in device settings.
        </p>
        <p>
          Face matching and liveness tools produce verification results that support attendance integrity;
          they are not used for advertising or general public surveillance. If a technical result is wrong
          or prevents a valid attendance record, contact an authorized administrator for review. Do not use
          another person's face, image, account, or location to create a false record.
        </p>
      </section>

      <section className="legal-section" id="privacy-storage">
        <span className="legal-section-number">06</span>
        <h2>Browser storage, sessions, and trusted devices</h2>
        <p>
          IGNIS SAFE uses browser storage and similar essential technologies to keep authenticated sessions,
          remember an email address when requested, maintain trusted-device security, preserve a visitor
          conversation or draft during a session, remember interface preferences such as the message-button
          position, and support reliable operation.
        </p>
        <p>
          These items are functional rather than advertising trackers. Clearing browser data, using private
          browsing, or changing devices may sign you out, remove a saved preference, or require a recovery
          code or additional verification. Never use "remember me" or trusted-device options on a shared or public device.
        </p>
      </section>

      <section className="legal-section" id="privacy-sharing">
        <span className="legal-section-number">07</span>
        <h2>Who may access or receive data</h2>
        <p>Access is limited according to role and need. Data may be disclosed to:</p>
        <ul>
          <li>Authorized BFP administrators, personnel, supervisors, and responsible government offices.</li>
          <li>Hosting, database, storage, authentication, security, and technical service providers acting under instructions and safeguards.</li>
          <li>Auditors, investigators, emergency responders, law-enforcement authorities, courts, regulators, or other recipients when required or permitted by law.</li>
          <li>A person you authorize, or another recipient needed to fulfill the service you requested.</li>
        </ul>
        <p>
          Personal data is not sold. Public announcements and organizational information are intentionally
          published, but private messages, account details, attendance records, face data, leave documents,
          and individual learning records are not made public merely because they are stored in IGNIS SAFE.
          Aggregate or de-identified statistics may be used for planning and reporting where appropriate.
        </p>
      </section>

      <section className="legal-section" id="privacy-retention">
        <span className="legal-section-number">08</span>
        <h2>Retention, archiving, and deletion</h2>
        <p>
          Personal data is retained only as long as necessary for the stated purpose, an applicable BFP or
          government records schedule, audit and accountability needs, the establishment or defense of legal
          claims, security investigation, or another lawful requirement. Different categories may therefore
          have different retention periods.
        </p>
        <p>
          Archiving hides or separates a record for operational management and does not necessarily delete it.
          A record scheduled for deletion may remain during a recovery, review, audit, backup, or legally
          required holding period. When retention is no longer justified, data will be securely deleted,
          anonymized, blocked, or otherwise disposed of according to applicable procedure.
        </p>
      </section>

      <section className="legal-section" id="privacy-security">
        <span className="legal-section-number">09</span>
        <h2>Security safeguards and incident response</h2>
        <p>
          Reasonable organizational, physical, and technical measures are used to protect personal data.
          These may include role-based permissions, authentication, device verification, access controls,
          protected storage, audit logging, review procedures, backups, and personnel accountability.
        </p>
        <p>
          No internet service can guarantee absolute security. Users must protect credentials, sign out of
          shared devices, keep recovery codes private, verify recipients before uploading records, and promptly
          report suspicious activity. Confirmed personal data breaches will be assessed and handled in
          accordance with applicable law and National Privacy Commission requirements.
        </p>
      </section>

      <section className="legal-section" id="privacy-rights">
        <span className="legal-section-number">10</span>
        <h2>Your privacy rights</h2>
        <p>Subject to lawful conditions and exceptions, you may exercise the rights to:</p>
        <ul>
          <li>Be informed about the collection and processing of your personal data.</li>
          <li>Object to processing or withdraw consent where consent is the applicable basis.</li>
          <li>Request reasonable access to personal data and information about its processing.</li>
          <li>Dispute inaccuracies and request correction or completion.</li>
          <li>Request erasure, blocking, or destruction when the legal requirements are met.</li>
          <li>Obtain data portability where it applies to electronically processed data in a structured format.</li>
          <li>Claim damages and file a complaint with the National Privacy Commission when appropriate.</li>
        </ul>
        <p>
          A request may require identity and authority verification. Some requests may be limited by official
          records duties, active investigations, public-safety needs, legal claims, employment rules, or other
          grounds allowed by law. A denial or limitation should be explained when legally permitted.
        </p>
      </section>

      <section className="legal-section" id="privacy-minors">
        <span className="legal-section-number">11</span>
        <h2>Minors and supervised use</h2>
        <p>
          Fire-safety education may be relevant to younger learners. Where an IGNIS SAFE service permits a
          minor to participate, the responsible office should obtain and document parental, guardian, school,
          or other lawful authorization when required and collect only information proportionate to the
          educational or public-safety purpose. A parent or lawful guardian may exercise applicable privacy
          rights on behalf of a minor.
        </p>
        <p>
          Public visitor messaging should not be used by a minor to send unnecessary sensitive details.
          Immediate emergencies must be reported through 911 or another appropriate emergency channel.
        </p>
      </section>

      <section className="legal-section" id="privacy-updates">
        <span className="legal-section-number">12</span>
        <h2>Policy updates, questions, and privacy requests</h2>
        <p>
          This policy may be revised when the service, law, technology, or official procedures change.
          Material updates will be identified by a new effective date or another appropriate notice. Older
          processing remains governed by the notice and law applicable at the relevant time.
        </p>
        <p>
          For privacy questions or to exercise a privacy right, contact BFP Dasmariñas City Fire Station at
          <a href={`mailto:${contactEmail}`}> {contactEmail}</a>. Describe the account or
          service involved and the request, but do not email passwords, recovery codes, identity documents,
          or sensitive records unless the office provides a secure method. You may also raise eligible
          concerns with the <a href="https://privacy.gov.ph/" target="_blank" rel="noopener noreferrer">National Privacy Commission</a>.
        </p>
      </section>
    </LegalPageShell>
  )
}
