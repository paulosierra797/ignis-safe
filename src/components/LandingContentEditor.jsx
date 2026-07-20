import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useLandingContent } from '../context/LandingContentContext';
import './LandingContentEditor.css';

const LANDING_DRAFT_STORAGE_KEY = 'ignis-safe:landing-draft';

const isBrowserStorageAvailable = () => typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

const readLandingDraft = () => {
  if (!isBrowserStorageAvailable()) return null;

  try {
    const raw = sessionStorage.getItem(LANDING_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeLandingDraft = (draft) => {
  if (!isBrowserStorageAvailable()) return;

  try {
    sessionStorage.setItem(LANDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage write failures (e.g. quota exceeded, private browsing).
  }
};

const clearLandingDraft = () => {
  if (!isBrowserStorageAvailable()) return;
  sessionStorage.removeItem(LANDING_DRAFT_STORAGE_KEY);
};

const isValidLandingDraftShape = (value) => Boolean(
  value && typeof value === 'object' &&
  value.hero && value.about && value.contact && value.process && value.faq
);

const deepClone = (value) => JSON.parse(JSON.stringify(value));
const toPhoneHref = (value) => `tel:${String(value || '').replace(/[^\d+]/g, '')}`;
const toLines = (value) => (Array.isArray(value) ? value : [String(value || '')]).join('\n');
const fromLines = (value) => String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
const mobileNumberRegex = /^09\d{9}$/;

const displayValue = (value) => {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '').trim();
  return text || '—';
};

const stepsText = (steps) => (steps || []).map((step) => step.text).join(' | ');

const LANDING_FIELD_MAP = [
  { label: 'Main Page Title', get: (c) => c.hero.title },
  { label: 'Welcome Message', get: (c) => c.hero.lead },
  { label: 'Supporting Description', get: (c) => c.hero.description },
  { label: 'About Us Section Heading', get: (c) => c.about.title },
  { label: 'About Us Description', get: (c) => c.about.intro },
  { label: 'Mission Title', get: (c) => c.about.missionTitle },
  { label: 'Mission Description', get: (c) => c.about.missionText },
  { label: 'Vision Title', get: (c) => c.about.visionTitle },
  { label: 'Vision Description', get: (c) => c.about.visionText },
  { label: 'Contact Section Heading', get: (c) => c.contact.title },
  { label: 'Emergency Hotline Title', get: (c) => c.contact.emergencyTitle },
  { label: 'Landline Number 1', get: (c) => c.contact.landlinePrimary },
  { label: 'Landline Number 2', get: (c) => c.contact.landlineSecondary },
  { label: 'Mobile Number', get: (c) => c.contact.mobile },
  { label: 'Email Address', get: (c) => c.contact.email },
  { label: 'Facebook Page Name', get: (c) => c.contact.facebookLabel },
  { label: 'Facebook Page Link', get: (c) => c.contact.facebookUrl },
];

const getChangedFields = (oldContent, newContent) => {
  const changes = [];

  LANDING_FIELD_MAP.forEach(({ label, get }) => {
    const oldValue = get(oldContent);
    const newValue = get(newContent);
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      changes.push({ label, oldValue: displayValue(oldValue), newValue: displayValue(newValue) });
    }
  });

  ['english', 'tagalog'].forEach((locale) => {
    const localeLabel = locale === 'english' ? 'English' : 'Tagalog';

    const oldTitle = oldContent.process[locale].title;
    const newTitle = newContent.process[locale].title;
    if (String(oldTitle ?? '') !== String(newTitle ?? '')) {
      changes.push({ label: `Process Section (${localeLabel}) Title`, oldValue: displayValue(oldTitle), newValue: displayValue(newTitle) });
    }

    const oldSections = oldContent.process[locale].processSteps || [];
    const newSections = newContent.process[locale].processSteps || [];
    newSections.forEach((section, index) => {
      const oldSection = oldSections[index];
      if (!oldSection) return;
      if (String(oldSection.title ?? '') !== String(section.title ?? '')) {
        changes.push({
          label: `Process Section (${localeLabel}) – Column ${index + 1} Title`,
          oldValue: displayValue(oldSection.title),
          newValue: displayValue(section.title),
        });
      }
      const oldSteps = stepsText(oldSection.steps);
      const newSteps = stepsText(section.steps);
      if (oldSteps !== newSteps) {
        changes.push({
          label: `Process Section (${localeLabel}) – Column ${index + 1} Steps`,
          oldValue: displayValue(oldSteps),
          newValue: displayValue(newSteps),
        });
      }
    });

    const oldFaqTitle = oldContent.faq[locale].title;
    const newFaqTitle = newContent.faq[locale].title;
    if (String(oldFaqTitle ?? '') !== String(newFaqTitle ?? '')) {
      changes.push({ label: `FAQ Section (${localeLabel}) Title`, oldValue: displayValue(oldFaqTitle), newValue: displayValue(newFaqTitle) });
    }

    const oldFaqs = oldContent.faq[locale].faqs || [];
    const newFaqs = newContent.faq[locale].faqs || [];
    newFaqs.forEach((faqItem, index) => {
      const oldFaqItem = oldFaqs[index];
      if (!oldFaqItem) return;
      if (String(oldFaqItem.question ?? '') !== String(faqItem.question ?? '')) {
        changes.push({
          label: `FAQ (${localeLabel}) – Question ${index + 1}`,
          oldValue: displayValue(oldFaqItem.question),
          newValue: displayValue(faqItem.question),
        });
      }
      const oldAnswer = displayValue(oldFaqItem.answer);
      const newAnswer = displayValue(faqItem.answer);
      if (oldAnswer !== newAnswer) {
        changes.push({
          label: `FAQ (${localeLabel}) – Answer ${index + 1}`,
          oldValue: oldAnswer,
          newValue: newAnswer,
        });
      }
    });
  });

  return changes;
};

const Field = ({ label, helper, children }) => (
  <label className="editor-field">
    <span className="editor-field-label">{label}</span>
    {children}
    {helper && <span className="editor-field-helper">{helper}</span>}
  </label>
);

const SectionBlock = ({ title, children }) => (
  <section className="editor-card editor-card--wide">
    <h3>{title}</h3>
    {children}
  </section>
);

const GroupCard = ({ title, description, children }) => (
  <section className="editor-card editor-group-card">
    <div className="editor-group-heading">
      <h3>{title}</h3>
      {description && <p className="editor-group-description">{description}</p>}
    </div>
    <div className="editor-group-fields">{children}</div>
  </section>
);

const LandingContentEditor = forwardRef(function LandingContentEditor({ embedded = false, onDirtyChange }, ref) {
  const [searchQuery, setSearchQuery] = useState('');
  const { content, setContent, resetContent, defaults, loadingContent } = useLandingContent();
  const [draft, setDraft] = useState(() => {
    const storedDraft = readLandingDraft();
    return isValidLandingDraftShape(storedDraft) ? storedDraft : deepClone(content);
  });
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ open: false, changes: [], onConfirm: null });
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const isFirstContentSync = useRef(true);

  React.useEffect(() => {
    if (isFirstContentSync.current) {
      isFirstContentSync.current = false;
      return;
    }
    setDraft(deepClone(content));
  }, [content]);

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(content), [draft, content]);

  React.useEffect(() => {
    if (hasChanges) {
      writeLandingDraft(draft);
    } else {
      clearLandingDraft();
    }
  }, [hasChanges, draft]);

  React.useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discardUnsavedChanges: () => {
      clearLandingDraft();
      setDraft(deepClone(content));
    }
  }), [content]);

  const updateField = (section, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const updateNested = (section, locale, key, value) => {
    setDraft((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [locale]: {
          ...prev[section][locale],
          [key]: value,
        },
      },
    }));
  };

  const updateProcessSectionTitle = (locale, sectionIndex, value) => {
    setDraft((prev) => ({
      ...prev,
      process: {
        ...prev.process,
        [locale]: {
          ...prev.process[locale],
          processSteps: prev.process[locale].processSteps.map((section, index) => (
            index === sectionIndex ? { ...section, title: value } : section
          )),
        },
      },
    }));
  };

  const updateProcessSectionSteps = (locale, sectionIndex, value) => {
    const lines = fromLines(value);
    setDraft((prev) => ({
      ...prev,
      process: {
        ...prev.process,
        [locale]: {
          ...prev.process[locale],
          processSteps: prev.process[locale].processSteps.map((section, index) => (
            index === sectionIndex
              ? { ...section, steps: lines.map((text, stepIndex) => ({ num: stepIndex + 1, text })) }
              : section
          )),
        },
      },
    }));
  };

  const updateFaqQuestion = (locale, faqIndex, value) => {
    setDraft((prev) => ({
      ...prev,
      faq: {
        ...prev.faq,
        [locale]: {
          ...prev.faq[locale],
          faqs: prev.faq[locale].faqs.map((faqItem, index) => (
            index === faqIndex ? { ...faqItem, question: value } : faqItem
          )),
        },
      },
    }));
  };

  const updateFaqAnswer = (locale, faqIndex, value) => {
    const lines = fromLines(value);
    const parsedAnswer = lines.length <= 1 ? (lines[0] || '') : lines;

    setDraft((prev) => ({
      ...prev,
      faq: {
        ...prev.faq,
        [locale]: {
          ...prev.faq[locale],
          faqs: prev.faq[locale].faqs.map((faqItem, index) => (
            index === faqIndex ? { ...faqItem, answer: parsedAnswer } : faqItem
          )),
        },
      },
    }));
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    const mobileNumber = String(draft?.contact?.mobile || '').trim();
    const normalizedMobileNumber = mobileNumber.replace(/\D/g, '');
    if (mobileNumber && !mobileNumberRegex.test(normalizedMobileNumber)) {
      setSaveMessage('Mobile number must start with 09 and be exactly 11 digits.');
      window.setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const nextDraft = {
      ...draft,
      contact: {
        ...draft.contact,
        mobile: normalizedMobileNumber || mobileNumber,
      },
    };

    const changes = getChangedFields(content, nextDraft);
    if (changes.length === 0) {
      return;
    }

    setConfirmModal({
      open: true,
      changes,
      onConfirm: () => performSave(nextDraft),
    });
  };

  const performSave = async (nextDraft) => {
    setSaving(true);
    try {
      const { error } = await setContent(nextDraft);
      if (error) {
        setSaveMessage(`Saved locally, but failed to sync to database: ${error}`);
      } else {
        setSaveMessage('Landing page content saved.');
      }
      window.setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!hasChanges) {
      return;
    }
    setDiscardModalOpen(true);
  };

  const confirmDiscard = () => {
    setDraft(deepClone(content));
    setDiscardModalOpen(false);
  };

  const handleResetDefaults = () => {
    if (saving) {
      return;
    }
    setResetModalOpen(true);
  };

  const confirmResetDefaults = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await resetContent();
      setDraft(deepClone(defaults));
      if (error) {
        setSaveMessage(`Defaults reset locally, but failed to sync to database: ${error}`);
      } else {
        setSaveMessage('Landing page content reset to defaults.');
      }
      window.setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setSaving(false);
      setResetModalOpen(false);
    }
  };

  const editorContent = (
    <>
      {loadingContent && (
        <div className="landing-editor-alert">Loading latest landing content...</div>
      )}

      {!embedded && (
        <div className="landing-editor-toolbar">
          <p>Edit the text shown on your public landing page.</p>
          <div className="landing-editor-actions">
            <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={!hasChanges || saving}>
              Discard changes
            </button>
            <button type="button" className="btn btn-danger" onClick={handleResetDefaults} disabled={saving}>
              {saving ? 'Working...' : 'Reset defaults'}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="landing-editor-compact-toolbar">
          <div>
            <h3>Landing Page Content</h3>
            <p>Edit the public landing page sections.</p>
          </div>
          <div className="landing-editor-actions">
            <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={!hasChanges || saving}>
              Discard changes
            </button>
            <button type="button" className="btn btn-danger" onClick={handleResetDefaults} disabled={saving}>
              {saving ? 'Working...' : 'Reset defaults'}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {saveMessage && <div className="landing-editor-alert">{saveMessage}</div>}

      <div className="landing-editor-groups">
        <GroupCard
          title="Main Banner"
          description="The large banner visitors see first at the top of the landing page."
        >
          <Field
            label="Main Page Title"
            helper="The large headline shown at the very top of the public landing page."
          >
            <input type="text" value={draft.hero.title} onChange={(e) => updateField('hero', 'title', e.target.value)} />
          </Field>
          <Field
            label="Welcome Message"
            helper="A short line of text shown right under the main page title."
          >
            <input type="text" value={draft.hero.lead} onChange={(e) => updateField('hero', 'lead', e.target.value)} />
          </Field>
          <Field
            label="Supporting Description"
            helper="A longer sentence shown below the welcome message, explaining what the site offers."
          >
            <textarea className="editor-textarea-lg" rows={4} value={draft.hero.description} onChange={(e) => updateField('hero', 'description', e.target.value)} />
          </Field>
        </GroupCard>

        <GroupCard
          title="About Us"
          description="Tells visitors who you are and what your organization does."
        >
          <Field
            label="Section Heading"
            helper='The title shown above the About Us section (e.g. "About Us").'
          >
            <input type="text" value={draft.about.title} onChange={(e) => updateField('about', 'title', e.target.value)} />
          </Field>
          <Field
            label="About Us Description"
            helper="The main paragraph that introduces your organization to visitors."
          >
            <textarea className="editor-textarea-lg" rows={7} value={draft.about.intro} onChange={(e) => updateField('about', 'intro', e.target.value)} />
          </Field>
        </GroupCard>

        <GroupCard
          title="Mission"
          description="The Mission and Vision cards shown on the landing page."
        >
          <Field
            label="Mission Title"
            helper="The heading shown on the Mission card."
          >
            <input type="text" value={draft.about.missionTitle} onChange={(e) => updateField('about', 'missionTitle', e.target.value)} />
          </Field>
          <Field
            label="Mission Description"
            helper="The text shown underneath the Mission title."
          >
            <textarea className="editor-textarea-lg" rows={4} value={draft.about.missionText} onChange={(e) => updateField('about', 'missionText', e.target.value)} />
          </Field>
          <Field
            label="Vision Title"
            helper="The heading shown on the Vision card."
          >
            <input type="text" value={draft.about.visionTitle} onChange={(e) => updateField('about', 'visionTitle', e.target.value)} />
          </Field>
          <Field
            label="Vision Description"
            helper="The text shown underneath the Vision title."
          >
            <textarea rows={3} value={draft.about.visionText} onChange={(e) => updateField('about', 'visionText', e.target.value)} />
          </Field>
        </GroupCard>

        <GroupCard
          title="Contact Information"
          description="How visitors can reach or find your station, shown in the Contact section."
        >
          <Field
            label="Section Heading"
            helper="The title shown above the Contact Information section."
          >
            <input type="text" value={draft.contact.title} onChange={(e) => updateField('contact', 'title', e.target.value)} />
          </Field>
          <Field
            label="Emergency Hotline Title"
            helper="The label shown above the emergency contact numbers."
          >
            <input type="text" value={draft.contact.emergencyTitle} onChange={(e) => updateField('contact', 'emergencyTitle', e.target.value)} />
          </Field>
          <Field
            label="Landline Number 1"
            helper="The first landline number shown on the public page."
          >
            <input type="text" value={draft.contact.landlinePrimary} onChange={(e) => updateField('contact', 'landlinePrimary', e.target.value)} />
          </Field>
          <Field
            label="Landline Number 2"
            helper="The second landline number shown on the public page."
          >
            <input type="text" value={draft.contact.landlineSecondary} onChange={(e) => updateField('contact', 'landlineSecondary', e.target.value)} />
          </Field>
          <Field
            label="Mobile Number"
            helper="Must start with 09 and be exactly 11 digits (e.g. 09XXXXXXXXX)."
          >
            <input
              type="text"
              value={draft.contact.mobile}
              onChange={(e) => updateField('contact', 'mobile', e.target.value)}
              placeholder="09XXXXXXXXX"
              pattern="^09[0-9]{9}$"
              maxLength={11}
              inputMode="numeric"
              title="Must start with 09 and be exactly 11 digits"
            />
          </Field>
          <Field
            label="Email Address"
            helper="The email address shown for visitors to contact you."
          >
            <input type="text" value={draft.contact.email} onChange={(e) => updateField('contact', 'email', e.target.value)} />
          </Field>
          <Field
            label="Facebook Page Name"
            helper="The name displayed for your Facebook page link."
          >
            <input type="text" value={draft.contact.facebookLabel} onChange={(e) => updateField('contact', 'facebookLabel', e.target.value)} />
          </Field>
          <Field
            label="Facebook Page Link"
            helper="The full web address (URL) of your Facebook page."
          >
            <input type="text" value={draft.contact.facebookUrl} onChange={(e) => updateField('contact', 'facebookUrl', e.target.value)} />
          </Field>
        </GroupCard>
      </div>

      <div className="landing-editor-grid">
        <SectionBlock title="Process Section (English)">
          <Field label="Section title">
            <input type="text" value={draft.process.english.title} onChange={(e) => updateNested('process', 'english', 'title', e.target.value)} />
          </Field>
          {draft.process.english.processSteps.map((section, index) => (
            <div key={`process-en-${index}`} className="sub-editor">
              <Field label={`Column title ${index + 1}`}>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateProcessSectionTitle('english', index, e.target.value)}
                />
              </Field>
              <Field label="Steps (one line per step)">
                <textarea
                  rows={5}
                  value={(section.steps || []).map((step) => step.text).join('\n')}
                  onChange={(e) => updateProcessSectionSteps('english', index, e.target.value)}
                />
              </Field>
            </div>
          ))}
        </SectionBlock>

        <SectionBlock title="Process Section (Tagalog)">
          <Field label="Section title">
            <input type="text" value={draft.process.tagalog.title} onChange={(e) => updateNested('process', 'tagalog', 'title', e.target.value)} />
          </Field>
          {draft.process.tagalog.processSteps.map((section, index) => (
            <div key={`process-tl-${index}`} className="sub-editor">
              <Field label={`Column title ${index + 1}`}>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateProcessSectionTitle('tagalog', index, e.target.value)}
                />
              </Field>
              <Field label="Steps (one line per step)">
                <textarea
                  rows={5}
                  value={(section.steps || []).map((step) => step.text).join('\n')}
                  onChange={(e) => updateProcessSectionSteps('tagalog', index, e.target.value)}
                />
              </Field>
            </div>
          ))}
        </SectionBlock>

        <SectionBlock title="FAQ Section (English)">
          <Field label="Section title">
            <input type="text" value={draft.faq.english.title} onChange={(e) => updateNested('faq', 'english', 'title', e.target.value)} />
          </Field>
          {draft.faq.english.faqs.map((faqItem, index) => (
            <div key={`faq-en-${index}`} className="sub-editor">
              <Field label={`Question ${index + 1}`}>
                <input type="text" value={faqItem.question} onChange={(e) => updateFaqQuestion('english', index, e.target.value)} />
              </Field>
              <Field label="Answer (single paragraph or one line per bullet)">
                <textarea rows={5} value={toLines(faqItem.answer)} onChange={(e) => updateFaqAnswer('english', index, e.target.value)} />
              </Field>
            </div>
          ))}
        </SectionBlock>

        <SectionBlock title="FAQ Section (Tagalog)">
          <Field label="Section title">
            <input type="text" value={draft.faq.tagalog.title} onChange={(e) => updateNested('faq', 'tagalog', 'title', e.target.value)} />
          </Field>
          {draft.faq.tagalog.faqs.map((faqItem, index) => (
            <div key={`faq-tl-${index}`} className="sub-editor">
              <Field label={`Question ${index + 1}`}>
                <input type="text" value={faqItem.question} onChange={(e) => updateFaqQuestion('tagalog', index, e.target.value)} />
              </Field>
              <Field label="Answer (single paragraph or one line per bullet)">
                <textarea rows={5} value={toLines(faqItem.answer)} onChange={(e) => updateFaqAnswer('tagalog', index, e.target.value)} />
              </Field>
            </div>
          ))}
        </SectionBlock>
      </div>

      <section className="editor-card preview-card">
        <h3>Quick Preview</h3>
        <p className="preview-title">{draft.hero.title}</p>
        <p><strong>{draft.hero.lead}</strong> {draft.hero.description}</p>
        <hr />
        <p><strong>{draft.about.title}:</strong> {draft.about.intro}</p>
        <hr />
        <p><strong>{draft.contact.title}</strong></p>
        <p>{draft.contact.emergencyTitle}</p>
        <p>
          <a href={toPhoneHref(draft.contact.landlinePrimary)}>{draft.contact.landlinePrimary}</a>
          {' / '}
          <a href={toPhoneHref(draft.contact.landlineSecondary)}>{draft.contact.landlineSecondary}</a>
        </p>
        <p><a href={toPhoneHref(draft.contact.mobile)}>{draft.contact.mobile}</a></p>
        <hr />
        <p><strong>{draft.process.english.title}</strong></p>
        <p>{draft.process.english.processSteps[0]?.title}</p>
        <p>{draft.process.english.processSteps[0]?.steps?.[0]?.text}</p>
        <hr />
        <p><strong>{draft.faq.english.title}</strong></p>
        <p>{draft.faq.english.faqs[0]?.question}</p>
      </section>

      {confirmModal.open && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal confirm-changes-modal">
            <h3>Confirm Changes</h3>
            <p>Are you sure you want to save these changes?</p>
            <ul className="confirm-changes-list">
              {confirmModal.changes.map((change) => (
                <li key={change.label}>
                  <strong>{change.label}:</strong> {change.oldValue} → {change.newValue}
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setConfirmModal({ open: false, changes: [], onConfirm: null })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={() => {
                  const { onConfirm } = confirmModal;
                  setConfirmModal({ open: false, changes: [], onConfirm: null });
                  onConfirm?.();
                }}
              >
                Confirm Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {resetModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="resetDefaultsTitle" aria-describedby="resetDefaultsMessage">
          <div className="modal reset-defaults-modal">
            <div className="reset-defaults-icon" aria-hidden="true">!</div>
            <h3 id="resetDefaultsTitle" className="reset-defaults-title">Reset Landing Page to Defaults?</h3>
            <p id="resetDefaultsMessage" className="reset-defaults-message">
              This will replace all currently saved landing-page content with the default values. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setResetModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={confirmResetDefaults}
                disabled={saving}
              >
                {saving ? 'Working...' : 'Reset Defaults'}
              </button>
            </div>
          </div>
        </div>
      )}

      {discardModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="discardChangesTitle" aria-describedby="discardChangesMessage">
          <div className="modal reset-defaults-modal">
            <div className="reset-defaults-icon" aria-hidden="true">!</div>
            <h3 id="discardChangesTitle" className="reset-defaults-title">Discard Unsaved Changes?</h3>
            <p id="discardChangesMessage" className="reset-defaults-message">
              Your unsaved landing-page changes will be removed and the last saved content will be restored. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setDiscardModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={confirmDiscard}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="landing-editor-embedded">{editorContent}</div>;
  }

  return (
    <div className="landing-editor-page">
      <Sidebar />
      <div className="landing-editor-main">
        <PageHeader title="Landing Content" searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        {editorContent}
      </div>
    </div>
  );
});

export default LandingContentEditor;
