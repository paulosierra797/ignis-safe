import React, { useCallback, useEffect, useState } from 'react';
import {
  FiPlus, FiEdit2, FiTrash2, FiArrowUp, FiArrowDown, FiSave, FiX,
  FiChevronDown, FiChevronRight
} from 'react-icons/fi';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './AboutUsContent.css';
import './AppDialog.css';
import { useUser } from '../context/UserContext';
import { logAdminActivity } from '../utils/usersService';
import * as aboutUsService from '../utils/aboutUsService';
import UnsavedChangesPrompt from './UnsavedChangesPrompt';

const nextOrder = (rows = []) => rows.reduce(
  (max, row) => Math.max(max, Number(row.display_order) || 0),
  0
) + 1;

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

function ReorderButtons({ index, count, busy, onMoveUp, onMoveDown }) {
  return (
    <span className="aboutus-reorder-buttons">
      <button
        type="button"
        className="aboutus-icon-btn"
        onClick={onMoveUp}
        disabled={busy || index === 0}
        aria-label="Move up"
        title="Move up"
      >
        <FiArrowUp aria-hidden="true" />
      </button>
      <button
        type="button"
        className="aboutus-icon-btn"
        onClick={onMoveDown}
        disabled={busy || index === count - 1}
        aria-label="Move down"
        title="Move down"
      >
        <FiArrowDown aria-hidden="true" />
      </button>
    </span>
  );
}

