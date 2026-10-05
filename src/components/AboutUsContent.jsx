import React, { useCallback, useEffect, useRef, useState } from 'react';
import RecordActions from './RecordActions';
import {
  FiEdit2, FiSave, FiX,
  FiChevronDown, FiChevronRight
} from 'react-icons/fi';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import ToastMessage from './ToastMessage';
import './AboutUsContent.css';
import './AppDialog.css';
import { useUser } from '../context/UserContext';
import { logAdminActivity } from '../utils/usersService';
import * as aboutUsService from '../utils/aboutUsService';
import UnsavedChangesPrompt from './UnsavedChangesPrompt';

const SAVE_SUCCESS_MESSAGE = 'Changes saved successfully.';
const UNSAVED_TITLE = 'Unsaved Changes';
const UNSAVED_MESSAGE = 'You have unsaved changes. If you leave this page, your changes will be lost.';

// A NULL column and a field the admin cleared both render as an empty input
// (every field here is bound as `value || ''`), so treat them as equal -
// otherwise clearing an already-empty field would look like an edit.
const isEmptyValue = (value) => value === null || value === undefined || value === '';

const sameFieldValue = (a, b) => {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  return Object.is(a, b);
};

// Compares a form against the exact snapshot it was seeded with - the row
// Supabase returned, or the blank defaults of an "add" row. Loading and
// re-rendering never change a value, so neither ever reports dirty.
const isFormDirty = (form, baseline) => {
  if (!form || !baseline) return false;
  const keys = new Set([...Object.keys(form), ...Object.keys(baseline)]);
  return [...keys].some((key) => !sameFieldValue(form[key], baseline[key]));
};

// Each card publishes its own dirty flag to the page shell, which owns the
// single navigation blocker for the whole About Us screen.
function useReportDirty(reportDirty, scope, dirty) {
  useEffect(() => {
    reportDirty(scope, dirty);
    return () => reportDirty(scope, false);
  }, [reportDirty, scope, dirty]);
}

const logAboutUsActivity = (currentUser, action, details) => {
  logAdminActivity({
    actorId: currentUser?.admin_id || null,
    actorName: currentUser?.name || currentUser?.email || 'Admin User',
    action,
    actionType: 'edit',
    details,
    metadata: { area: 'about_us_content' }
  });
};

// ---------------------------------------------------------------------------
// Shared presentational bits
// ---------------------------------------------------------------------------

