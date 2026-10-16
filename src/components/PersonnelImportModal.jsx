import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiDownload,
  FiFileText,
  FiRefreshCw,
  FiTrash2,
  FiUploadCloud
} from 'react-icons/fi';
import CloseButton from './CloseButton';
import { invitePersonnel } from '../utils/authService';
import { getAllUsers, logAdminActivity } from '../utils/usersService';
import './PersonnelImportModal.css';

const TEMPLATE_HEADERS = ['First Name', 'Last Name', 'Email', 'Role', 'Rank Designation', 'Contact Number'];
const BOM = String.fromCharCode(0xfeff);
const MAX_ROWS = 200;
const MAX_FILE_BYTES = 1024 * 1024;
const INVITE_TIMEOUT_MS = 30000;
const RANK_CODES = [
  'FDIR', 'DFDIR', 'SSUPT', 'SUPT', 'CINSP', 'SINSP', 'INSP',
  'SFO4', 'SFO3', 'SFO2', 'SFO1', 'FO3', 'FO2', 'FO1'
];
const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', personnel: 'Personnel' };

const namePattern = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const contactPattern = /^09\d{9}$/;
const gmailPattern = /^[^\s@]+@gmail\.com$/i;

const HEADER_ALIASES = {
  firstname: 'first_name',
  lastname: 'last_name',
  email: 'email',
  emailaddress: 'email',
  role: 'role',
  rank: 'rank',
  rankdesignation: 'rank',
  contactnumber: 'contact_number',
  contact: 'contact_number',
  mobile: 'contact_number',
  phone: 'contact_number'
};

const getDefaultPermissions = (role) => (
  role === 'super_admin' || role === 'admin'
    ? [
        'view_dashboard', 'view_reports', 'create_reports', 'view_attendance',
        'manage_users', 'view_analytics', 'view_charts', 'view_accounts', 'view_audit_logs'
      ]
    : []
);

// Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF, BOM.
const parseCsv = (input) => {
  const text = String(input || '').replace(new RegExp(`^${BOM}`), '');
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  record.push(field);
  records.push(record);

  return records.filter((cells) => cells.some((cell) => cell.trim() !== ''));
};

const normalizeRole = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return key === 'superadmin' ? 'super_admin' : key;
};

const normalizeRank = (value) => {
  const raw = String(value || '').trim();
  const head = raw.split(/\s+-\s+/)[0].trim().toUpperCase();
  return RANK_CODES.includes(head) ? head : raw;
};

// Spreadsheets drop the leading zero (9171234567) and some use +63 format.
const normalizeContact = (value) => {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return String(value || '').trim();
};

let rowCounter = 0;
const makeRow = (values) => {
  rowCounter += 1;
  return {
    id: `row-${rowCounter}`,
    first_name: '',
    last_name: '',
    email: '',
    role: '',
    rank: '',
    contact_number: '',
    status: 'pending',
    error: '',
    ambiguous: false,
    ...values
  };
};

const describeFailure = (message) => {
  const text = String(message || '').toLowerCase();
  if (
    (text.includes('already') && text.includes('registered'))
    || text.includes('duplicate key')
    || text.includes('23505')
  ) {
    return { error: 'An account with this email address already exists.', ambiguous: false };
  }
  if (text.includes('failed to fetch') || text.includes('network') || text.includes('timed out')) {
    return {
      error: 'The server did not respond in time. The account may or may not have been created; retrying will check first.',
      ambiguous: true
    };
  }
  return { error: message || 'The account could not be created.', ambiguous: false };
};

