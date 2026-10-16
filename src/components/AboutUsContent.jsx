import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import RecordActions from './RecordActions';
import {
  FiEdit2, FiSave, FiX,
  FiChevronDown, FiChevronRight, FiGlobe
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
import TranslationControls from './TranslationControls';
import Hint from './Hint';
import TranslatorRegistryContext from '../context/TranslatorRegistryContext';

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

// Each tab publishes its own dirty flag to the page shell, which owns the
// single navigation blocker for the whole About Us screen.
function useReportDirty(reportDirty, scope, dirty) {
  useEffect(() => {
    reportDirty(scope, dirty);
    return () => reportDirty(scope, false);
  }, [reportDirty, scope, dirty]);
}

// Hands the page shell a function that saves everything dirty in this tab, so
// Save Tab / Save All can run it. The latest closure is read through a ref.
function useRegisterSave(registerSave, scope, save) {
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => registerSave(scope, () => saveRef.current()), [registerSave, scope]);
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
      <div className="aboutus-language-grid">
        <label className="aboutus-field aboutus-field--en">
          <span>English</span>
          <Field
            type={multiline ? undefined : 'text'}
            rows={multiline ? rows : undefined}
            value={valueEn || ''}
            onChange={(event) => onChangeEn(event.target.value)}
          />
        </label>
        <label className="aboutus-field aboutus-field--tl">
          <span>Filipino</span>
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

function EditActions({ onCancel, onSave, busy }) {
  return (
    <div className="aboutus-edit-row-actions">
      <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
      <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
    </div>
  );
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
    setField, setForm, startEdit, cancelEdit, save, refresh
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

  return { form, loading, saving, isDirty, setField, setForm, save };
}

// ---------------------------------------------------------------------------
// Tab 1 — BFP Dasmariñas
// ---------------------------------------------------------------------------

function PartnerCard({ currentUser, notify, reportDirty, registerSave }) {
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
    return saved;
  };

  useReportDirty(reportDirty, 'bfp-dasmarinas', partner.isDirty || numbers.isDirty);
  useRegisterSave(registerSave, 'bfp-dasmarinas', async () => {
    let ok = true;
    if (partner.isDirty) ok = (await handleSavePartner()) && ok;
    if (numbers.isDirty) ok = (await numbers.save()) && ok;
    return ok;
  });

  return (
    <div className="aboutus-body">
      {partner.loading || !partner.form ? (
        <div className="aboutus-loading">Loading...</div>
      ) : (
        <>
          <TranslationControls headless value={partner.form} onChange={partner.setForm} section="about_us" />
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
            <h3><Hint text="Name and title of the station's Fire Marshal.">Fire Marshal</Hint></h3>
            <SingleField label="Name" value={partner.form.fire_marshal_name} onChange={(v) => partner.setField('fire_marshal_name', v)} />
            <FieldPair label="Title" valueEn={partner.form.fire_marshal_title_en} valueTl={partner.form.fire_marshal_title_tl}
              onChangeEn={(v) => partner.setField('fire_marshal_title_en', v)} onChangeTl={(v) => partner.setField('fire_marshal_title_tl', v)} />
          </div>

          <div className="aboutus-subsection">
            <h3><Hint text="Shown on the About Us page under the station overview.">Vision &amp; Mission</Hint></h3>
            <FieldPair label="Vision label" valueEn={partner.form.vision_label_en} valueTl={partner.form.vision_label_tl}
              onChangeEn={(v) => partner.setField('vision_label_en', v)} onChangeTl={(v) => partner.setField('vision_label_tl', v)} />
            <FieldPair label="Vision" multiline valueEn={partner.form.vision_en} valueTl={partner.form.vision_tl}
              onChangeEn={(v) => partner.setField('vision_en', v)} onChangeTl={(v) => partner.setField('vision_tl', v)} />
            <FieldPair label="Mission label" valueEn={partner.form.mission_label_en} valueTl={partner.form.mission_label_tl}
              onChangeEn={(v) => partner.setField('mission_label_en', v)} onChangeTl={(v) => partner.setField('mission_label_tl', v)} />
            <FieldPair label="Mission" multiline valueEn={partner.form.mission_en} valueTl={partner.form.mission_tl}
              onChangeEn={(v) => partner.setField('mission_en', v)} onChangeTl={(v) => partner.setField('mission_tl', v)} />
          </div>
        </>
      )}

      <div className="aboutus-subsection">
        <h3><Hint text="Existing numbers can be edited, not added or removed. A number shared with Emergency Contacts updates in both places.">Landline &amp; mobile numbers</Hint></h3>

        {numbers.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-contact-list">
            {numbers.rows.map((row) => (
              <li key={row.contact_key} className={`aboutus-contact-card${numbers.editingId === row.contact_key ? ' is-editing' : ''}`}>
                {numbers.editingId === row.contact_key ? (
                  <ContactNumberEditRow form={numbers.form} setField={numbers.setField} onSave={numbers.save} onCancel={numbers.cancelEdit} busy={numbers.busy} />
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
    </div>
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
      <EditActions onCancel={onCancel} onSave={onSave} busy={busy} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Emergency Contacts
// ---------------------------------------------------------------------------

function EmergencyCard({ currentUser, notify, reportDirty, registerSave }) {
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
    return saved;
  };

  useReportDirty(reportDirty, 'emergency-contacts', emergency.isDirty || numbers.isDirty);
  useRegisterSave(registerSave, 'emergency-contacts', async () => {
    let ok = true;
    if (emergency.isDirty) ok = (await handleSaveEmergency()) && ok;
    if (numbers.isDirty) ok = (await numbers.save()) && ok;
    return ok;
  });

  return (
    <div className="aboutus-body">
      {emergency.loading || !emergency.form ? (
        <div className="aboutus-loading">Loading...</div>
      ) : (
        <>
          <TranslationControls headless value={emergency.form} onChange={emergency.setForm} section="about_us" />
          <div className="aboutus-subsection">
            <FieldPair label="Heading" valueEn={emergency.form.heading_en} valueTl={emergency.form.heading_tl}
              onChangeEn={(v) => emergency.setField('heading_en', v)} onChangeTl={(v) => emergency.setField('heading_tl', v)} />
            <FieldPair label="Intro" multiline valueEn={emergency.form.intro_en} valueTl={emergency.form.intro_tl}
              onChangeEn={(v) => emergency.setField('intro_en', v)} onChangeTl={(v) => emergency.setField('intro_tl', v)} />
            <FieldPair label="Safety note" multiline valueEn={emergency.form.safety_note_en} valueTl={emergency.form.safety_note_tl}
              onChangeEn={(v) => emergency.setField('safety_note_en', v)} onChangeTl={(v) => emergency.setField('safety_note_tl', v)} />
          </div>
        </>
      )}

      <div className="aboutus-subsection">
        <h3><Hint text="Numbers shown to visitors. Existing entries can be edited, not added or removed.">Emergency numbers</Hint></h3>

        {numbers.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-contact-list">
            {numbers.rows.map((row) => (
              <li key={row.id} className={`aboutus-contact-card${numbers.editingId === row.id ? ' is-editing' : ''}`}>
                {numbers.editingId === row.id ? (
                  <EmergencyNumberEditRow form={numbers.form} setField={numbers.setField} setForm={numbers.setForm} onSave={numbers.save} onCancel={numbers.cancelEdit} busy={numbers.busy} />
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
    </div>
  );
}

function EmergencyNumberEditRow({ form, setField, setForm, onSave, onCancel, busy }) {
  return (
    <div className="aboutus-edit-row aboutus-emergency-edit-row">
      <TranslationControls headless value={form} onChange={setForm} section="about_us" />
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
      <EditActions onCancel={onCancel} onSave={onSave} busy={busy} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Cavite BFP Directory (groups -> entries -> phones)
// ---------------------------------------------------------------------------

// Collapses an expanded directory accordion once the user has scrolled it fully
// out of view. `element` is the expanded section's DOM node (null when nothing
// is expanded). The sticky page header + toolbar cover the top of the
// viewport, so that strip is excluded from what counts as visible. Nothing
// collapses until the section has been seen on screen at least once, and never
// while `blocked` (an edit form inside it is open). A tab that is switched away
// from is display:none and never reports visible again until it is reopened.
function useCollapseWhenOffscreen(element, onCollapse, blocked = false) {
  const onCollapseRef = useRef(onCollapse);
  useEffect(() => { onCollapseRef.current = onCollapse; }, [onCollapse]);

  useEffect(() => {
    if (!element || blocked || typeof IntersectionObserver === 'undefined') return undefined;

    const stickyOffset = ['.page-header', '.aboutus-toolbar']
      .reduce((sum, selector) => sum + (document.querySelector(selector)?.offsetHeight ?? 0), 0);

    let hasBeenVisible = false;
    const observer = new IntersectionObserver((entries) => {
      const { isIntersecting } = entries[entries.length - 1];
      if (isIntersecting) {
        hasBeenVisible = true;
      } else if (hasBeenVisible && element.getClientRects().length > 0) {
        // Ignore the "not visible" report caused by the tab being hidden.
        onCollapseRef.current();
      }
    }, { rootMargin: `-${stickyOffset}px 0px 0px 0px` });

    observer.observe(element);
    return () => observer.disconnect();
  }, [element, blocked]);
}

function DirectoryCard({ currentUser, notify, reportDirty, registerSave }) {
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
  const [groupEditing, setGroupEditing] = useState(null); // null | group_key
  const [groupForm, setGroupForm] = useState({});
  const [groupBaseline, setGroupBaseline] = useState(null);
  const [entryEditing, setEntryEditing] = useState(null); // { groupKey, entryKey } | null
  const [entryForm, setEntryForm] = useState({});
  const [entryBaseline, setEntryBaseline] = useState(null);
  const [phoneEditing, setPhoneEditing] = useState(null); // { entryKey, id } | null
  const [phoneForm, setPhoneForm] = useState({});
  const [phoneBaseline, setPhoneBaseline] = useState(null);
  const [busy, setBusy] = useState(false);

  // DOM nodes of the currently expanded group / station, for the auto-collapse
  // observers below.
  const [expandedGroupEl, setExpandedGroupEl] = useState(null);
  const [expandedEntryEl, setExpandedEntryEl] = useState(null);

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
    return saved;
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
    if (!groups.some((group) => group.group_key === groupEditing)) { setBusy(false); return false; }
    const { error } = await aboutUsService.updateDirectoryGroup(groupEditing, { title_en: groupForm.title_en, title_tl: groupForm.title_tl });
    setBusy(false);

    if (error) { notify('error', `Failed to save district/group: ${error}`); return false; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelGroupEdit();
    await refreshTree();
    return true;
  };

  // --- entries ---
  const startEditEntry = (groupKey, entry) => {
    setEntryEditing({ groupKey, entryKey: entry.entry_key });
    setEntryForm({ ...entry });
    setEntryBaseline({ ...entry });
  };
  const cancelEntryEdit = () => { setEntryEditing(null); setEntryForm({}); setEntryBaseline(null); };

  const saveEntry = async () => {
    if (!entryEditing) return false;
    const { groupKey, entryKey } = entryEditing;
    if (!groups.find((group) => group.group_key === groupKey)?.entries.some((entry) => entry.entry_key === entryKey)) return false;
    setBusy(true);
    const { error } = await aboutUsService.updateDirectoryEntry(entryKey, {
      name_en: entryForm.name_en, name_tl: entryForm.name_tl, email: entryForm.email
    });
    setBusy(false);

    if (error) { notify('error', `Failed to save station: ${error}`); return false; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelEntryEdit();
    await refreshTree();
    return true;
  };

  // --- phones ---
  const startEditPhone = (entryKey, phone) => {
    setPhoneEditing({ entryKey, id: phone.id });
    setPhoneForm({ ...phone });
    setPhoneBaseline({ ...phone });
  };
  const cancelPhoneEdit = () => { setPhoneEditing(null); setPhoneForm({}); setPhoneBaseline(null); };

  const savePhone = async () => {
    if (!phoneEditing) return false;
    const { entryKey, id } = phoneEditing;
    if (!groups.flatMap((group) => group.entries).find((entry) => entry.entry_key === entryKey)?.phones.some((phone) => phone.id === id)) return false;
    setBusy(true);
    const { error } = await aboutUsService.updateDirectoryPhone(id, { display_value: phoneForm.display_value, dial_value: phoneForm.dial_value });
    setBusy(false);

    if (error) { notify('error', `Failed to save phone number: ${error}`); return false; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelPhoneEdit();
    await refreshTree();
    return true;
  };

  const groupDirty = groupEditing !== null && isFormDirty(groupForm, groupBaseline);
  const entryDirty = Boolean(entryEditing) && isFormDirty(entryForm, entryBaseline);
  const phoneDirty = Boolean(phoneEditing) && isFormDirty(phoneForm, phoneBaseline);

  useReportDirty(reportDirty, 'cavite-directory', info.isDirty || groupDirty || entryDirty || phoneDirty);
  useRegisterSave(registerSave, 'cavite-directory', async () => {
    let ok = true;
    if (info.isDirty) ok = (await handleSaveInfo()) && ok;
    if (groupDirty) ok = (await saveGroup()) && ok;
    if (entryDirty) ok = (await saveEntry()) && ok;
    if (phoneDirty) ok = (await savePhone()) && ok;
    return ok;
  });

  // Auto-collapse an expanded district / station when it scrolls out of view.
  // Held open while an edit form anywhere inside it is open.
  const expandedGroupData = groups.find((group) => group.group_key === expandedGroup);
  const groupHasOpenEdit = expandedGroup !== null && (
    groupEditing === expandedGroup
    || entryEditing?.groupKey === expandedGroup
    || Boolean(phoneEditing && expandedGroupData?.entries.some((entry) => entry.entry_key === phoneEditing.entryKey))
  );
  const entryHasOpenEdit = expandedEntry !== null && (
    entryEditing?.entryKey === expandedEntry
    || phoneEditing?.entryKey === expandedEntry
  );
  useCollapseWhenOffscreen(
    expandedGroupEl,
    () => setExpandedGroup((current) => (current === expandedGroup ? null : current)),
    groupHasOpenEdit
  );
  useCollapseWhenOffscreen(
    expandedEntryEl,
    () => setExpandedEntry((current) => (current === expandedEntry ? null : current)),
    entryHasOpenEdit
  );

  return (
    <div className="aboutus-body">
      {info.loading || !info.form ? (
        <div className="aboutus-loading">Loading...</div>
      ) : (
        <>
          <TranslationControls headless value={info.form} onChange={info.setForm} section="about_us" />
          <div className="aboutus-subsection">
            <FieldPair label="Heading" valueEn={info.form.heading_en} valueTl={info.form.heading_tl}
              onChangeEn={(v) => info.setField('heading_en', v)} onChangeTl={(v) => info.setField('heading_tl', v)} />
            <FieldPair label="Intro" multiline valueEn={info.form.intro_en} valueTl={info.form.intro_tl}
              onChangeEn={(v) => info.setField('intro_en', v)} onChangeTl={(v) => info.setField('intro_tl', v)} />
            <FieldPair label="No-results message" valueEn={info.form.no_results_en} valueTl={info.form.no_results_tl}
              onChangeEn={(v) => info.setField('no_results_en', v)} onChangeTl={(v) => info.setField('no_results_tl', v)} />
          </div>
        </>
      )}

      <div className="aboutus-subsection">
        <div className="aboutus-list-header">
          <h3><Hint text="Districts, their fire stations, emails and phone numbers.">Districts / groups</Hint></h3>
        </div>

        {loadingTree ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-directory-groups">
            {groups.map((group) => {
              const isExpanded = expandedGroup === group.group_key;
              return (
                <li key={group.group_key} className="aboutus-directory-group" ref={isExpanded ? setExpandedGroupEl : undefined}>
                  {groupEditing === group.group_key ? (
                    <div className="aboutus-edit-row">
                      <TranslationControls headless value={groupForm} onChange={setGroupForm} section="about_us" />
                      <FieldPair label="Title" valueEn={groupForm.title_en} valueTl={groupForm.title_tl}
                        onChangeEn={(v) => setGroupForm((f) => ({ ...f, title_en: v }))} onChangeTl={(v) => setGroupForm((f) => ({ ...f, title_tl: v }))} />
                      <EditActions onCancel={cancelGroupEdit} onSave={saveGroup} busy={busy} />
                    </div>
                  ) : (
                    <div className="aboutus-item-row aboutus-directory-group-row">
                      <button type="button" className="aboutus-directory-toggle" onClick={() => setExpandedGroup(isExpanded ? null : group.group_key)} aria-expanded={isExpanded}>
                        {isExpanded ? <FiChevronDown aria-hidden="true" /> : <FiChevronRight aria-hidden="true" />}
                        <strong>{group.title_en}</strong>
                        <span className="aboutus-item-sub">{group.entries.length} station{group.entries.length === 1 ? '' : 's'}</span>
                        <StatusBadge active={group.is_active} />
                      </button>
                      <div className="aboutus-item-actions">
                        <RecordActions label={`Actions for ${group.title_en}`}>
                        <button type="button" className="aboutus-icon-btn" onClick={() => startEditGroup(group)} aria-label="Edit district/group"><FiEdit2 aria-hidden="true" /></button>
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
                            <li key={entry.entry_key} className="aboutus-directory-entry" ref={entryExpanded ? setExpandedEntryEl : undefined}>
                              {entryEditing?.groupKey === group.group_key && entryEditing.entryKey === entry.entry_key ? (
                                <EntryEditRow form={entryForm} setForm={setEntryForm} onSave={saveEntry} onCancel={cancelEntryEdit} busy={busy} />
                              ) : (
                                <div className="aboutus-item-row">
                                  <button type="button" className="aboutus-directory-toggle" onClick={() => setExpandedEntry(entryExpanded ? null : entry.entry_key)} aria-expanded={entryExpanded}>
                                    {entryExpanded ? <FiChevronDown aria-hidden="true" /> : <FiChevronRight aria-hidden="true" />}
                                    <strong>{entry.name_en}</strong>
                                    <span className="aboutus-item-sub">{entry.email}</span>
                                    <span className="aboutus-item-sub">{entry.phones.length} number{entry.phones.length === 1 ? '' : 's'}</span>
                                    <StatusBadge active={entry.is_active} />
                                  </button>
                                  <div className="aboutus-item-actions">
                                    <RecordActions label={`Actions for ${entry.name_en}`}>
                                    <button type="button" className="aboutus-icon-btn" onClick={() => startEditEntry(group.group_key, entry)} aria-label="Edit station"><FiEdit2 aria-hidden="true" /></button>
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
                                          <PhoneEditRow form={phoneForm} setForm={setPhoneForm} onSave={savePhone} onCancel={cancelPhoneEdit} busy={busy} />
                                        ) : (
                                          <>
                                            <div className="aboutus-item-summary">
                                              <span>{phone.display_value}</span>
                                              <StatusBadge active={phone.is_active} />
                                            </div>
                                            <div className="aboutus-item-actions">
                                              <RecordActions label={`Actions for ${phone.display_value}`}>
                                              <button type="button" className="aboutus-icon-btn" onClick={() => startEditPhone(entry.entry_key, phone)} aria-label="Edit phone"><FiEdit2 aria-hidden="true" /></button>
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
    </div>
  );
}

function EntryEditRow({ form, setForm, onSave, onCancel, busy }) {
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className="aboutus-edit-row">
      <TranslationControls headless value={form} onChange={setForm} section="about_us" />
      <FieldPair label="Station name" valueEn={form.name_en} valueTl={form.name_tl}
        onChangeEn={(v) => setField('name_en', v)} onChangeTl={(v) => setField('name_tl', v)} />
      <SingleField label="Email" type="email" value={form.email} onChange={(v) => setField('email', v)} />
      <EditActions onCancel={onCancel} onSave={onSave} busy={busy} />
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
      <EditActions onCancel={onCancel} onSave={onSave} busy={busy} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4 — Website Content (section titles & subtitles)
// ---------------------------------------------------------------------------

const SECTION_FIELDS = ['title_en', 'title_tl', 'subtitle_en', 'subtitle_tl'];

const pickSectionFields = (row) => Object.fromEntries(SECTION_FIELDS.map((key) => [key, row?.[key]]));

// Every section stays editable at once, so Save Tab / Translate Tab cover them
// all. A section counts as dirty only when it differs from its saved row.
function WebsiteContentCard({ notify, reportDirty, registerSave }) {
  const [saved, setSaved] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSections = useCallback(async () => {
    const { data, error } = await aboutUsService.listSections();
    if (error) notify('error', `Failed to load section: ${error}`);
    return data || [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const rows = await loadSections();
      if (!isMounted) return;
      setSaved(rows);
      setDrafts(rows);
      setLoading(false);
    })();
    return () => { isMounted = false; };
  }, [loadSections]);

  const dirtyKeys = useMemo(() => drafts
    .filter((draft) => isFormDirty(
      pickSectionFields(draft),
      pickSectionFields(saved.find((row) => row.section_key === draft.section_key))
    ))
    .map((draft) => draft.section_key), [drafts, saved]);

  const setField = (sectionKey, key, value) => setDrafts((current) => current.map((draft) => (
    draft.section_key === sectionKey ? { ...draft, [key]: value } : draft
  )));

  const save = async () => {
    if (dirtyKeys.length === 0) return true;
    const failed = new Set();
    for (const sectionKey of dirtyKeys) {
      const draft = drafts.find((row) => row.section_key === sectionKey);
      const { error } = await aboutUsService.updateSection(sectionKey, {
        title_en: draft.title_en, title_tl: draft.title_tl, subtitle_en: draft.subtitle_en, subtitle_tl: draft.subtitle_tl,
      });
      if (error) {
        failed.add(sectionKey);
        notify('error', `Failed to save section: ${error}`);
      }
    }

    const fresh = await loadSections();
    // Sections that failed keep the admin's edits on screen and stay dirty.
    setSaved(fresh.length ? fresh : saved);
    setDrafts((current) => (fresh.length ? fresh : current).map((row) => (
      failed.has(row.section_key) ? (current.find((draft) => draft.section_key === row.section_key) || row) : row
    )));
    if (failed.size === 0) notify('success', SAVE_SUCCESS_MESSAGE);
    return failed.size === 0;
  };

  useReportDirty(reportDirty, 'general-texts', dirtyKeys.length > 0);
  useRegisterSave(registerSave, 'general-texts', save);

  return (
    <div className="aboutus-body">
      {loading ? <div className="aboutus-loading">Loading...</div> : (
        <>
          <TranslationControls
            headless
            value={{ items: drafts }}
            onChange={(next) => setDrafts(next.items)}
            section="about_us"
          />
          <ul className="aboutus-section-list">
            {drafts.map((draft) => (
              <li key={draft.section_key} className="aboutus-subsection">
                <div className="aboutus-section-title">
                  <h3>{saved.find((row) => row.section_key === draft.section_key)?.title_en || draft.title_en}</h3>
                  <StatusBadge active={draft.is_active} />
                </div>
                <FieldPair label="Title" valueEn={draft.title_en} valueTl={draft.title_tl}
                  onChangeEn={(v) => setField(draft.section_key, 'title_en', v)} onChangeTl={(v) => setField(draft.section_key, 'title_tl', v)} />
                <FieldPair label="Subtitle" valueEn={draft.subtitle_en} valueTl={draft.subtitle_tl}
                  onChangeEn={(v) => setField(draft.section_key, 'subtitle_en', v)} onChangeTl={(v) => setField(draft.section_key, 'subtitle_tl', v)} />
              </li>
            ))}
            {drafts.length === 0 && <li className="aboutus-empty">No sections found.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

function ConfirmSaveModal({ busy, title, onCancel, onConfirm }) {
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
        <h2 id="aboutusSaveTitle" className="app-unsaved-title">{title}</h2>
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

const TABS = [
  { id: 'bfp-dasmarinas', label: 'BFP Dasmariñas', hint: 'Station overview, Fire Marshal, vision & mission, and station numbers.' },
  { id: 'emergency-contacts', label: 'Emergency Contacts', hint: 'Hotline heading, safety note, and the emergency numbers list.' },
  { id: 'cavite-directory', label: 'Cavite BFP Directory', hint: 'Directory heading, districts, fire stations, emails, and phone numbers.' },
  { id: 'general-texts', label: 'Website Content', hint: 'Section titles and subtitles shown on the About Us page.' },
];

const TRANSLATE_DIRECTIONS = [
  { key: 'en-fil', label: 'English → Filipino' },
  { key: 'fil-en', label: 'Filipino → English' },
];

// One "Translate" button that asks for a direction, so the same control works
// for the whole page and for a single tab.
function TranslateMenu({ label, busy, disabled, onSelect, className = '' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'mousedown' && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="aboutus-menu" ref={rootRef}>
      <button
        type="button"
        className={`aboutus-btn aboutus-btn-secondary ${className}`.trim()}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <span className="aboutus-spinner" aria-hidden="true" /> : <FiGlobe aria-hidden="true" />}
        {busy ? 'Translating...' : label}
        <FiChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="aboutus-menu-list" role="menu">
          {TRANSLATE_DIRECTIONS.map((direction) => (
            <button
              key={direction.key}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSelect(direction.key); }}
            >
              {direction.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AboutUsContent() {
  const { currentUser } = useUser();
  const [message, setMessage] = useState({ type: '', text: '' });
  // Dirty flags keyed by tab id; any truthy entry means something on this page
  // has not reached Supabase yet.
  const [dirtyScopes, setDirtyScopes] = useState({});
  const [pendingSave, setPendingSave] = useState(null); // { tabIds, title } | null
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [translating, setTranslating] = useState(false);
  // Tabs holding translations that still wait for the admin's review.
  const [reviewTabs, setReviewTabs] = useState({});

  const notify = useCallback((type, text) => setMessage({ type, text }), []);

  const reportDirty = useCallback((scope, dirty) => {
    setDirtyScopes((current) => (
      Boolean(current[scope]) === Boolean(dirty)
        ? current
        : { ...current, [scope]: Boolean(dirty) }
    ));
  }, []);

  const hasUnsavedChanges = Object.values(dirtyScopes).some(Boolean);

  // --- save registry: every tab registers one "save what is dirty" function ---
  const saversRef = useRef({});
  const registerSave = useCallback((scope, run) => {
    saversRef.current[scope] = run;
    return () => { if (saversRef.current[scope] === run) delete saversRef.current[scope]; };
  }, []);

  // Every Save button on this page routes through here, so the confirmation
  // dialog is the only path from a click to a Supabase write.
  const requestSave = (tabIds, title) => setPendingSave({ tabIds, title });

  const handleConfirmSave = async () => {
    if (!pendingSave) return;
    setConfirmingSave(true);
    const failedTabs = [];
    try {
      // Each tab's save reports its own success/failure through notify() and
      // leaves the edited values on screen when a write fails.
      for (const tabId of pendingSave.tabIds) {
        const ok = await saversRef.current[tabId]?.();
        if (ok === false) failedTabs.push(TABS.find((tab) => tab.id === tabId)?.label || tabId);
      }
      if (failedTabs.length > 1) notify('error', `Some changes could not be saved: ${failedTabs.join(', ')}.`);
    } finally {
      setConfirmingSave(false);
      setPendingSave(null);
    }
  };

  const dirtyTabIds = TABS.filter((tab) => dirtyScopes[tab.id]).map((tab) => tab.id);

  // --- translate registry: each translation panel inside a tab registers here ---
  const translatorsRef = useRef({});
  const registries = useMemo(() => Object.fromEntries(TABS.map((tab) => [tab.id, {
    register: (api) => {
      const set = (translatorsRef.current[tab.id] ||= new Set());
      set.add(api);
      return () => set.delete(api);
    },
  }])), []);

  const translateTabs = async (tabIds, directionKey) => {
    if (translating) return;
    setTranslating(true);
    const totals = { applied: 0, pending: 0, failed: 0 };
    const review = {};
    try {
      // One request at a time keeps usage gentle on the translator's free tier.
      for (const tabId of tabIds) {
        for (const api of [...(translatorsRef.current[tabId] || [])]) {
          const result = await api.translate(directionKey);
          totals.applied += result.applied;
          totals.pending += result.pending;
          if (result.failed) totals.failed += 1;
          if (result.pending > 0) review[tabId] = true;
        }
      }
    } finally {
      setTranslating(false);
    }

    setReviewTabs((current) => ({ ...current, ...review }));
    const parts = [];
    if (totals.applied) parts.push(`${totals.applied} draft translation${totals.applied === 1 ? '' : 's'} added.`);
    if (totals.pending) parts.push(`${totals.pending} replacement${totals.pending === 1 ? '' : 's'} waiting for your review.`);
    if (totals.failed) parts.push('Some fields could not be translated.');
    if (parts.length === 0) parts.push('Nothing new to translate.');
    if (totals.applied) parts.push('Review the drafts, then save.');
    notify(totals.failed ? 'error' : 'success', parts.join(' '));
  };

  const mainRef = useRef(null);

  // The toolbar is sticky and pins just under the shared PageHeader. The
  // header's rendered height changes with viewport / text size, so measure it
  // and expose it as a CSS variable the toolbar's `top` offset reads from.
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

  // Subtle entrance whenever a tab opens.
  useEffect(() => {
    const panel = mainRef.current?.querySelector('.aboutus-panel:not([hidden])');
    if (!panel || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const tween = gsap.fromTo(panel, { autoAlpha: 0, y: 10 }, {
      autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity,visibility',
    });
    return () => tween.kill();
  }, [activeTab]);

  const selectTab = (id) => {
    setActiveTab(id);
    setReviewTabs((current) => (current[id] ? { ...current, [id]: false } : current));
  };

  const handleTabKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    const next = TABS[(index + step + TABS.length) % TABS.length];
    selectTab(next.id);
    document.getElementById(`aboutus-tab-${next.id}`)?.focus();
  };

  const cardProps = { currentUser, notify, reportDirty, registerSave };
  const activeMeta = TABS.find((tab) => tab.id === activeTab);

  const renderTab = (tab) => {
    const Card = {
      'bfp-dasmarinas': PartnerCard,
      'emergency-contacts': EmergencyCard,
      'cavite-directory': DirectoryCard,
      'general-texts': WebsiteContentCard,
    }[tab.id];
    return (
      <div
        key={tab.id}
        id={`aboutus-panel-${tab.id}`}
        role="tabpanel"
        aria-labelledby={`aboutus-tab-${tab.id}`}
        className="aboutus-panel"
        hidden={activeTab !== tab.id}
      >
        {/* Every tab stays mounted, so unsaved edits survive switching tabs. */}
        <TranslatorRegistryContext.Provider value={registries[tab.id]}>
          <Card {...cardProps} />
        </TranslatorRegistryContext.Provider>
      </div>
    );
  };

  return (
    <div className="aboutus-container">
      <Sidebar />

      <div className="aboutus-main" ref={mainRef}>
        <PageHeader title="About Us Content" />

        <MessageBanner message={message} />

        <div className="aboutus-toolbar">
          <div className="aboutus-tabs" role="tablist" aria-label="About Us content sections" onKeyDown={handleTabKeyDown}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                id={`aboutus-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`aboutus-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={`aboutus-tab${activeTab === tab.id ? ' is-active' : ''}`}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
                {dirtyScopes[tab.id] && <span className="aboutus-tab-dot" title="Unsaved changes" aria-label="Unsaved changes" />}
                {reviewTabs[tab.id] && <span className="aboutus-tab-dot is-review" title="Translations to review" aria-label="Translations to review" />}
              </button>
            ))}
          </div>
          <div className="aboutus-toolbar-actions">
            <TranslateMenu
              label="Translate All"
              busy={translating}
              onSelect={(directionKey) => translateTabs(TABS.map((tab) => tab.id), directionKey)}
            />
            <button
              type="button"
              className="aboutus-btn aboutus-btn-primary"
              onClick={() => requestSave(dirtyTabIds, 'Save All Changes?')}
              disabled={dirtyTabIds.length === 0 || confirmingSave}
            >
              <FiSave aria-hidden="true" /> Save All
            </button>
          </div>
        </div>

        <div className="aboutus-surface">
          <div className="aboutus-panel-head">
            <h2><Hint text={activeMeta.hint} placement="bottom">{activeMeta.label}</Hint></h2>
            <div className="aboutus-panel-actions">
              <TranslateMenu
                label="Translate Tab"
                className="aboutus-btn-small"
                busy={translating}
                onSelect={(directionKey) => translateTabs([activeTab], directionKey)}
              />
              <button
                type="button"
                className="aboutus-btn aboutus-btn-outline aboutus-btn-small"
                onClick={() => requestSave([activeTab], 'Save Tab Changes?')}
                disabled={!dirtyScopes[activeTab] || confirmingSave}
              >
                <FiSave aria-hidden="true" /> Save Tab
              </button>
            </div>
          </div>
          {TABS.map(renderTab)}
        </div>
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
          title={pendingSave.title}
          onCancel={() => setPendingSave(null)}
          onConfirm={handleConfirmSave}
        />
      )}
    </div>
  );
}