function StatusBadge({ active }) {
  return (
    <span className={`aboutus-status-pill ${active ? 'is-active' : 'is-inactive'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function FieldPair({ label, valueEn, valueTl, onChangeEn, onChangeTl, multiline, rows = 3 }) {
  const Field = multiline ? 'textarea' : 'input';
  return (
    <div className="aboutus-field-pair">
      <span className="aboutus-field-pair-label">{label}</span>
      <div className="aboutus-language-grid aboutus-language-grid--lang">
        <label className="aboutus-field">
          <span>English</span>
          <Field
            type={multiline ? undefined : 'text'}
            rows={multiline ? rows : undefined}
            value={valueEn || ''}
            onChange={(event) => onChangeEn(event.target.value)}
          />
        </label>
        <label className="aboutus-field">
          <span>Tagalog</span>
          <Field
            type={multiline ? undefined : 'text'}
            rows={multiline ? rows : undefined}
            value={valueTl || ''}
            onChange={(event) => onChangeTl(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function SingleField({ label, value, onChange, multiline, rows = 2, type = 'text', placeholder }) {
  const Field = multiline ? 'textarea' : 'input';
  return (
    <label className="aboutus-field aboutus-field-single">
      <span>{label}</span>
      <Field
        type={multiline ? undefined : type}
        rows={multiline ? rows : undefined}
        value={value || ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function MessageBanner({ message }) {
  return <ToastMessage message={message?.text} type={message?.type || 'info'} />;
}

// ---------------------------------------------------------------------------
// Existing-row text editor
// ---------------------------------------------------------------------------

function useEditableList({
  load, update, getId,
  mapToForm = (row) => ({ ...row }),
  notify, entityLabel
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null | <id>
  const [form, setForm] = useState({});
  // The row (or blank defaults) the open editor started from, so "dirty" means
  // "differs from the last saved Supabase value", not "an editor is open".
  const [formBaseline, setFormBaseline] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await load();
    if (error) notify('error', `Failed to load ${entityLabel}: ${error}`);
    setRows(data || []);
    setLoading(false);
    return data || [];
  };

  // Runs once per mounted list controller; `load` is stable per-card.
  // Deferred via setTimeout so the effect body itself never synchronously
  // calls a state setter (refresh() sets loading state before its first
  // await).
  useEffect(() => {
    const timeoutId = setTimeout(() => { refresh(); }, 0);
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const startEdit = (row) => {
    const initial = mapToForm(row);
    setEditingId(getId(row));
    setForm(initial);
    setFormBaseline(initial);
  };
  const cancelEdit = () => { setEditingId(null); setForm({}); setFormBaseline(null); };

  const save = async () => {
    setBusy(true);
    if (!rows.some((row) => getId(row) === editingId)) {
      setBusy(false);
      return false;
    }
    const { error } = await update(form);
    setBusy(false);

    if (error) {
      notify('error', `Failed to save ${entityLabel}: ${error}`);
      return false;
    }

    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelEdit();
    await refresh();
    return true;
  };

  const isDirty = editingId !== null && isFormDirty(form, formBaseline);

  return {
    rows, loading, editingId, form, busy, isDirty,
    setField, startEdit, cancelEdit, save, refresh
  };
}

// ---------------------------------------------------------------------------
// Singleton "one row" section controller (partner info, emergency info, ...)
// ---------------------------------------------------------------------------

function useSingletonForm({ load, update, notify, entityLabel }) {
  const [form, setForm] = useState(null);
  // Last known Supabase values. Only a successful save moves this forward, so a
  // failed save keeps the edited values on screen and still reads as dirty.
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data, error } = await load();
      if (!isMounted) return;
      if (error) notify('error', `Failed to load ${entityLabel}: ${error}`);
      setForm(data || {});
      setBaseline(data || {});
      setLoading(false);
    })();
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    const { data, error } = await update(form);
    setSaving(false);

    if (error) {
      notify('error', `Failed to save ${entityLabel}: ${error}`);
      return false;
    }

    setForm(data);
    setBaseline(data);
    notify('success', SAVE_SUCCESS_MESSAGE);
    return true;
  };

  const isDirty = isFormDirty(form, baseline);

  return { form, loading, saving, isDirty, setField, save };
}

// ---------------------------------------------------------------------------
// Card 1 — BFP Dasmariñas
// ---------------------------------------------------------------------------

function PartnerCard({ currentUser, notify, reportDirty, requestSave }) {
  const partner = useSingletonForm({
    load: aboutUsService.getPartnerInfo,
    update: aboutUsService.updatePartnerInfo,
    notify,
    entityLabel: 'BFP Dasmariñas content'
  });

  const numbers = useEditableList({
    load: aboutUsService.listPartnerContactNumbers,
    // Edit-only section - the saved numbers can be modified but not added or removed.
    update: (form) => aboutUsService.updatePartnerContactNumber(form.contact_key, {
      label: form.label, display_value: form.display_value, dial_value: form.dial_value
    }),
    getId: (row) => row.contact_key,
    mapToForm: (row) => ({ ...row, label: row.contact_type }),
    notify,
    entityLabel: 'BFP Dasmariñas number'
  });

  const handleSavePartner = async () => {
    const saved = await partner.save();
    if (saved) logAboutUsActivity(currentUser, 'About Us Content Updated', 'Updated BFP Dasmariñas station content.');
  };

  useReportDirty(reportDirty, 'bfp-dasmarinas', partner.isDirty || numbers.isDirty);

  return (
    <section id="bfp-dasmarinas" className="aboutus-card">
      <header className="aboutus-card-header">
        <h2>BFP Dasmariñas</h2>
        <p>Station overview, Fire Marshal, vision &amp; mission, and landline / mobile numbers.</p>
      </header>

      {partner.loading || !partner.form ? (
        <div className="aboutus-loading">Loading...</div>
      ) : (
        <>
          <div className="aboutus-subsection">
            <FieldPair label="Station heading" valueEn={partner.form.heading_en} valueTl={partner.form.heading_tl}
              onChangeEn={(v) => partner.setField('heading_en', v)} onChangeTl={(v) => partner.setField('heading_tl', v)} />
            <FieldPair label="Description" multiline valueEn={partner.form.description_en} valueTl={partner.form.description_tl}
              onChangeEn={(v) => partner.setField('description_en', v)} onChangeTl={(v) => partner.setField('description_tl', v)} />
            <FieldPair label="Station name heading" valueEn={partner.form.station_heading_en} valueTl={partner.form.station_heading_tl}
              onChangeEn={(v) => partner.setField('station_heading_en', v)} onChangeTl={(v) => partner.setField('station_heading_tl', v)} />
            <FieldPair label="Emergency call-out label" valueEn={partner.form.emergency_label_en} valueTl={partner.form.emergency_label_tl}
              onChangeEn={(v) => partner.setField('emergency_label_en', v)} onChangeTl={(v) => partner.setField('emergency_label_tl', v)} />
          </div>

          <div className="aboutus-subsection">
            <h3>Fire Marshal</h3>
            <SingleField label="Name" value={partner.form.fire_marshal_name} onChange={(v) => partner.setField('fire_marshal_name', v)} />
            <FieldPair label="Title" valueEn={partner.form.fire_marshal_title_en} valueTl={partner.form.fire_marshal_title_tl}
              onChangeEn={(v) => partner.setField('fire_marshal_title_en', v)} onChangeTl={(v) => partner.setField('fire_marshal_title_tl', v)} />
          </div>

          <div className="aboutus-subsection">
            <h3>Vision &amp; Mission</h3>
            <FieldPair label="Vision label" valueEn={partner.form.vision_label_en} valueTl={partner.form.vision_label_tl}
              onChangeEn={(v) => partner.setField('vision_label_en', v)} onChangeTl={(v) => partner.setField('vision_label_tl', v)} />
            <FieldPair label="Vision" multiline valueEn={partner.form.vision_en} valueTl={partner.form.vision_tl}
              onChangeEn={(v) => partner.setField('vision_en', v)} onChangeTl={(v) => partner.setField('vision_tl', v)} />
            <FieldPair label="Mission label" valueEn={partner.form.mission_label_en} valueTl={partner.form.mission_label_tl}
              onChangeEn={(v) => partner.setField('mission_label_en', v)} onChangeTl={(v) => partner.setField('mission_label_tl', v)} />
            <FieldPair label="Mission" multiline valueEn={partner.form.mission_en} valueTl={partner.form.mission_tl}
              onChangeEn={(v) => partner.setField('mission_en', v)} onChangeTl={(v) => partner.setField('mission_tl', v)} />
          </div>

          <div className="aboutus-save-bar">
            <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={() => requestSave(handleSavePartner)} disabled={partner.saving}>
              <FiSave aria-hidden="true" /> {partner.saving ? 'Saving...' : 'Save BFP Dasmariñas content'}
            </button>
          </div>
        </>
      )}

      <div className="aboutus-subsection">
        <h3>Landline &amp; mobile numbers</h3>
        <p className="aboutus-section-note">
          These are the saved BFP Dasmariñas contact numbers. Each entry can be edited,
          but numbers cannot be added or removed here. A number that also appears on the
          Emergency Contacts card is updated in both places.
        </p>

        {numbers.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-contact-list">
            {numbers.rows.map((row) => (
              <li key={row.contact_key} className={`aboutus-contact-card${numbers.editingId === row.contact_key ? ' is-editing' : ''}`}>
                {numbers.editingId === row.contact_key ? (
                  <ContactNumberEditRow form={numbers.form} setField={numbers.setField} onSave={() => requestSave(numbers.save)} onCancel={numbers.cancelEdit} busy={numbers.busy} />
                ) : (
                  <>
                    <div className="aboutus-contact-card-main">
                      <span className="aboutus-contact-card-type">{row.contact_type}</span>
                      <span className="aboutus-contact-card-value">{row.display_value}</span>
                    </div>
                    <button type="button" className="aboutus-btn aboutus-btn-secondary aboutus-btn-small" onClick={() => numbers.startEdit(row)}>
                      <FiEdit2 aria-hidden="true" /> Edit
                    </button>
                  </>
                )}
              </li>
            ))}
            {numbers.rows.length === 0 && <li className="aboutus-empty">No saved numbers.</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

function ContactNumberEditRow({ form, setField, onSave, onCancel, busy }) {
  return (
    <div className="aboutus-edit-row">
      <SingleField label="Label (e.g. Landline, Mobile)" value={form.label} onChange={(v) => setField('label', v)} />
      <div className="aboutus-language-grid">
        <SingleField label="Display value" value={form.display_value} onChange={(v) => setField('display_value', v)} placeholder="(046) 884-6131" />
        <SingleField label="Dial value" value={form.dial_value} onChange={(v) => setField('dial_value', v)} placeholder="0468846131" />
      </div>
      <div className="aboutus-edit-row-actions">
        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 2 — Emergency Contacts
// ---------------------------------------------------------------------------

function EmergencyCard({ currentUser, notify, reportDirty, requestSave }) {
  const emergency = useSingletonForm({
    load: aboutUsService.getEmergencyInfo,
    update: aboutUsService.updateEmergencyInfo,
    notify,
    entityLabel: 'Emergency Contacts content'
  });

  const numbers = useEditableList({
    load: aboutUsService.listEmergencyNumbers,
    // Edit-only section - the saved numbers can be modified but not added or removed.
    update: (form) => aboutUsService.updateEmergencyNumber(form.id, {
      label_en: form.label_en, label_tl: form.label_tl,
      contact_key: form.contact_key, display_value: form.display_value, dial_value: form.dial_value
    }),
    getId: (row) => row.id,
    notify,
    entityLabel: 'emergency number'
  });

  const handleSaveEmergency = async () => {
    const saved = await emergency.save();
    if (saved) logAboutUsActivity(currentUser, 'About Us Content Updated', 'Updated Emergency Contacts content.');
  };

  useReportDirty(reportDirty, 'emergency-contacts', emergency.isDirty || numbers.isDirty);

  return (
    <section id="emergency-contacts" className="aboutus-card">
      <header className="aboutus-card-header">
        <h2>Emergency Contacts</h2>
        <p>Hotline heading, safety note, and the emergency numbers list.</p>
      </header>

      {emergency.loading || !emergency.form ? (
        <div className="aboutus-loading">Loading...</div>
      ) : (
        <>
          <div className="aboutus-subsection">
            <FieldPair label="Heading" valueEn={emergency.form.heading_en} valueTl={emergency.form.heading_tl}
              onChangeEn={(v) => emergency.setField('heading_en', v)} onChangeTl={(v) => emergency.setField('heading_tl', v)} />
            <FieldPair label="Intro" multiline valueEn={emergency.form.intro_en} valueTl={emergency.form.intro_tl}
              onChangeEn={(v) => emergency.setField('intro_en', v)} onChangeTl={(v) => emergency.setField('intro_tl', v)} />
            <FieldPair label="Safety note" multiline valueEn={emergency.form.safety_note_en} valueTl={emergency.form.safety_note_tl}
              onChangeEn={(v) => emergency.setField('safety_note_en', v)} onChangeTl={(v) => emergency.setField('safety_note_tl', v)} />
          </div>

          <div className="aboutus-save-bar">
            <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={() => requestSave(handleSaveEmergency)} disabled={emergency.saving}>
              <FiSave aria-hidden="true" /> {emergency.saving ? 'Saving...' : 'Save Emergency Contacts content'}
            </button>
          </div>
        </>
      )}

      <div className="aboutus-subsection">
        <h3>Emergency numbers</h3>
        <p className="aboutus-section-note">
          These are the saved emergency numbers shown to visitors. Each entry can be
          edited - its label and number - but numbers cannot be
          added or removed here.
        </p>

        {numbers.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-contact-list">
            {numbers.rows.map((row) => (
              <li key={row.id} className={`aboutus-contact-card${numbers.editingId === row.id ? ' is-editing' : ''}`}>
                {numbers.editingId === row.id ? (
                  <EmergencyNumberEditRow form={numbers.form} setField={numbers.setField} onSave={() => requestSave(numbers.save)} onCancel={numbers.cancelEdit} busy={numbers.busy} />
                ) : (
                  <>
                    <div className="aboutus-contact-card-main">
                      <span className="aboutus-contact-card-type">{row.contact_type === 'mobile' ? 'Mobile' : 'Landline'}</span>
                      <strong className="aboutus-contact-card-label">{row.label_en}</strong>
                      <span className="aboutus-contact-card-value">{row.display_value}</span>
                      <StatusBadge active={row.is_active} />
                    </div>
                    <button type="button" className="aboutus-btn aboutus-btn-secondary aboutus-btn-small" onClick={() => numbers.startEdit(row)}>
                      <FiEdit2 aria-hidden="true" /> Edit
                    </button>
                  </>
                )}
              </li>
            ))}
            {numbers.rows.length === 0 && <li className="aboutus-empty">No saved emergency numbers.</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmergencyNumberEditRow({ form, setField, onSave, onCancel, busy }) {
  return (
    <div className="aboutus-edit-row aboutus-emergency-edit-row">
      <div className="aboutus-emergency-editor-grid">
        <SingleField
          label="Number shown to visitors"
          value={form.display_value}
          onChange={(v) => setField('display_value', v)}
          placeholder="0995-336-9534"
        />
        <SingleField
          label="Dial number"
          value={form.dial_value}
          onChange={(v) => setField('dial_value', v)}
          placeholder="09953369534"
        />
      </div>
      <FieldPair label="Public label" valueEn={form.label_en} valueTl={form.label_tl}
        onChangeEn={(v) => setField('label_en', v)} onChangeTl={(v) => setField('label_tl', v)} />
      <div className="aboutus-edit-row-actions">
        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 3 — Cavite BFP Directory (groups -> entries -> phones)
// ---------------------------------------------------------------------------

function DirectoryCard({ currentUser, notify, reportDirty, requestSave }) {
  const info = useSingletonForm({
    load: aboutUsService.getDirectoryInfo,
    update: aboutUsService.updateDirectoryInfo,
    notify,
    entityLabel: 'Cavite BFP Directory content'
  });

  const [groups, setGroups] = useState([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [expandedEntry, setExpandedEntry] = useState(null);

  // Each open editor keeps the snapshot it started from alongside its form, so
  // dirty means "differs from the last saved Supabase value" here too.
  const [groupEditing, setGroupEditing] = useState(null); // null | 'new' | group_key
  const [groupForm, setGroupForm] = useState({});
  const [groupBaseline, setGroupBaseline] = useState(null);
  const [entryEditing, setEntryEditing] = useState(null); // { groupKey, entryKey|'new' } | null
  const [entryForm, setEntryForm] = useState({});
  const [entryBaseline, setEntryBaseline] = useState(null);
  const [phoneEditing, setPhoneEditing] = useState(null); // { entryKey, id|'new' } | null
  const [phoneForm, setPhoneForm] = useState({});
  const [phoneBaseline, setPhoneBaseline] = useState(null);
  const [busy, setBusy] = useState(false);

  const refreshTree = async () => {
    setLoadingTree(true);
    const { data, error } = await aboutUsService.getDirectoryTree();
    if (error) notify('error', `Failed to load Cavite BFP Directory: ${error}`);
    setGroups(data || []);
    setLoadingTree(false);
    return data || [];
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => { refreshTree(); }, 0);
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveInfo = async () => {
    const saved = await info.save();
    if (saved) logAboutUsActivity(currentUser, 'About Us Content Updated', 'Updated Cavite BFP Directory content.');
  };

  // --- groups ---
  const startEditGroup = (group) => {
    setGroupEditing(group.group_key);
    setGroupForm({ ...group });
    setGroupBaseline({ ...group });
  };
  const cancelGroupEdit = () => { setGroupEditing(null); setGroupForm({}); setGroupBaseline(null); };

  const saveGroup = async () => {
    setBusy(true);
    if (!groups.some((group) => group.group_key === groupEditing)) { setBusy(false); return; }
    const { error } = await aboutUsService.updateDirectoryGroup(groupEditing, { title_en: groupForm.title_en, title_tl: groupForm.title_tl });
    setBusy(false);

    if (error) { notify('error', `Failed to save district/group: ${error}`); return; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelGroupEdit();
    await refreshTree();
  };


  // --- entries ---
  const startEditEntry = (groupKey, entry) => {
    setEntryEditing({ groupKey, entryKey: entry.entry_key });
    setEntryForm({ ...entry });
    setEntryBaseline({ ...entry });
  };
  const cancelEntryEdit = () => { setEntryEditing(null); setEntryForm({}); setEntryBaseline(null); };

  const saveEntry = async () => {
    if (!entryEditing) return;
    const { groupKey, entryKey } = entryEditing;
    if (!groups.find((group) => group.group_key === groupKey)?.entries.some((entry) => entry.entry_key === entryKey)) return;
    setBusy(true);
    const { error } = await aboutUsService.updateDirectoryEntry(entryKey, {
      name_en: entryForm.name_en, name_tl: entryForm.name_tl, email: entryForm.email
    });
    setBusy(false);

    if (error) { notify('error', `Failed to save station: ${error}`); return; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelEntryEdit();
    await refreshTree();
  };


  // --- phones ---
  const startEditPhone = (entryKey, phone) => {
    setPhoneEditing({ entryKey, id: phone.id });
    setPhoneForm({ ...phone });
    setPhoneBaseline({ ...phone });
  };
  const cancelPhoneEdit = () => { setPhoneEditing(null); setPhoneForm({}); setPhoneBaseline(null); };

  const savePhone = async () => {
    if (!phoneEditing) return;
    const { entryKey, id } = phoneEditing;
    if (!groups.flatMap((group) => group.entries).find((entry) => entry.entry_key === entryKey)?.phones.some((phone) => phone.id === id)) return;
    setBusy(true);
    const { error } = await aboutUsService.updateDirectoryPhone(id, { display_value: phoneForm.display_value, dial_value: phoneForm.dial_value });
    setBusy(false);

    if (error) { notify('error', `Failed to save phone number: ${error}`); return; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelPhoneEdit();
    await refreshTree();
  };


  // --- delete flow (shared confirm modal for all 3 levels) ---

  useReportDirty(
    reportDirty,
    'cavite-directory',
    info.isDirty
      || (groupEditing !== null && isFormDirty(groupForm, groupBaseline))
      || (Boolean(entryEditing) && isFormDirty(entryForm, entryBaseline))
      || (Boolean(phoneEditing) && isFormDirty(phoneForm, phoneBaseline))
  );

  return (
    <section id="cavite-directory" className="aboutus-card">
      <header className="aboutus-card-header">
        <h2>Cavite BFP Directory</h2>
        <p>Directory heading, districts/groups, fire stations, emails, and phone numbers.</p>
      </header>

      {info.loading || !info.form ? (
        <div className="aboutus-loading">Loading...</div>
      ) : (
        <>
          <div className="aboutus-subsection">
            <FieldPair label="Heading" valueEn={info.form.heading_en} valueTl={info.form.heading_tl}
              onChangeEn={(v) => info.setField('heading_en', v)} onChangeTl={(v) => info.setField('heading_tl', v)} />
            <FieldPair label="Intro" multiline valueEn={info.form.intro_en} valueTl={info.form.intro_tl}
              onChangeEn={(v) => info.setField('intro_en', v)} onChangeTl={(v) => info.setField('intro_tl', v)} />
            <FieldPair label="No-results message" valueEn={info.form.no_results_en} valueTl={info.form.no_results_tl}
              onChangeEn={(v) => info.setField('no_results_en', v)} onChangeTl={(v) => info.setField('no_results_tl', v)} />
          </div>
          <div className="aboutus-save-bar">
            <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={() => requestSave(handleSaveInfo)} disabled={info.saving}>
              <FiSave aria-hidden="true" /> {info.saving ? 'Saving...' : 'Save directory content'}
            </button>
          </div>
        </>
      )}

      <div className="aboutus-subsection">
        <div className="aboutus-list-header">
          <h3>Districts / groups</h3>
        </div>

        {loadingTree ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-directory-groups">
            {groups.map((group) => {
              const isExpanded = expandedGroup === group.group_key;
              return (
                <li key={group.group_key} className="aboutus-directory-group">
                  {groupEditing === group.group_key ? (
                    <div className="aboutus-edit-row">
                      <FieldPair label="Title" valueEn={groupForm.title_en} valueTl={groupForm.title_tl}
                        onChangeEn={(v) => setGroupForm((f) => ({ ...f, title_en: v }))} onChangeTl={(v) => setGroupForm((f) => ({ ...f, title_tl: v }))} />
                      <div className="aboutus-edit-row-actions">
                        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={cancelGroupEdit} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
                        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={() => requestSave(saveGroup)} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="aboutus-item-row aboutus-directory-group-row">
                      <button type="button" className="aboutus-directory-toggle" onClick={() => setExpandedGroup(isExpanded ? null : group.group_key)}>
                        {isExpanded ? <FiChevronDown aria-hidden="true" /> : <FiChevronRight aria-hidden="true" />}
                        <strong>{group.title_en}</strong>
                        <span className="aboutus-item-sub">{group.entries.length} station{group.entries.length === 1 ? '' : 's'}</span>
                        <StatusBadge active={group.is_active} />
                      </button>
                      <div className="aboutus-item-actions">
                        <RecordActions label={`Actions for ${group.title_en}`}>
                        <button type="button" className="aboutus-icon-btn" onClick={() => startEditGroup(group)} aria-label="Edit district/group" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                        </RecordActions>
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="aboutus-directory-entries">
                      <div className="aboutus-list-header">
                        <h4>Stations</h4>
                      </div>

                      <ul className="aboutus-directory-entry-list">
                        {group.entries.map((entry) => {
                          const entryExpanded = expandedEntry === entry.entry_key;
                          return (
                            <li key={entry.entry_key} className="aboutus-directory-entry">
                              {entryEditing?.groupKey === group.group_key && entryEditing.entryKey === entry.entry_key ? (
                                <EntryEditRow form={entryForm} setForm={setEntryForm} onSave={() => requestSave(saveEntry)} onCancel={cancelEntryEdit} busy={busy} />
                              ) : (
                                <div className="aboutus-item-row">
                                  <button type="button" className="aboutus-directory-toggle" onClick={() => setExpandedEntry(entryExpanded ? null : entry.entry_key)}>
                                    {entryExpanded ? <FiChevronDown aria-hidden="true" /> : <FiChevronRight aria-hidden="true" />}
                                    <strong>{entry.name_en}</strong>
                                    <span className="aboutus-item-sub">{entry.email}</span>
                                    <span className="aboutus-item-sub">{entry.phones.length} number{entry.phones.length === 1 ? '' : 's'}</span>
                                    <StatusBadge active={entry.is_active} />
                                  </button>
                                  <div className="aboutus-item-actions">
                                    <RecordActions label={`Actions for ${entry.name_en}`}>
                                    <button type="button" className="aboutus-icon-btn" onClick={() => startEditEntry(group.group_key, entry)} aria-label="Edit station" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                                    </RecordActions>
                                  </div>
                                </div>
                              )}

                              {entryExpanded && (
                                <div className="aboutus-directory-phones">
                                  <div className="aboutus-list-header">
                                    <h5>Phone numbers</h5>
                                  </div>

                                  <ul className="aboutus-directory-phone-list">
                                    {entry.phones.map((phone) => (
                                      <li key={phone.id} className="aboutus-item-row aboutus-item-row-compact">
                                        {phoneEditing?.entryKey === entry.entry_key && phoneEditing.id === phone.id ? (
                                          <PhoneEditRow form={phoneForm} setForm={setPhoneForm} onSave={() => requestSave(savePhone)} onCancel={cancelPhoneEdit} busy={busy} />
                                        ) : (
                                          <>
                                            <div className="aboutus-item-summary">
                                              <span>{phone.display_value}</span>
                                              <StatusBadge active={phone.is_active} />
                                            </div>
                                            <div className="aboutus-item-actions">
                                              <RecordActions label={`Actions for ${phone.display_value}`}>
                                              <button type="button" className="aboutus-icon-btn" onClick={() => startEditPhone(entry.entry_key, phone)} aria-label="Edit phone" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                                              </RecordActions>
                                            </div>
                                          </>
                                        )}
                                      </li>
                                    ))}
                                    {entry.phones.length === 0 && <li className="aboutus-empty">No phone numbers yet.</li>}
                                  </ul>
                                </div>
                              )}
                            </li>
                          );
                        })}
                        {group.entries.length === 0 && <li className="aboutus-empty">No stations yet.</li>}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
            {groups.length === 0 && <li className="aboutus-empty">No districts/groups yet.</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

function EntryEditRow({ form, setForm, onSave, onCancel, busy }) {
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className="aboutus-edit-row">
      <FieldPair label="Station name" valueEn={form.name_en} valueTl={form.name_tl}
        onChangeEn={(v) => setField('name_en', v)} onChangeTl={(v) => setField('name_tl', v)} />
      <SingleField label="Email" type="email" value={form.email} onChange={(v) => setField('email', v)} />
      <div className="aboutus-edit-row-actions">
        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

function PhoneEditRow({ form, setForm, onSave, onCancel, busy }) {
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className="aboutus-edit-row">
      <div className="aboutus-language-grid">
        <SingleField label="Display value" value={form.display_value} onChange={(v) => setField('display_value', v)} />
        <SingleField label="Dial value" value={form.dial_value} onChange={(v) => setField('dial_value', v)} />
      </div>
      <div className="aboutus-edit-row-actions">
        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 4 — General About Us UI texts (sections)
// ---------------------------------------------------------------------------

function GeneralTextsCard({ notify, reportDirty, requestSave }) {
  const sections = useEditableList({
    load: aboutUsService.listSections,
    update: (form) => aboutUsService.updateSection(form.section_key, {
      title_en: form.title_en, title_tl: form.title_tl, subtitle_en: form.subtitle_en, subtitle_tl: form.subtitle_tl,
    }),
    getId: (row) => row.section_key,
    notify,
    entityLabel: 'section'
  });

  useReportDirty(reportDirty, 'general-texts', sections.isDirty);

  return (
    <section id="general-texts" className="aboutus-card">
      <header className="aboutus-card-header">
        <h2>Other Page Text</h2>
        <p>Section titles and subtitles shown on the About Us page.</p>
      </header>

      <div className="aboutus-subsection">
        <h3>Section Titles &amp; Subtitles</h3>
        {sections.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-item-list">
            {sections.rows.map((row) => (
              <li
                key={row.section_key}
                className={`aboutus-item-row${sections.editingId === row.section_key ? ' is-editing' : ''}`}
              >
                {sections.editingId === row.section_key ? (
                  <div className="aboutus-edit-row aboutus-section-edit">
                    <div className="aboutus-section-edit-grid">
                      <div className="aboutus-section-edit-col aboutus-section-edit-col--en">
                        <h4 className="aboutus-section-edit-lang">English</h4>
                        <SingleField label="Title" value={sections.form.title_en} onChange={(v) => sections.setField('title_en', v)} />
                        <SingleField label="Subtitle" value={sections.form.subtitle_en} onChange={(v) => sections.setField('subtitle_en', v)} />
                      </div>
                      <div className="aboutus-section-edit-col aboutus-section-edit-col--tl">
                        <h4 className="aboutus-section-edit-lang">Tagalog</h4>
                        <SingleField label="Title" value={sections.form.title_tl} onChange={(v) => sections.setField('title_tl', v)} />
                        <SingleField label="Subtitle" value={sections.form.subtitle_tl} onChange={(v) => sections.setField('subtitle_tl', v)} />
                      </div>
                    </div>
                    <div className="aboutus-edit-row-actions">
                      <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={sections.cancelEdit} disabled={sections.busy}><FiX aria-hidden="true" /> Cancel</button>
                      <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={() => requestSave(sections.save)} disabled={sections.busy}><FiSave aria-hidden="true" /> {sections.busy ? 'Saving...' : 'Save'}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="aboutus-item-summary">
                      <strong>{row.title_en}</strong>
                      <span className="aboutus-item-sub">{row.subtitle_en}</span>
                      <StatusBadge active={row.is_active} />
                    </div>
                    <div className="aboutus-item-actions">
                      <RecordActions label={`Actions for ${row.title_en}`}>
                      <button type="button" className="aboutus-icon-btn" onClick={() => sections.startEdit(row)} aria-label="Edit section" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                      </RecordActions>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

function ConfirmSaveModal({ busy, onCancel, onConfirm }) {
  return (
    <div
      className="app-unsaved-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="aboutusSaveTitle"
      aria-describedby="aboutusSaveMessage"
    >
      <div className="app-unsaved-dialog">
        <div className="app-unsaved-icon" aria-hidden="true">?</div>
        <h2 id="aboutusSaveTitle" className="app-unsaved-title">Save Changes?</h2>
        <p id="aboutusSaveMessage" className="app-unsaved-message">
          Are you sure you want to save these changes? The updated content will be reflected in the IGNIS SAFE mobile app.
        </p>
        <div className="app-unsaved-actions">
          <button
            type="button"
            className="app-unsaved-button app-unsaved-button--cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="app-unsaved-button app-unsaved-button--save"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const QUICK_NAV_ITEMS = [
  { id: 'bfp-dasmarinas', label: 'BFP Dasmariñas' },
  { id: 'emergency-contacts', label: 'Emergency Contacts' },
  { id: 'cavite-directory', label: 'Cavite BFP Directory' },
  { id: 'general-texts', label: 'Other Page Text' },
];

export default function AboutUsContent() {
  const { currentUser } = useUser();
  const [message, setMessage] = useState({ type: '', text: '' });
  // Dirty flags keyed by card id; any truthy entry means something on this page
  // has not reached Supabase yet.
  const [dirtyScopes, setDirtyScopes] = useState({});
  const [pendingSave, setPendingSave] = useState(null);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [activeSection, setActiveSection] = useState(QUICK_NAV_ITEMS[0].id);

  const notify = (type, text) => setMessage({ type, text });

  const reportDirty = useCallback((scope, dirty) => {
    setDirtyScopes((current) => (
      Boolean(current[scope]) === Boolean(dirty)
        ? current
        : { ...current, [scope]: Boolean(dirty) }
    ));
  }, []);

  // Every Save button on this page routes through here, so the confirmation
  // dialog is the only path from a click to a Supabase write.
  const requestSave = useCallback((run) => setPendingSave(() => run), []);

  const hasUnsavedChanges = Object.values(dirtyScopes).some(Boolean);

  const handleConfirmSave = async () => {
    if (!pendingSave) return;
    setConfirmingSave(true);
    try {
      // The save handlers report their own success/failure through notify() and
      // leave the edited values on screen when the write fails.
      await pendingSave();
    } finally {
      setConfirmingSave(false);
      setPendingSave(null);
    }
  };

  const mainRef = useRef(null);

  // The quick-nav is sticky and pins just under the shared PageHeader. The
  // header's rendered height changes with viewport / text size, so measure it
  // and expose it as a CSS variable the nav's `top` offset reads from.
  useEffect(() => {
    const main = mainRef.current;
    const header = main?.querySelector('.page-header');
    if (!main || !header) return undefined;

    const syncHeaderHeight = () => {
      main.style.setProperty('--aboutus-header-h', `${header.offsetHeight}px`);
    };

    syncHeaderHeight();

    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(header);
    window.addEventListener('resize', syncHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncHeaderHeight);
    };
  }, []);

  const scrollToSection = (id) => {
    const target = document.getElementById(id);
    const main = mainRef.current;
    if (!target) return;

    // Offset the landing position by the sticky header + sticky quick-nav so the
    // section heading clears both bars instead of hiding behind them.
    const headerHeight = main?.querySelector('.page-header')?.offsetHeight ?? 0;
    const navHeight = main?.querySelector('.aboutus-quicknav')?.offsetHeight ?? 0;
    const offset = headerHeight + navHeight + 16;
    target.style.scrollMarginTop = `${offset}px`;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  };

  return (
    <div className="aboutus-container">
      <Sidebar />

      <div className="aboutus-main" ref={mainRef}>
        <PageHeader title="About Us Content" />

        <MessageBanner message={message} />

        <nav className="aboutus-quicknav" aria-label="About Us content sections">
          {QUICK_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`aboutus-quicknav-item${activeSection === item.id ? ' is-active' : ''}`}
              aria-current={activeSection === item.id ? 'location' : undefined}
              onClick={() => scrollToSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <PartnerCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
        <EmergencyCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
        <DirectoryCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
        <GeneralTextsCard notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
      </div>

      <UnsavedChangesPrompt
        when={hasUnsavedChanges}
        title={UNSAVED_TITLE}
        message={UNSAVED_MESSAGE}
        stayLabel="Stay on Page"
        leaveLabel="Discard Changes"
      />

      {pendingSave && (
        <ConfirmSaveModal
          busy={confirmingSave}
          onCancel={() => setPendingSave(null)}
          onConfirm={handleConfirmSave}
        />
      )}
    </div>
  );
}