const withTimeout = (promise) => Promise.race([
  promise,
  new Promise((resolve) => {
    setTimeout(() => resolve({ data: null, error: 'Request timed out' }), INVITE_TIMEOUT_MS);
  })
]);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function PersonnelImportModal({
  existingEmails = [],
  isSuperAdmin = false,
  currentUser = null,
  onImported,
  onClose
}) {
  const [phase, setPhase] = useState('upload'); // upload | review | confirm | importing | results
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const barRef = useRef(null);
  const fileInputRef = useRef(null);
  const runningRef = useRef(false);

  const isImporting = phase === 'importing';

  // ---- Validation (derived, so edits re-validate live) ----
  const existingSet = useMemo(
    () => new Set(existingEmails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)),
    [existingEmails]
  );

  const activeRows = useMemo(() => rows.filter((row) => row.status !== 'created'), [rows]);

  const validation = useMemo(() => {
    const errorsById = {};
    const firstSeen = new Map();

    activeRows.forEach((row, index) => {
      const errors = {};
      const first = row.first_name.trim();
      const last = row.last_name.trim();
      const email = row.email.trim();
      const emailKey = email.toLowerCase();
      const role = normalizeRole(row.role);
      const rank = row.rank.trim();
      const contact = row.contact_number.trim();

      if (!first) errors.first_name = 'First name is required.';
      else if (!namePattern.test(first)) errors.first_name = 'First name can only contain letters.';
      if (!last) errors.last_name = 'Last name is required.';
      else if (!namePattern.test(last)) errors.last_name = 'Last name can only contain letters.';

      if (!email) errors.email = 'Email is required.';
      else if (!gmailPattern.test(email)) errors.email = 'Use a valid @gmail.com address.';
      else if (existingSet.has(emailKey)) errors.email = 'An account with this email already exists.';
      else if (firstSeen.has(emailKey)) errors.email = `Duplicate of row ${firstSeen.get(emailKey)} in this file.`;
      else firstSeen.set(emailKey, index + 1);

      if (!role) errors.role = 'Role is required.';
      else if (!ROLE_LABELS[role]) errors.role = 'Role must be Admin, Personnel or Super Admin.';
      else if (role === 'super_admin' && !isSuperAdmin) errors.role = 'Only Super Admins can assign Super Admin.';

      if (!rank) errors.rank = 'Rank designation is required.';
      else if (rank.length > 40) errors.rank = 'Rank is too long.';

      if (!contact) errors.contact_number = 'Contact number is required.';
      else if (!contactPattern.test(contact)) errors.contact_number = 'Must start with 09 and be 11 digits.';

      if (Object.keys(errors).length) errorsById[row.id] = errors;
    });

    return errorsById;
  }, [activeRows, existingSet, isSuperAdmin]);

  const rowNumbers = useMemo(
    () => Object.fromEntries(activeRows.map((row, index) => [row.id, index + 1])),
    [activeRows]
  );
  const errorCount = activeRows.filter((row) => validation[row.id]).length;
  const validRows = activeRows.filter((row) => !validation[row.id]);
  const createdRows = rows.filter((row) => row.status === 'created');
  const failedRows = rows.filter((row) => row.status === 'failed');
  const visibleRows = errorsOnly ? activeRows.filter((row) => validation[row.id]) : activeRows;

  // ---- Animations ----
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' });
      gsap.fromTo(
        dialogRef.current,
        { opacity: 0, y: 18, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power3.out' }
      );
    });
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion() || !stageRef.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        stageRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );
      if (phase === 'results') {
        gsap.from('.pim-result-item', {
          opacity: 0, y: 8, duration: 0.25, stagger: 0.015, ease: 'power2.out', delay: 0.1
        });
      }
    }, stageRef);
    return () => ctx.revert();
  }, [phase]);

  useEffect(() => {
    if (!barRef.current) return;
    const percent = progress.total ? (progress.done / progress.total) * 100 : 0;
    if (prefersReducedMotion()) {
      barRef.current.style.width = `${percent}%`;
    } else {
      gsap.to(barRef.current, { width: `${percent}%`, duration: 0.35, ease: 'power2.out', overwrite: true });
    }
  }, [progress, phase]);

  // ---- Close handling ----
  const handleClose = useCallback(() => {
    if (runningRef.current) return;
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  // Removing every pending row sends the user back to upload.
  useEffect(() => {
    if (phase === 'review' && rows.length === 0) setPhase('upload');
  }, [phase, rows.length]);

  // ---- Template & upload ----
  const downloadTemplate = () => {
    const blob = new Blob([`${BOM}${TEMPLATE_HEADERS.join(',')}\r\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ignis-safe-personnel-import-template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file) => {
    setUploadError('');
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setUploadError('Please upload a .csv file. Use the template if you need a starting point.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError('This file is larger than 1 MB. Split it into smaller files.');
      return;
    }

    let records;
    try {
      records = parseCsv(await file.text());
    } catch {
      setUploadError('The file could not be read. Make sure it is a valid CSV.');
      return;
    }

    if (records.length < 2) {
      setUploadError('No personnel rows were found. Fill in the template below the header row.');
      return;
    }

    const columns = records[0].map(
      (header) => HEADER_ALIASES[String(header).toLowerCase().replace(/[^a-z]/g, '')] || null
    );
    const required = ['first_name', 'last_name', 'email', 'role', 'rank', 'contact_number'];
    const missing = required.filter((key) => !columns.includes(key));
    if (missing.length) {
      const labels = missing.map((key) => TEMPLATE_HEADERS[required.indexOf(key)]);
      setUploadError(`Missing column${labels.length > 1 ? 's' : ''}: ${labels.join(', ')}. Please use the template headers.`);
      return;
    }

    const dataRecords = records.slice(1);
    if (dataRecords.length > MAX_ROWS) {
      setUploadError(`This file has ${dataRecords.length} rows. The limit is ${MAX_ROWS} per import.`);
      return;
    }

    const parsed = dataRecords.map((cells) => {
      const values = {};
      columns.forEach((key, index) => {
        if (key && values[key] === undefined) values[key] = String(cells[index] ?? '').trim();
      });
      return makeRow({
        first_name: values.first_name || '',
        last_name: values.last_name || '',
        email: values.email || '',
        role: normalizeRole(values.role),
        rank: normalizeRank(values.rank),
        contact_number: normalizeContact(values.contact_number)
      });
    });

    setFileName(file.name);
    setRows(parsed);
    setErrorsOnly(false);
    setPhase('review');
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  // ---- Row editing ----
  const updateRow = (id, field, value) => {
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeRow = (id) => {
    setRows((previous) => previous.filter((row) => row.id !== id));
  };

  // ---- Import ----
  const runImport = async (targets) => {
    if (runningRef.current || targets.length === 0) return;
    runningRef.current = true;
    setPhase('importing');
    setProgress({ done: 0, total: targets.length });

    const createdEmails = [];
    const failures = [];
    const patch = (id, changes) =>
      setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...changes } : row)));

    try {
      // Rows that timed out earlier may already exist; check before re-creating.
      let knownEmails = new Set();
      if (targets.some((row) => row.ambiguous)) {
        const { data } = await getAllUsers({ includePersonnelWorkspaceProfiles: true });
        knownEmails = new Set((data || []).map((account) => String(account.email || '').toLowerCase()));
      }

      for (let index = 0; index < targets.length; index += 1) {
        const row = targets[index];
        const email = row.email.trim();
        const role = normalizeRole(row.role);

        if (row.ambiguous && knownEmails.has(email.toLowerCase())) {
          patch(row.id, { status: 'created', error: '', ambiguous: false });
          createdEmails.push(email);
        } else {
          let result;
          try {
            result = await withTimeout(invitePersonnel(email, {
              first_name: row.first_name.trim(),
              last_name: row.last_name.trim(),
              role,
              rank: row.rank.trim(),
              contact_number: row.contact_number.trim(),
              permissions: getDefaultPermissions(role)
            }));
          } catch (error) {
            result = { data: null, error: error?.message || 'Unexpected error' };
          }

          if (result?.error) {
            const failure = describeFailure(result.error);
            patch(row.id, { status: 'failed', ...failure });
            failures.push({ email, reason: failure.error });
          } else {
            patch(row.id, { status: 'created', error: '', ambiguous: false });
            createdEmails.push(email);
          }
        }
        setProgress({ done: index + 1, total: targets.length });
      }
    } finally {
      logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Bulk Account Import',
        actionType: 'registration',
        status: createdEmails.length > 0 ? 'SUCCESS' : 'FAILED',
        details: `Bulk imported personnel from CSV: ${createdEmails.length} created, ${failures.length} failed out of ${targets.length}.`,
        metadata: {
          source: 'csv_import',
          file_name: fileName,
          attempted: targets.length,
          created_count: createdEmails.length,
          failed_count: failures.length,
          created_emails: createdEmails,
          failures
        }
      }).catch((error) => console.warn('Unable to write bulk import audit log:', error));

      runningRef.current = false;
      if (createdEmails.length > 0) onImported?.();
      setPhase('results');
    }
  };

  const startImport = () => runImport(validRows);
  const retryFailed = () => runImport(failedRows);

  const editFailed = () => {
    setRows(failedRows.map((row) => ({ ...row, status: 'pending' })));
    setErrorsOnly(false);
    setPhase('review');
  };

  // ---- Render helpers ----
  const renderInput = (row, field, props = {}) => {
    const error = validation[row.id]?.[field];
    return (
      <input
        className={`pim-input${error ? ' is-invalid' : ''}`}
        value={row[field]}
        onChange={(event) => updateRow(row.id, field, event.target.value)}
        aria-label={`${field.replace('_', ' ')}, row ${rowNumbers[row.id]}`}
        aria-invalid={Boolean(error)}
        {...props}
      />
    );
  };

  const superAdminCount = validRows.filter((row) => normalizeRole(row.role) === 'super_admin').length;
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const titles = {
    upload: 'Import Personnel',
    review: 'Review & Edit',
    confirm: 'Confirm Import',
    importing: 'Importing Accounts',
    results: 'Import Results'
  };
  const stepNumber = { upload: 1, review: 2, confirm: 3, importing: 4, results: 5 }[phase];

  const summary = (
    <div className="pim-summary" aria-live="polite">
      <div className="pim-stat"><strong>{activeRows.length}</strong><span>Accounts Ready</span></div>
      <div className={`pim-stat${errorCount ? ' is-error' : ''}`}><strong>{errorCount}</strong><span>Errors</span></div>
      <div className="pim-stat is-valid"><strong>{validRows.length}</strong><span>Valid</span></div>
    </div>
  );

  return (
    <div className="pim-overlay" ref={overlayRef} role="presentation">
      <div
        className="pim-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pim-title"
      >
        <header className="pim-header">
          <div>
            <p className="pim-step">Step {stepNumber} of 5</p>
            <h3 id="pim-title">{titles[phase]}</h3>
          </div>
          <CloseButton
            className="accounts-modal-close"
            onClick={handleClose}
            disabled={isImporting}
            label="Close import personnel"
          />
        </header>

        <div className="pim-stage" ref={stageRef}>
          {phase === 'upload' && (
            <>
              <div className="pim-guide">
                <button type="button" className="pim-btn pim-btn-ghost" onClick={downloadTemplate}>
                  <FiDownload aria-hidden="true" /> Download CSV Template
                </button>
                <ul className="pim-muted">
                  <li>Columns: {TEMPLATE_HEADERS.join(', ')}.</li>
                  <li>Role: {isSuperAdmin ? 'Admin, Personnel or Super Admin' : 'Admin or Personnel'}. Email must be a Gmail address.</li>
                  <li>Rank: {RANK_CODES.join(', ')} or a custom rank. Contact: 09XXXXXXXXX.</li>
                  <li>Up to {MAX_ROWS} rows. Each person receives an activation email to set their own password.</li>
                </ul>
              </div>

              <div
                className={`pim-drop${isDragging ? ' is-dragging' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <FiUploadCloud aria-hidden="true" className="pim-drop-icon" />
                <p className="pim-drop-title">Drop your completed CSV here</p>
                <button type="button" className="pim-btn pim-btn-primary" onClick={() => fileInputRef.current?.click()}>
                  Choose CSV file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(event) => {
                    handleFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>
              {uploadError && (
                <p className="pim-alert" role="alert"><FiAlertCircle aria-hidden="true" /> {uploadError}</p>
              )}
            </>
          )}

          {phase === 'review' && (
            <>
              {summary}
              <div className="pim-toolbar">
                <p className="pim-muted pim-file"><FiFileText aria-hidden="true" /> {fileName}</p>
                <label className="pim-toggle">
                  <input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} />
                  Show errors only
                </label>
              </div>

              <div className="pim-table-wrap">
                <table className="pim-table">
                  <thead>
                    <tr>
                      <th>#</th><th>First Name</th><th>Last Name</th><th>Email</th>
                      <th>Role</th><th>Rank</th><th>Contact</th><th><span className="pim-sr">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 && (
                      <tr><td colSpan={8} className="pim-empty">No rows with errors.</td></tr>
                    )}
                    {visibleRows.map((row) => {
                      const errors = validation[row.id];
                      const role = normalizeRole(row.role);
                      return (
                        <React.Fragment key={row.id}>
                          <tr className={errors ? 'has-error' : ''}>
                            <td className="pim-num">{rowNumbers[row.id]}</td>
                            <td>{renderInput(row, 'first_name')}</td>
                            <td>{renderInput(row, 'last_name')}</td>
                            <td>{renderInput(row, 'email', { type: 'email', inputMode: 'email' })}</td>
                            <td>
                              <select
                                className={`pim-input${errors?.role ? ' is-invalid' : ''}`}
                                value={row.role}
                                onChange={(event) => updateRow(row.id, 'role', event.target.value)}
                                aria-label={`role, row ${rowNumbers[row.id]}`}
                                aria-invalid={Boolean(errors?.role)}
                              >
                                <option value="">Select…</option>
                                {(isSuperAdmin || role === 'super_admin') && (
                                  <option value="super_admin">Super Admin</option>
                                )}
                                <option value="admin">Admin</option>
                                <option value="personnel">Personnel</option>
                                {/* Keep an unrecognised value visible so its error is explainable. */}
                                {row.role && !ROLE_LABELS[role] && <option value={row.role}>{row.role}</option>}
                              </select>
                            </td>
                            <td>{renderInput(row, 'rank', { list: 'pim-rank-options' })}</td>
                            <td>{renderInput(row, 'contact_number', { inputMode: 'numeric' })}</td>
                            <td>
                              <button
                                type="button"
                                className="pim-icon-btn"
                                onClick={() => removeRow(row.id)}
                                aria-label={`Remove row ${rowNumbers[row.id]}`}
                                title="Remove row"
                              >
                                <FiTrash2 aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                          {errors && (
                            <tr className="pim-error-row">
                              <td />
                              <td colSpan={7}>
                                <FiAlertCircle aria-hidden="true" /> {Object.values(errors).join(' ')}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="pim-rank-options">
                  {RANK_CODES.map((code) => <option key={code} value={code} />)}
                </datalist>
              </div>

              <footer className="pim-footer">
                <button type="button" className="pim-btn pim-btn-ghost" onClick={() => { setRows([]); setPhase('upload'); }}>
                  Upload different file
                </button>
                <button
                  type="button"
                  className="pim-btn pim-btn-primary"
                  disabled={validRows.length === 0}
                  onClick={() => setPhase('confirm')}
                >
                  Continue with {validRows.length} valid
                </button>
              </footer>
            </>
          )}

          {phase === 'confirm' && (
            <>
              {summary}
              <ul className="pim-confirm-list">
                <li>{validRows.length} account{validRows.length === 1 ? '' : 's'} will be created, and each person will receive an activation email to set their own password.</li>
                {errorCount > 0 && <li>{errorCount} row{errorCount === 1 ? '' : 's'} with errors will be skipped.</li>}
                {superAdminCount > 0 && <li>{superAdminCount} will be created as Super Admin.</li>}
                <li>This action is recorded in the Audit Logs.</li>
              </ul>
              <footer className="pim-footer">
                <button type="button" className="pim-btn pim-btn-ghost" onClick={() => setPhase('review')}>Back to review</button>
                <button type="button" className="pim-btn pim-btn-primary" onClick={startImport}>
                  Confirm &amp; import {validRows.length}
                </button>
              </footer>
            </>
          )}

          {phase === 'importing' && (
            <div className="pim-progress" aria-live="polite">
              <p className="pim-progress-label">Creating accounts... {progress.done}/{progress.total}</p>
              <div
                className="pim-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Import progress"
              >
                <div className="pim-bar-fill" ref={barRef} />
              </div>
              <p className="pim-muted">Keep this window open until the import finishes.</p>
            </div>
          )}

          {phase === 'results' && (
            <>
              <div className="pim-summary" aria-live="polite">
                <div className="pim-stat is-valid"><strong>{createdRows.length}</strong><span>Created</span></div>
                <div className={`pim-stat${failedRows.length ? ' is-error' : ''}`}><strong>{failedRows.length}</strong><span>Failed</span></div>
              </div>

              <div className="pim-results">
                {failedRows.length > 0 && (
                  <section>
                    <h4>Failed</h4>
                    <ul>
                      {failedRows.map((row) => (
                        <li key={row.id} className="pim-result-item is-failed">
                          <FiAlertCircle aria-hidden="true" />
                          <div>
                            <strong>{row.first_name} {row.last_name}</strong> <span className="pim-muted">{row.email}</span>
                            <p>{row.error}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {createdRows.length > 0 && (
                  <section>
                    <h4>Created</h4>
                    <ul>
                      {createdRows.map((row) => (
                        <li key={row.id} className="pim-result-item is-ok">
                          <FiCheckCircle aria-hidden="true" />
                          <div>
                            <strong>{row.first_name} {row.last_name}</strong> <span className="pim-muted">{row.email}</span>
                            <p>Activation email sent.</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              <footer className="pim-footer">
                {failedRows.length > 0 && (
                  <>
                    <button type="button" className="pim-btn pim-btn-ghost" onClick={editFailed}>Edit failed rows</button>
                    <button type="button" className="pim-btn pim-btn-ghost" onClick={retryFailed}>
                      <FiRefreshCw aria-hidden="true" /> Retry {failedRows.length} failed
                    </button>
                  </>
                )}
                <button type="button" className="pim-btn pim-btn-primary" onClick={handleClose}>Done</button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