function ConfirmDeleteModal({ open, title, message, busy, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="aboutus-modal-overlay" role="dialog" aria-modal="true">
      <div className="aboutus-modal-box">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="aboutus-modal-actions">
          <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="aboutus-btn aboutus-btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldPair({ label, valueEn, valueTl, onChangeEn, onChangeTl, multiline, rows = 3 }) {
  const Field = multiline ? 'textarea' : 'input';
  return (
    <div className="aboutus-field-pair">
      <span className="aboutus-field-pair-label">{label}</span>
      <div className="aboutus-language-grid">
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

function ActiveCheckbox({ checked, onChange }) {
  return (
    <label className="aboutus-checkbox">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span>Active</span>
    </label>
  );
}

function MessageBanner({ message }) {
  if (!message?.text) return null;
  return (
    <div className={`aboutus-message aboutus-message-${message.type || 'info'}`}>
      {message.text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic repeatable-list controller (add / edit / delete / reorder)
// ---------------------------------------------------------------------------

function useEditableList({
  load, create, update, remove, reorder, getId,
  mapToForm = (row) => ({ ...row }),
  notify, entityLabel
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null | 'new' | <id>
  const [form, setForm] = useState({});
  // The row (or blank defaults) the open editor started from, so "dirty" means
  // "differs from the last saved Supabase value", not "an editor is open".
  const [formBaseline, setFormBaseline] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

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
  const startAdd = (defaults = {}) => { setEditingId('new'); setForm(defaults); setFormBaseline(defaults); };
  const startEdit = (row) => {
    const initial = mapToForm(row);
    setEditingId(getId(row));
    setForm(initial);
    setFormBaseline(initial);
  };
  const cancelEdit = () => { setEditingId(null); setForm({}); setFormBaseline(null); };

  const save = async () => {
    setBusy(true);
    const isNew = editingId === 'new';
    const { error } = isNew ? await create(form, rows) : await update(form);
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

  const confirmDelete = (row) => setPendingDelete(row);
  const cancelDeleteRequest = () => setPendingDelete(null);

  const doDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    const { error } = await remove(pendingDelete);
    setBusy(false);

    if (error) {
      notify('error', `Failed to delete ${entityLabel}: ${error}`);
      return;
    }

    notify('success', `${entityLabel} deleted.`);
    setPendingDelete(null);
    await refresh();
  };

  const move = async (index, direction) => {
    setBusy(true);
    const { error } = await reorder(rows, index, direction);
    setBusy(false);

    if (error) {
      notify('error', `Failed to reorder ${entityLabel}: ${error}`);
      return;
    }

    await refresh();
  };

  const isDirty = editingId !== null && isFormDirty(form, formBaseline);

  return {
    rows, loading, editingId, form, busy, pendingDelete, isDirty,
    setField, startAdd, startEdit, cancelEdit, save,
    confirmDelete, cancelDeleteRequest, doDelete, move, refresh
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
// Card 1 — IGNIS SAFE
// ---------------------------------------------------------------------------

function IgnisSafeCard({ currentUser, notify, reportDirty, requestSave }) {
  const ignis = useSingletonForm({
    load: aboutUsService.getIgnis,
    update: aboutUsService.updateIgnis,
    notify,
    entityLabel: 'IGNIS SAFE content'
  });

  const chips = useEditableList({
    load: aboutUsService.listIgnisChips,
    create: (form, rows) => aboutUsService.createIgnisChip({
      label_en: form.label_en, label_tl: form.label_tl, icon_key: form.icon_key,
      display_order: nextOrder(rows)
    }),
    update: (form) => aboutUsService.updateIgnisChip(form.id, {
      label_en: form.label_en, label_tl: form.label_tl, icon_key: form.icon_key, is_active: form.is_active
    }),
    remove: (row) => aboutUsService.deleteIgnisChip(row.id),
    reorder: aboutUsService.reorderIgnisChips,
    getId: (row) => row.id,
    notify,
    entityLabel: 'feature chip'
  });

  const meanings = useEditableList({
    load: aboutUsService.listNameMeanings,
    create: (form, rows) => aboutUsService.createNameMeaning({
      term_en: form.term_en, term_tl: form.term_tl, body_en: form.body_en, body_tl: form.body_tl,
      display_order: nextOrder(rows)
    }),
    update: (form) => aboutUsService.updateNameMeaning(form.id, {
      term_en: form.term_en, term_tl: form.term_tl, body_en: form.body_en, body_tl: form.body_tl, is_active: form.is_active
    }),
    remove: (row) => aboutUsService.deleteNameMeaning(row.id),
    reorder: aboutUsService.reorderNameMeanings,
    getId: (row) => row.id,
    notify,
    entityLabel: 'name meaning'
  });

  const handleSaveIgnis = async () => {
    const saved = await ignis.save();
    if (saved) logAboutUsActivity(currentUser, 'About Us Content Updated', 'Updated IGNIS SAFE overview content.');
  };

  useReportDirty(reportDirty, 'ignis-safe', ignis.isDirty || chips.isDirty || meanings.isDirty);

  return (
    <section id="ignis-safe" className="aboutus-card">
      <header className="aboutus-card-header">
        <h2>IGNIS SAFE</h2>
        <p>Mission overview, logo meaning, and the goal &amp; feature chips shown on the About Us page.</p>
      </header>

      {ignis.loading || !ignis.form ? (
        <div className="aboutus-loading">Loading...</div>
      ) : (
        <>
          <div className="aboutus-subsection">
            <h3>Overview</h3>
            <FieldPair label="Heading" valueEn={ignis.form.heading_en} valueTl={ignis.form.heading_tl}
              onChangeEn={(v) => ignis.setField('heading_en', v)} onChangeTl={(v) => ignis.setField('heading_tl', v)} />
            <FieldPair label="Description" multiline valueEn={ignis.form.description_en} valueTl={ignis.form.description_tl}
              onChangeEn={(v) => ignis.setField('description_en', v)} onChangeTl={(v) => ignis.setField('description_tl', v)} />
            <FieldPair label="Goal" multiline valueEn={ignis.form.goal_en} valueTl={ignis.form.goal_tl}
              onChangeEn={(v) => ignis.setField('goal_en', v)} onChangeTl={(v) => ignis.setField('goal_tl', v)} />
          </div>

          <div className="aboutus-subsection">
            <h3>Logo</h3>
            <SingleField label="Logo asset path" value={ignis.form.logo_asset_path}
              onChange={(v) => ignis.setField('logo_asset_path', v)} placeholder="assets/logo.png" />
            <FieldPair label="Logo meaning" multiline valueEn={ignis.form.logo_description_en} valueTl={ignis.form.logo_description_tl}
              onChangeEn={(v) => ignis.setField('logo_description_en', v)} onChangeTl={(v) => ignis.setField('logo_description_tl', v)} />
          </div>

          <div className="aboutus-subsection">
            <h3>Brand meaning</h3>
            <FieldPair label="Brand heading" valueEn={ignis.form.brand_heading_en} valueTl={ignis.form.brand_heading_tl}
              onChangeEn={(v) => ignis.setField('brand_heading_en', v)} onChangeTl={(v) => ignis.setField('brand_heading_tl', v)} />
            <FieldPair label={'"Together" statement'} multiline valueEn={ignis.form.together_en} valueTl={ignis.form.together_tl}
              onChangeEn={(v) => ignis.setField('together_en', v)} onChangeTl={(v) => ignis.setField('together_tl', v)} />
            <FieldPair label="Focus heading" multiline valueEn={ignis.form.focus_heading_en} valueTl={ignis.form.focus_heading_tl}
              onChangeEn={(v) => ignis.setField('focus_heading_en', v)} onChangeTl={(v) => ignis.setField('focus_heading_tl', v)} />
            <FieldPair label="Focus body" multiline valueEn={ignis.form.focus_body_en} valueTl={ignis.form.focus_body_tl}
              onChangeEn={(v) => ignis.setField('focus_body_en', v)} onChangeTl={(v) => ignis.setField('focus_body_tl', v)} />
            <FieldPair label="Essence statement" multiline valueEn={ignis.form.essence_en} valueTl={ignis.form.essence_tl}
              onChangeEn={(v) => ignis.setField('essence_en', v)} onChangeTl={(v) => ignis.setField('essence_tl', v)} />
          </div>

          <div className="aboutus-subsection">
            <h3>Team section heading &amp; intro</h3>
            <p className="aboutus-hint">Shown above the Developers &amp; Adviser list on the mobile app.</p>
            <FieldPair label="Team heading" valueEn={ignis.form.team_heading_en} valueTl={ignis.form.team_heading_tl}
              onChangeEn={(v) => ignis.setField('team_heading_en', v)} onChangeTl={(v) => ignis.setField('team_heading_tl', v)} />
            <FieldPair label="Team intro" multiline rows={4} valueEn={ignis.form.team_intro_en} valueTl={ignis.form.team_intro_tl}
              onChangeEn={(v) => ignis.setField('team_intro_en', v)} onChangeTl={(v) => ignis.setField('team_intro_tl', v)} />
            <FieldPair label="Team tip" multiline valueEn={ignis.form.team_tip_en} valueTl={ignis.form.team_tip_tl}
              onChangeEn={(v) => ignis.setField('team_tip_en', v)} onChangeTl={(v) => ignis.setField('team_tip_tl', v)} />
          </div>

          <div className="aboutus-save-bar">
            <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={() => requestSave(handleSaveIgnis)} disabled={ignis.saving}>
              <FiSave aria-hidden="true" /> {ignis.saving ? 'Saving...' : 'Save IGNIS SAFE content'}
            </button>
          </div>
        </>
      )}

      <div className="aboutus-subsection">
        <div className="aboutus-list-header">
          <h3>Goal &amp; feature chips</h3>
          <button type="button" className="aboutus-btn aboutus-btn-outline" onClick={() => chips.startAdd({ label_en: '', label_tl: '', icon_key: '', is_active: true })}>
            <FiPlus aria-hidden="true" /> Add chip
          </button>
        </div>

        {chips.editingId === 'new' && (
          <ChipEditRow form={chips.form} setField={chips.setField} onSave={() => requestSave(chips.save)} onCancel={chips.cancelEdit} busy={chips.busy} />
        )}

        {chips.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-item-list">
            {chips.rows.map((row, index) => (
              <li key={row.id} className="aboutus-item-row">
                {chips.editingId === row.id ? (
                  <ChipEditRow form={chips.form} setField={chips.setField} onSave={() => requestSave(chips.save)} onCancel={chips.cancelEdit} busy={chips.busy} />
                ) : (
                  <>
                    <div className="aboutus-item-summary">
                      <strong>{row.label_en}</strong>
                      <span className="aboutus-item-sub">{row.label_tl}</span>
                      {row.icon_key && <span className="aboutus-item-sub">Icon: {row.icon_key}</span>}
                      <StatusBadge active={row.is_active} />
                    </div>
                    <div className="aboutus-item-actions">
                      <ReorderButtons index={index} count={chips.rows.length} busy={chips.busy} onMoveUp={() => chips.move(index, -1)} onMoveDown={() => chips.move(index, 1)} />
                      <button type="button" className="aboutus-icon-btn" onClick={() => chips.startEdit(row)} aria-label="Edit chip" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                      <button type="button" className="aboutus-icon-btn aboutus-icon-btn-danger" onClick={() => chips.confirmDelete(row)} aria-label="Delete chip" title="Delete"><FiTrash2 aria-hidden="true" /></button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {chips.rows.length === 0 && <li className="aboutus-empty">No chips yet.</li>}
          </ul>
        )}

        <ConfirmDeleteModal
          open={Boolean(chips.pendingDelete)}
          title="Delete feature chip"
          message={`Delete the "${chips.pendingDelete?.label_en}" chip?`}
          busy={chips.busy}
          onCancel={chips.cancelDeleteRequest}
          onConfirm={async () => { await chips.doDelete(); logAboutUsActivity(currentUser, 'About Us Content Deleted', 'Deleted an IGNIS SAFE feature chip.'); }}
        />
      </div>

      <div className="aboutus-subsection">
        <div className="aboutus-list-header">
          <h3>Logo / name meaning</h3>
          <button type="button" className="aboutus-btn aboutus-btn-outline" onClick={() => meanings.startAdd({ term_en: '', term_tl: '', body_en: '', body_tl: '', is_active: true })}>
            <FiPlus aria-hidden="true" /> Add term
          </button>
        </div>

        {meanings.editingId === 'new' && (
          <NameMeaningEditRow form={meanings.form} setField={meanings.setField} onSave={() => requestSave(meanings.save)} onCancel={meanings.cancelEdit} busy={meanings.busy} />
        )}

        {meanings.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-item-list">
            {meanings.rows.map((row, index) => (
              <li key={row.id} className="aboutus-item-row">
                {meanings.editingId === row.id ? (
                  <NameMeaningEditRow form={meanings.form} setField={meanings.setField} onSave={() => requestSave(meanings.save)} onCancel={meanings.cancelEdit} busy={meanings.busy} />
                ) : (
                  <>
                    <div className="aboutus-item-summary">
                      <strong>{row.term_en}</strong>
                      <span className="aboutus-item-sub">{row.body_en}</span>
                      <StatusBadge active={row.is_active} />
                    </div>
                    <div className="aboutus-item-actions">
                      <ReorderButtons index={index} count={meanings.rows.length} busy={meanings.busy} onMoveUp={() => meanings.move(index, -1)} onMoveDown={() => meanings.move(index, 1)} />
                      <button type="button" className="aboutus-icon-btn" onClick={() => meanings.startEdit(row)} aria-label="Edit term" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                      <button type="button" className="aboutus-icon-btn aboutus-icon-btn-danger" onClick={() => meanings.confirmDelete(row)} aria-label="Delete term" title="Delete"><FiTrash2 aria-hidden="true" /></button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {meanings.rows.length === 0 && <li className="aboutus-empty">No terms yet.</li>}
          </ul>
        )}

        <ConfirmDeleteModal
          open={Boolean(meanings.pendingDelete)}
          title="Delete name meaning"
          message={`Delete the "${meanings.pendingDelete?.term_en}" term?`}
          busy={meanings.busy}
          onCancel={meanings.cancelDeleteRequest}
          onConfirm={async () => { await meanings.doDelete(); logAboutUsActivity(currentUser, 'About Us Content Deleted', 'Deleted an IGNIS SAFE name-meaning term.'); }}
        />
      </div>
    </section>
  );
}

function ChipEditRow({ form, setField, onSave, onCancel, busy }) {
  return (
    <div className="aboutus-edit-row">
      <FieldPair label="Label" valueEn={form.label_en} valueTl={form.label_tl}
        onChangeEn={(v) => setField('label_en', v)} onChangeTl={(v) => setField('label_tl', v)} />
      <SingleField label="Icon key" value={form.icon_key} onChange={(v) => setField('icon_key', v)} placeholder="view_in_ar" />
      <ActiveCheckbox checked={form.is_active} onChange={(v) => setField('is_active', v)} />
      <div className="aboutus-edit-row-actions">
        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

function NameMeaningEditRow({ form, setField, onSave, onCancel, busy }) {
  return (
    <div className="aboutus-edit-row">
      <FieldPair label="Term" valueEn={form.term_en} valueTl={form.term_tl}
        onChangeEn={(v) => setField('term_en', v)} onChangeTl={(v) => setField('term_tl', v)} />
      <FieldPair label="Meaning" multiline valueEn={form.body_en} valueTl={form.body_tl}
        onChangeEn={(v) => setField('body_en', v)} onChangeTl={(v) => setField('body_tl', v)} />
      <ActiveCheckbox checked={form.is_active} onChange={(v) => setField('is_active', v)} />
      <div className="aboutus-edit-row-actions">
        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 2 — Developers & Adviser
// ---------------------------------------------------------------------------

function DevelopersCard({ currentUser, notify, reportDirty, requestSave }) {
  const team = useEditableList({
    load: aboutUsService.listTeamMembers,
    create: (form, rows) => aboutUsService.createTeamMember({
      full_name: form.full_name, display_first: form.display_first, display_last: form.display_last,
      role_en: form.role_en, role_tl: form.role_tl, email: form.email || null,
      bio_en: form.bio_en, bio_tl: form.bio_tl, asset_path: form.asset_path,
      linkedin_url: form.linkedin_url || null, display_order: nextOrder(rows)
    }),
    update: (form) => aboutUsService.updateTeamMember(form.id, {
      full_name: form.full_name, display_first: form.display_first, display_last: form.display_last,
      role_en: form.role_en, role_tl: form.role_tl, email: form.email || null,
      bio_en: form.bio_en, bio_tl: form.bio_tl, asset_path: form.asset_path,
      linkedin_url: form.linkedin_url || null, is_active: form.is_active
    }),
    remove: (row) => aboutUsService.deleteTeamMember(row.id),
    reorder: aboutUsService.reorderTeamMembers,
    getId: (row) => row.id,
    notify,
    entityLabel: 'team member'
  });

  const emptyForm = {
    full_name: '', display_first: '', display_last: '', role_en: '', role_tl: '',
    email: '', bio_en: '', bio_tl: '', asset_path: '', linkedin_url: '', is_active: true
  };

  useReportDirty(reportDirty, 'developers', team.isDirty);

  return (
    <section id="developers" className="aboutus-card">
      <header className="aboutus-card-header">
        <div className="aboutus-list-header">
          <div>
            <h2>Developers &amp; Adviser</h2>
            <p>The team profiles shown on the About Us page.</p>
          </div>
          <button type="button" className="aboutus-btn aboutus-btn-outline" onClick={() => team.startAdd(emptyForm)}>
            <FiPlus aria-hidden="true" /> Add member
          </button>
        </div>
      </header>

      {team.editingId === 'new' && (
        <TeamMemberEditRow form={team.form} setField={team.setField} onSave={() => requestSave(team.save)} onCancel={team.cancelEdit} busy={team.busy} />
      )}

      {team.loading ? <div className="aboutus-loading">Loading...</div> : (
        <ul className="aboutus-item-list">
          {team.rows.map((row, index) => (
            <li key={row.id} className="aboutus-item-row">
              {team.editingId === row.id ? (
                <TeamMemberEditRow form={team.form} setField={team.setField} onSave={() => requestSave(team.save)} onCancel={team.cancelEdit} busy={team.busy} />
              ) : (
                <>
                  <div className="aboutus-item-summary">
                    <strong>{row.full_name}</strong>
                    <span className="aboutus-item-sub">{row.role_en}</span>
                    {row.email && <span className="aboutus-item-sub">{row.email}</span>}
                    <span className="aboutus-item-sub">{row.asset_path}</span>
                    <StatusBadge active={row.is_active} />
                  </div>
                  <div className="aboutus-item-actions">
                    <ReorderButtons index={index} count={team.rows.length} busy={team.busy} onMoveUp={() => team.move(index, -1)} onMoveDown={() => team.move(index, 1)} />
                    <button type="button" className="aboutus-icon-btn" onClick={() => team.startEdit(row)} aria-label="Edit member" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                    <button type="button" className="aboutus-icon-btn aboutus-icon-btn-danger" onClick={() => team.confirmDelete(row)} aria-label="Delete member" title="Delete"><FiTrash2 aria-hidden="true" /></button>
                  </div>
                </>
              )}
            </li>
          ))}
          {team.rows.length === 0 && <li className="aboutus-empty">No team members yet.</li>}
        </ul>
      )}

      <ConfirmDeleteModal
        open={Boolean(team.pendingDelete)}
        title="Delete team member"
        message={`Delete "${team.pendingDelete?.full_name}" from the Developers & Adviser list?`}
        busy={team.busy}
        onCancel={team.cancelDeleteRequest}
        onConfirm={async () => { await team.doDelete(); logAboutUsActivity(currentUser, 'About Us Content Deleted', 'Deleted a Developers & Adviser team member.'); }}
      />
    </section>
  );
}

function TeamMemberEditRow({ form, setField, onSave, onCancel, busy }) {
  return (
    <div className="aboutus-edit-row">
      <SingleField label="Full name" value={form.full_name} onChange={(v) => setField('full_name', v)} />
      <div className="aboutus-language-grid">
        <SingleField label="Display first name" value={form.display_first} onChange={(v) => setField('display_first', v)} />
        <SingleField label="Display last name" value={form.display_last} onChange={(v) => setField('display_last', v)} />
      </div>
      <FieldPair label="Role" valueEn={form.role_en} valueTl={form.role_tl}
        onChangeEn={(v) => setField('role_en', v)} onChangeTl={(v) => setField('role_tl', v)} />
      <SingleField label="Email (optional)" type="email" value={form.email} onChange={(v) => setField('email', v)} />
      <FieldPair label="Bio" multiline valueEn={form.bio_en} valueTl={form.bio_tl}
        onChangeEn={(v) => setField('bio_en', v)} onChangeTl={(v) => setField('bio_tl', v)} />
      <SingleField label="Image path" value={form.asset_path} onChange={(v) => setField('asset_path', v)} placeholder="assets/dev_example.jpg" />
      <SingleField label="LinkedIn URL (optional)" type="url" value={form.linkedin_url} onChange={(v) => setField('linkedin_url', v)} />
      <ActiveCheckbox checked={form.is_active} onChange={(v) => setField('is_active', v)} />
      <div className="aboutus-edit-row-actions">
        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 3 — BFP Dasmariñas
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
    create: (form, rows) => aboutUsService.createPartnerContactNumber(
      { label: form.label, display_value: form.display_value, dial_value: form.dial_value },
      rows
    ),
    update: (form) => aboutUsService.updatePartnerContactNumber(form.contact_key, {
      label: form.label, display_value: form.display_value, dial_value: form.dial_value
    }),
    remove: (row) => aboutUsService.deletePartnerContactNumber(row.contact_key),
    reorder: aboutUsService.reorderPartnerContactNumbers,
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
        <div className="aboutus-list-header">
          <h3>Landline &amp; mobile numbers</h3>
          <button type="button" className="aboutus-btn aboutus-btn-outline" onClick={() => numbers.startAdd({ label: '', display_value: '', dial_value: '' })}>
            <FiPlus aria-hidden="true" /> Add number
          </button>
        </div>
        <p className="aboutus-hint">
          This number also appears on the Emergency Contacts card if it is reused there — editing the value updates both places.
        </p>

        {numbers.editingId === 'new' && (
          <ContactNumberEditRow form={numbers.form} setField={numbers.setField} onSave={() => requestSave(numbers.save)} onCancel={numbers.cancelEdit} busy={numbers.busy} />
        )}

        {numbers.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-item-list">
            {numbers.rows.map((row, index) => (
              <li key={row.contact_key} className="aboutus-item-row">
                {numbers.editingId === row.contact_key ? (
                  <ContactNumberEditRow form={numbers.form} setField={numbers.setField} onSave={() => requestSave(numbers.save)} onCancel={numbers.cancelEdit} busy={numbers.busy} />
                ) : (
                  <>
                    <div className="aboutus-item-summary">
                      <strong>{row.contact_type}</strong>
                      <span className="aboutus-item-sub">{row.display_value}</span>
                    </div>
                    <div className="aboutus-item-actions">
                      <ReorderButtons index={index} count={numbers.rows.length} busy={numbers.busy} onMoveUp={() => numbers.move(index, -1)} onMoveDown={() => numbers.move(index, 1)} />
                      <button type="button" className="aboutus-icon-btn" onClick={() => numbers.startEdit(row)} aria-label="Edit number" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                      <button type="button" className="aboutus-icon-btn aboutus-icon-btn-danger" onClick={() => numbers.confirmDelete(row)} aria-label="Delete number" title="Delete"><FiTrash2 aria-hidden="true" /></button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {numbers.rows.length === 0 && <li className="aboutus-empty">No numbers yet.</li>}
          </ul>
        )}

        <ConfirmDeleteModal
          open={Boolean(numbers.pendingDelete)}
          title="Delete contact number"
          message={`Remove "${numbers.pendingDelete?.contact_type}" (${numbers.pendingDelete?.display_value}) from BFP Dasmariñas?`}
          busy={numbers.busy}
          onCancel={numbers.cancelDeleteRequest}
          onConfirm={async () => { await numbers.doDelete(); logAboutUsActivity(currentUser, 'About Us Content Deleted', 'Removed a BFP Dasmariñas contact number.'); }}
        />
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
// Card 4 — Emergency Contacts
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
    create: (form, rows) => aboutUsService.createEmergencyNumber({
      label_en: form.label_en, label_tl: form.label_tl, icon_key: form.icon_key,
      display_value: form.display_value, dial_value: form.dial_value
    }, rows),
    update: (form) => aboutUsService.updateEmergencyNumber(form.id, {
      label_en: form.label_en, label_tl: form.label_tl, icon_key: form.icon_key,
      is_active: form.is_active, display_order: form.display_order,
      contact_key: form.contact_key, display_value: form.display_value, dial_value: form.dial_value
    }),
    remove: (row) => aboutUsService.deleteEmergencyNumber(row.id, row.contact_key),
    reorder: aboutUsService.reorderEmergencyNumbers,
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
        <div className="aboutus-list-header">
          <h3>Emergency numbers</h3>
          <button type="button" className="aboutus-btn aboutus-btn-outline" onClick={() => numbers.startAdd({ label_en: '', label_tl: '', icon_key: '', display_value: '', dial_value: '', is_active: true })}>
            <FiPlus aria-hidden="true" /> Add number
          </button>
        </div>
        <p className="aboutus-hint">
          This number also appears on the BFP Dasmariñas card if it is reused there — editing the value updates both places.
        </p>

        {numbers.editingId === 'new' && (
          <EmergencyNumberEditRow form={numbers.form} setField={numbers.setField} onSave={() => requestSave(numbers.save)} onCancel={numbers.cancelEdit} busy={numbers.busy} />
        )}

        {numbers.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-item-list">
            {numbers.rows.map((row, index) => (
              <li key={row.id} className="aboutus-item-row">
                {numbers.editingId === row.id ? (
                  <EmergencyNumberEditRow form={numbers.form} setField={numbers.setField} onSave={() => requestSave(numbers.save)} onCancel={numbers.cancelEdit} busy={numbers.busy} />
                ) : (
                  <>
                    <div className="aboutus-item-summary">
                      <strong>{row.label_en}</strong>
                      <span className="aboutus-item-sub">{row.display_value}</span>
                      <StatusBadge active={row.is_active} />
                    </div>
                    <div className="aboutus-item-actions">
                      <ReorderButtons index={index} count={numbers.rows.length} busy={numbers.busy} onMoveUp={() => numbers.move(index, -1)} onMoveDown={() => numbers.move(index, 1)} />
                      <button type="button" className="aboutus-icon-btn" onClick={() => numbers.startEdit(row)} aria-label="Edit number" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                      <button type="button" className="aboutus-icon-btn aboutus-icon-btn-danger" onClick={() => numbers.confirmDelete(row)} aria-label="Delete number" title="Delete"><FiTrash2 aria-hidden="true" /></button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {numbers.rows.length === 0 && <li className="aboutus-empty">No emergency numbers yet.</li>}
          </ul>
        )}

        <ConfirmDeleteModal
          open={Boolean(numbers.pendingDelete)}
          title="Delete emergency number"
          message={`Delete "${numbers.pendingDelete?.label_en}" (${numbers.pendingDelete?.display_value})?`}
          busy={numbers.busy}
          onCancel={numbers.cancelDeleteRequest}
          onConfirm={async () => { await numbers.doDelete(); logAboutUsActivity(currentUser, 'About Us Content Deleted', 'Deleted an Emergency Contacts number.'); }}
        />
      </div>
    </section>
  );
}

function EmergencyNumberEditRow({ form, setField, onSave, onCancel, busy }) {
  return (
    <div className="aboutus-edit-row">
      <FieldPair label="Label" valueEn={form.label_en} valueTl={form.label_tl}
        onChangeEn={(v) => setField('label_en', v)} onChangeTl={(v) => setField('label_tl', v)} />
      <SingleField label="Icon key" value={form.icon_key} onChange={(v) => setField('icon_key', v)} placeholder="local_phone" />
      <div className="aboutus-language-grid">
        <SingleField label="Display value" value={form.display_value} onChange={(v) => setField('display_value', v)} />
        <SingleField label="Dial value" value={form.dial_value} onChange={(v) => setField('dial_value', v)} />
      </div>
      <ActiveCheckbox checked={form.is_active} onChange={(v) => setField('is_active', v)} />
      <div className="aboutus-edit-row-actions">
        <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={onCancel} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
        <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={onSave} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 5 — Cavite BFP Directory (groups -> entries -> phones)
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
  const [pendingDelete, setPendingDelete] = useState(null); // { kind, ...refs, label }

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
  const startAddGroup = () => {
    const defaults = { title_en: '', title_tl: '', is_active: true };
    setGroupEditing('new');
    setGroupForm(defaults);
    setGroupBaseline(defaults);
  };
  const startEditGroup = (group) => {
    setGroupEditing(group.group_key);
    setGroupForm({ ...group });
    setGroupBaseline({ ...group });
  };
  const cancelGroupEdit = () => { setGroupEditing(null); setGroupForm({}); setGroupBaseline(null); };

  const saveGroup = async () => {
    setBusy(true);
    const isNew = groupEditing === 'new';
    const { error } = isNew
      ? await aboutUsService.createDirectoryGroup({ title_en: groupForm.title_en, title_tl: groupForm.title_tl, display_order: nextOrder(groups) })
      : await aboutUsService.updateDirectoryGroup(groupEditing, { title_en: groupForm.title_en, title_tl: groupForm.title_tl, is_active: groupForm.is_active });
    setBusy(false);

    if (error) { notify('error', `Failed to save district/group: ${error}`); return; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelGroupEdit();
    await refreshTree();
  };

  const moveGroup = async (index, direction) => {
    setBusy(true);
    const { error } = await aboutUsService.reorderDirectoryGroups(groups, index, direction);
    setBusy(false);
    if (error) { notify('error', `Failed to reorder districts/groups: ${error}`); return; }
    await refreshTree();
  };

  // --- entries ---
  const startAddEntry = (groupKey) => {
    const defaults = { name_en: '', name_tl: '', email: '', is_active: true };
    setEntryEditing({ groupKey, entryKey: 'new' });
    setEntryForm(defaults);
    setEntryBaseline(defaults);
  };
  const startEditEntry = (groupKey, entry) => {
    setEntryEditing({ groupKey, entryKey: entry.entry_key });
    setEntryForm({ ...entry });
    setEntryBaseline({ ...entry });
  };
  const cancelEntryEdit = () => { setEntryEditing(null); setEntryForm({}); setEntryBaseline(null); };

  const saveEntry = async () => {
    if (!entryEditing) return;
    const { groupKey, entryKey } = entryEditing;
    const group = groups.find((g) => g.group_key === groupKey);
    const isNew = entryKey === 'new';

    setBusy(true);
    const { error } = isNew
      ? await aboutUsService.createDirectoryEntry(groupKey, {
        name_en: entryForm.name_en, name_tl: entryForm.name_tl, email: entryForm.email,
        display_order: nextOrder(group?.entries || [])
      })
      : await aboutUsService.updateDirectoryEntry(entryKey, {
        name_en: entryForm.name_en, name_tl: entryForm.name_tl, email: entryForm.email, is_active: entryForm.is_active
      });
    setBusy(false);

    if (error) { notify('error', `Failed to save station: ${error}`); return; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelEntryEdit();
    await refreshTree();
  };

  const moveEntry = async (group, index, direction) => {
    setBusy(true);
    const { error } = await aboutUsService.reorderDirectoryEntries(group.entries, index, direction);
    setBusy(false);
    if (error) { notify('error', `Failed to reorder stations: ${error}`); return; }
    await refreshTree();
  };

  // --- phones ---
  const startAddPhone = (entryKey) => {
    const defaults = { display_value: '', dial_value: '' };
    setPhoneEditing({ entryKey, id: 'new' });
    setPhoneForm(defaults);
    setPhoneBaseline(defaults);
  };
  const startEditPhone = (entryKey, phone) => {
    setPhoneEditing({ entryKey, id: phone.id });
    setPhoneForm({ ...phone });
    setPhoneBaseline({ ...phone });
  };
  const cancelPhoneEdit = () => { setPhoneEditing(null); setPhoneForm({}); setPhoneBaseline(null); };

  const savePhone = async () => {
    if (!phoneEditing) return;
    const { entryKey, id } = phoneEditing;
    const entry = groups.flatMap((g) => g.entries).find((e) => e.entry_key === entryKey);
    const isNew = id === 'new';

    setBusy(true);
    const { error } = isNew
      ? await aboutUsService.createDirectoryPhone(entryKey, {
        display_value: phoneForm.display_value, dial_value: phoneForm.dial_value,
        display_order: nextOrder(entry?.phones || [])
      })
      : await aboutUsService.updateDirectoryPhone(id, { display_value: phoneForm.display_value, dial_value: phoneForm.dial_value, is_active: phoneForm.is_active });
    setBusy(false);

    if (error) { notify('error', `Failed to save phone number: ${error}`); return; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    cancelPhoneEdit();
    await refreshTree();
  };

  const movePhone = async (entry, index, direction) => {
    setBusy(true);
    const { error } = await aboutUsService.reorderDirectoryPhones(entry.phones, index, direction);
    setBusy(false);
    if (error) { notify('error', `Failed to reorder phone numbers: ${error}`); return; }
    await refreshTree();
  };

  // --- delete flow (shared confirm modal for all 3 levels) ---
  const doDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    let error = null;

    if (pendingDelete.kind === 'group') {
      ({ error } = await aboutUsService.deleteDirectoryGroup(pendingDelete.group_key));
    } else if (pendingDelete.kind === 'entry') {
      ({ error } = await aboutUsService.deleteDirectoryEntry(pendingDelete.entry_key));
    } else if (pendingDelete.kind === 'phone') {
      ({ error } = await aboutUsService.deleteDirectoryPhone(pendingDelete.id));
    }

    setBusy(false);
    if (error) { notify('error', `Failed to delete: ${error}`); return; }

    notify('success', 'Deleted successfully.');
    logAboutUsActivity(currentUser, 'About Us Content Deleted', `Deleted a Cavite BFP Directory ${pendingDelete.kind}.`);
    setPendingDelete(null);
    await refreshTree();
  };

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
          <button type="button" className="aboutus-btn aboutus-btn-outline" onClick={startAddGroup}>
            <FiPlus aria-hidden="true" /> Add district/group
          </button>
        </div>

        {groupEditing === 'new' && (
          <div className="aboutus-edit-row">
            <FieldPair label="Title" valueEn={groupForm.title_en} valueTl={groupForm.title_tl}
              onChangeEn={(v) => setGroupForm((f) => ({ ...f, title_en: v }))} onChangeTl={(v) => setGroupForm((f) => ({ ...f, title_tl: v }))} />
            <div className="aboutus-edit-row-actions">
              <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={cancelGroupEdit} disabled={busy}><FiX aria-hidden="true" /> Cancel</button>
              <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={() => requestSave(saveGroup)} disabled={busy}><FiSave aria-hidden="true" /> {busy ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        )}

        {loadingTree ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-directory-groups">
            {groups.map((group, groupIndex) => {
              const isExpanded = expandedGroup === group.group_key;
              return (
                <li key={group.group_key} className="aboutus-directory-group">
                  {groupEditing === group.group_key ? (
                    <div className="aboutus-edit-row">
                      <FieldPair label="Title" valueEn={groupForm.title_en} valueTl={groupForm.title_tl}
                        onChangeEn={(v) => setGroupForm((f) => ({ ...f, title_en: v }))} onChangeTl={(v) => setGroupForm((f) => ({ ...f, title_tl: v }))} />
                      <ActiveCheckbox checked={groupForm.is_active} onChange={(v) => setGroupForm((f) => ({ ...f, is_active: v }))} />
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
                        <ReorderButtons index={groupIndex} count={groups.length} busy={busy} onMoveUp={() => moveGroup(groupIndex, -1)} onMoveDown={() => moveGroup(groupIndex, 1)} />
                        <button type="button" className="aboutus-icon-btn" onClick={() => startEditGroup(group)} aria-label="Edit district/group" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                        <button
                          type="button"
                          className="aboutus-icon-btn aboutus-icon-btn-danger"
                          onClick={() => setPendingDelete({ kind: 'group', group_key: group.group_key, label: group.title_en })}
                          aria-label="Delete district/group"
                          title="Delete"
                        >
                          <FiTrash2 aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="aboutus-directory-entries">
                      <div className="aboutus-list-header">
                        <h4>Stations</h4>
                        <button type="button" className="aboutus-btn aboutus-btn-outline aboutus-btn-small" onClick={() => startAddEntry(group.group_key)}>
                          <FiPlus aria-hidden="true" /> Add station
                        </button>
                      </div>

                      {entryEditing?.groupKey === group.group_key && entryEditing.entryKey === 'new' && (
                        <EntryEditRow form={entryForm} setForm={setEntryForm} onSave={() => requestSave(saveEntry)} onCancel={cancelEntryEdit} busy={busy} />
                      )}

                      <ul className="aboutus-directory-entry-list">
                        {group.entries.map((entry, entryIndex) => {
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
                                    <ReorderButtons index={entryIndex} count={group.entries.length} busy={busy} onMoveUp={() => moveEntry(group, entryIndex, -1)} onMoveDown={() => moveEntry(group, entryIndex, 1)} />
                                    <button type="button" className="aboutus-icon-btn" onClick={() => startEditEntry(group.group_key, entry)} aria-label="Edit station" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                                    <button
                                      type="button"
                                      className="aboutus-icon-btn aboutus-icon-btn-danger"
                                      onClick={() => setPendingDelete({ kind: 'entry', entry_key: entry.entry_key, label: entry.name_en })}
                                      aria-label="Delete station"
                                      title="Delete"
                                    >
                                      <FiTrash2 aria-hidden="true" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {entryExpanded && (
                                <div className="aboutus-directory-phones">
                                  <div className="aboutus-list-header">
                                    <h5>Phone numbers</h5>
                                    <button type="button" className="aboutus-btn aboutus-btn-outline aboutus-btn-small" onClick={() => startAddPhone(entry.entry_key)}>
                                      <FiPlus aria-hidden="true" /> Add phone
                                    </button>
                                  </div>

                                  {phoneEditing?.entryKey === entry.entry_key && phoneEditing.id === 'new' && (
                                    <PhoneEditRow form={phoneForm} setForm={setPhoneForm} onSave={() => requestSave(savePhone)} onCancel={cancelPhoneEdit} busy={busy} />
                                  )}

                                  <ul className="aboutus-directory-phone-list">
                                    {entry.phones.map((phone, phoneIndex) => (
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
                                              <ReorderButtons index={phoneIndex} count={entry.phones.length} busy={busy} onMoveUp={() => movePhone(entry, phoneIndex, -1)} onMoveDown={() => movePhone(entry, phoneIndex, 1)} />
                                              <button type="button" className="aboutus-icon-btn" onClick={() => startEditPhone(entry.entry_key, phone)} aria-label="Edit phone" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                                              <button
                                                type="button"
                                                className="aboutus-icon-btn aboutus-icon-btn-danger"
                                                onClick={() => setPendingDelete({ kind: 'phone', id: phone.id, label: phone.display_value })}
                                                aria-label="Delete phone"
                                                title="Delete"
                                              >
                                                <FiTrash2 aria-hidden="true" />
                                              </button>
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

      <ConfirmDeleteModal
        open={Boolean(pendingDelete)}
        title="Delete directory item"
        message={
          pendingDelete?.kind === 'group'
            ? `Delete "${pendingDelete?.label}"? This also deletes every station and phone number inside it.`
            : pendingDelete?.kind === 'entry'
              ? `Delete "${pendingDelete?.label}"? This also deletes its phone numbers.`
              : `Delete phone number "${pendingDelete?.label}"?`
        }
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={doDelete}
      />
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
      <ActiveCheckbox checked={form.is_active} onChange={(v) => setField('is_active', v)} />
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
// Card 6 — General About Us UI texts (sections + ui texts)
// ---------------------------------------------------------------------------

function GeneralTextsCard({ currentUser, notify, reportDirty, requestSave }) {
  const sections = useEditableList({
    load: aboutUsService.listSections,
    create: async () => ({ error: 'Adding new sections is not supported.' }),
    update: (form) => aboutUsService.updateSection(form.section_key, {
      title_en: form.title_en, title_tl: form.title_tl, subtitle_en: form.subtitle_en, subtitle_tl: form.subtitle_tl,
      icon_key: form.icon_key, is_active: form.is_active
    }),
    remove: async () => ({ error: 'Deleting sections is not supported.' }),
    reorder: aboutUsService.reorderSections,
    getId: (row) => row.section_key,
    notify,
    entityLabel: 'section'
  });

  const [uiTexts, setUiTexts] = useState([]);
  const [loadingTexts, setLoadingTexts] = useState(true);
  const [textEditingKey, setTextEditingKey] = useState(null);
  const [textForm, setTextForm] = useState({});
  const [textBaseline, setTextBaseline] = useState(null);
  const [textBusy, setTextBusy] = useState(false);
  const [textSearch, setTextSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoadingTexts(true);
      const { data, error } = await aboutUsService.listUiTexts();
      if (error) notify('error', `Failed to load UI texts: ${error}`);
      setUiTexts(data || []);
      setLoadingTexts(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditText = (row) => { setTextEditingKey(row.key); setTextForm({ ...row }); setTextBaseline({ ...row }); };
  const cancelEditText = () => { setTextEditingKey(null); setTextForm({}); setTextBaseline(null); };

  const saveText = async () => {
    setTextBusy(true);
    const { error } = await aboutUsService.updateUiText(textEditingKey, { text_en: textForm.text_en, text_tl: textForm.text_tl });
    setTextBusy(false);

    if (error) { notify('error', `Failed to save UI text: ${error}`); return; }
    notify('success', SAVE_SUCCESS_MESSAGE);
    setUiTexts((rows) => rows.map((row) => (row.key === textEditingKey ? { ...row, text_en: textForm.text_en, text_tl: textForm.text_tl } : row)));
    cancelEditText();
    logAboutUsActivity(currentUser, 'About Us Content Updated', `Updated the "${textEditingKey}" UI text.`);
  };

  useReportDirty(
    reportDirty,
    'general-texts',
    sections.isDirty || (textEditingKey !== null && isFormDirty(textForm, textBaseline))
  );

  const filteredTexts = textSearch.trim()
    ? uiTexts.filter((row) => `${row.key} ${row.text_en} ${row.text_tl}`.toLowerCase().includes(textSearch.trim().toLowerCase()))
    : uiTexts;

  return (
    <section id="general-texts" className="aboutus-card">
      <header className="aboutus-card-header">
        <h2>General About Us UI Texts</h2>
        <p>Section titles/subtitles, display order, active status, and shared interface labels.</p>
      </header>

      <div className="aboutus-subsection">
        <h3>Section titles &amp; subtitles</h3>
        {sections.loading ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-item-list">
            {sections.rows.map((row, index) => (
              <li key={row.section_key} className="aboutus-item-row">
                {sections.editingId === row.section_key ? (
                  <div className="aboutus-edit-row">
                    <FieldPair label="Title" valueEn={sections.form.title_en} valueTl={sections.form.title_tl}
                      onChangeEn={(v) => sections.setField('title_en', v)} onChangeTl={(v) => sections.setField('title_tl', v)} />
                    <FieldPair label="Subtitle" valueEn={sections.form.subtitle_en} valueTl={sections.form.subtitle_tl}
                      onChangeEn={(v) => sections.setField('subtitle_en', v)} onChangeTl={(v) => sections.setField('subtitle_tl', v)} />
                    <SingleField label="Icon key" value={sections.form.icon_key} onChange={(v) => sections.setField('icon_key', v)} />
                    <ActiveCheckbox checked={sections.form.is_active} onChange={(v) => sections.setField('is_active', v)} />
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
                      <ReorderButtons index={index} count={sections.rows.length} busy={sections.busy} onMoveUp={() => sections.move(index, -1)} onMoveDown={() => sections.move(index, 1)} />
                      <button type="button" className="aboutus-icon-btn" onClick={() => sections.startEdit(row)} aria-label="Edit section" title="Edit"><FiEdit2 aria-hidden="true" /></button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="aboutus-subsection">
        <div className="aboutus-list-header">
          <h3>Interface labels</h3>
          <input
            type="search"
            className="aboutus-search-input"
            placeholder="Search by key or text..."
            value={textSearch}
            onChange={(event) => setTextSearch(event.target.value)}
          />
        </div>

        {loadingTexts ? <div className="aboutus-loading">Loading...</div> : (
          <ul className="aboutus-item-list">
            {filteredTexts.map((row) => (
              <li key={row.key} className="aboutus-item-row">
                {textEditingKey === row.key ? (
                  <div className="aboutus-edit-row">
                    <span className="aboutus-field-pair-label">{row.key}</span>
                    <FieldPair label="Text" valueEn={textForm.text_en} valueTl={textForm.text_tl}
                      onChangeEn={(v) => setTextForm((f) => ({ ...f, text_en: v }))} onChangeTl={(v) => setTextForm((f) => ({ ...f, text_tl: v }))} />
                    <div className="aboutus-edit-row-actions">
                      <button type="button" className="aboutus-btn aboutus-btn-secondary" onClick={cancelEditText} disabled={textBusy}><FiX aria-hidden="true" /> Cancel</button>
                      <button type="button" className="aboutus-btn aboutus-btn-primary" onClick={() => requestSave(saveText)} disabled={textBusy}><FiSave aria-hidden="true" /> {textBusy ? 'Saving...' : 'Save'}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="aboutus-item-summary">
                      <strong>{row.key}</strong>
                      <span className="aboutus-item-sub">EN: {row.text_en}</span>
                      <span className="aboutus-item-sub">TL: {row.text_tl}</span>
                    </div>
                    <div className="aboutus-item-actions">
                      <button type="button" className="aboutus-icon-btn" onClick={() => startEditText(row)} aria-label={`Edit ${row.key}`} title="Edit"><FiEdit2 aria-hidden="true" /></button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {filteredTexts.length === 0 && <li className="aboutus-empty">No matching UI texts.</li>}
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
  { id: 'ignis-safe', label: 'IGNIS SAFE' },
  { id: 'developers', label: 'Developers & Adviser' },
  { id: 'bfp-dasmarinas', label: 'BFP Dasmariñas' },
  { id: 'emergency-contacts', label: 'Emergency Contacts' },
  { id: 'cavite-directory', label: 'Cavite BFP Directory' },
  { id: 'general-texts', label: 'General UI Texts' },
];

export default function AboutUsContent() {
  const { currentUser } = useUser();
  const [message, setMessage] = useState({ type: '', text: '' });
  // Dirty flags keyed by card id; any truthy entry means something on this page
  // has not reached Supabase yet.
  const [dirtyScopes, setDirtyScopes] = useState({});
  const [pendingSave, setPendingSave] = useState(null);
  const [confirmingSave, setConfirmingSave] = useState(false);

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

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="aboutus-container">
      <Sidebar />

      <div className="aboutus-main">
        <PageHeader title="About Us Content" />

        <MessageBanner message={message} />

        <nav className="aboutus-quicknav" aria-label="About Us content sections">
          {QUICK_NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" className="aboutus-quicknav-item" onClick={() => scrollToSection(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <IgnisSafeCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
        <DevelopersCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
        <PartnerCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
        <EmergencyCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
        <DirectoryCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
        <GeneralTextsCard currentUser={currentUser} notify={notify} reportDirty={reportDirty} requestSave={requestSave} />
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
