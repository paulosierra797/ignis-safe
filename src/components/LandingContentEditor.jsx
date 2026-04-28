import React, { useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useLandingContent } from '../context/LandingContentContext';
import './LandingContentEditor.css';

const deepClone = (value) => JSON.parse(JSON.stringify(value));
const toPhoneHref = (value) => `tel:${String(value || '').replace(/[^\d+]/g, '')}`;
const toLines = (value) => (Array.isArray(value) ? value : [String(value || '')]).join('\n');
const fromLines = (value) => String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);

const Field = ({ label, children }) => (
  <label>
    {label}
    {children}
  </label>
);

const SectionBlock = ({ title, children }) => (
  <section className="editor-card editor-card--wide">
    <h3>{title}</h3>
    {children}
  </section>
);

export default function LandingContentEditor({ embedded = false }) {
  const [searchQuery, setSearchQuery] = useState('');
  const { content, setContent, resetContent, defaults, loadingContent } = useLandingContent();
  const [draft, setDraft] = useState(() => deepClone(content));
  const [saveMessage, setSaveMessage] = useState('');

  React.useEffect(() => {
    setDraft(deepClone(content));
  }, [content]);

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(content), [draft, content]);

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
    const { error } = await setContent(draft);
    if (error) {
      setSaveMessage(`Saved locally, but failed to sync to database: ${error}`);
    } else {
      setSaveMessage('Landing page content saved.');
    }
    window.setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleDiscard = () => setDraft(deepClone(content));

  const handleResetDefaults = async () => {
    const { error } = await resetContent();
    setDraft(deepClone(defaults));
    if (error) {
      setSaveMessage(`Defaults reset locally, but failed to sync to database: ${error}`);
    } else {
      setSaveMessage('Landing page content reset to defaults.');
    }
    window.setTimeout(() => setSaveMessage(''), 3000);
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
            <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={!hasChanges}>
              Discard changes
            </button>
            <button type="button" className="btn btn-danger" onClick={handleResetDefaults}>
              Reset defaults
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!hasChanges}>
              Save changes
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
            <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={!hasChanges}>
              Discard changes
            </button>
            <button type="button" className="btn btn-danger" onClick={handleResetDefaults}>
              Reset defaults
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!hasChanges}>
              Save changes
            </button>
          </div>
        </div>
      )}

      {saveMessage && <div className="landing-editor-alert">{saveMessage}</div>}

      <div className="landing-editor-grid">
        <section className="editor-card">
          <h3>Hero Section</h3>
          <Field label="Hero title">
            <input type="text" value={draft.hero.title} onChange={(e) => updateField('hero', 'title', e.target.value)} />
          </Field>
          <Field label="Lead text">
            <input type="text" value={draft.hero.lead} onChange={(e) => updateField('hero', 'lead', e.target.value)} />
          </Field>
          <Field label="Description">
            <textarea rows={4} value={draft.hero.description} onChange={(e) => updateField('hero', 'description', e.target.value)} />
          </Field>
        </section>

        <section className="editor-card">
          <h3>About Section</h3>
          <Field label="Section title">
            <input type="text" value={draft.about.title} onChange={(e) => updateField('about', 'title', e.target.value)} />
          </Field>
          <Field label="Intro paragraph">
            <textarea rows={6} value={draft.about.intro} onChange={(e) => updateField('about', 'intro', e.target.value)} />
          </Field>
          <Field label="Mission card title">
            <input type="text" value={draft.about.missionTitle} onChange={(e) => updateField('about', 'missionTitle', e.target.value)} />
          </Field>
          <Field label="Mission card text">
            <textarea rows={4} value={draft.about.missionText} onChange={(e) => updateField('about', 'missionText', e.target.value)} />
          </Field>
          <Field label="Vision card title">
            <input type="text" value={draft.about.visionTitle} onChange={(e) => updateField('about', 'visionTitle', e.target.value)} />
          </Field>
          <Field label="Vision card text">
            <textarea rows={3} value={draft.about.visionText} onChange={(e) => updateField('about', 'visionText', e.target.value)} />
          </Field>
        </section>

        <section className="editor-card">
          <h3>Contact Section</h3>
          <Field label="Section title">
            <input type="text" value={draft.contact.title} onChange={(e) => updateField('contact', 'title', e.target.value)} />
          </Field>
          <Field label="Emergency title">
            <input type="text" value={draft.contact.emergencyTitle} onChange={(e) => updateField('contact', 'emergencyTitle', e.target.value)} />
          </Field>
          <Field label="Landline 1">
            <input type="text" value={draft.contact.landlinePrimary} onChange={(e) => updateField('contact', 'landlinePrimary', e.target.value)} />
          </Field>
          <Field label="Landline 2">
            <input type="text" value={draft.contact.landlineSecondary} onChange={(e) => updateField('contact', 'landlineSecondary', e.target.value)} />
          </Field>
          <Field label="Mobile">
            <input type="text" value={draft.contact.mobile} onChange={(e) => updateField('contact', 'mobile', e.target.value)} />
          </Field>
          <Field label="Email">
            <input type="text" value={draft.contact.email} onChange={(e) => updateField('contact', 'email', e.target.value)} />
          </Field>
          <Field label="Facebook label">
            <input type="text" value={draft.contact.facebookLabel} onChange={(e) => updateField('contact', 'facebookLabel', e.target.value)} />
          </Field>
          <Field label="Facebook URL">
            <input type="text" value={draft.contact.facebookUrl} onChange={(e) => updateField('contact', 'facebookUrl', e.target.value)} />
          </Field>
        </section>

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
}
