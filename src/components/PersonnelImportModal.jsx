import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import {
  FiAlertCircle,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiMinus,
  FiRefreshCw,
  FiTrash2,
  FiUploadCloud
} from 'react-icons/fi';
import CloseButton from './CloseButton';
import {
  cancelImportJob,
  dismissImportJob,
  isImportJobActive,
  setImportModalOpen,
  startImportJob,
  useImportJob
} from '../utils/personnelImportJobs';
import { ORG_RANK_OPTIONS } from '../utils/orgChartFields';
import {
  sanitizeContactInput,
  validateContactNumber,
  validateEmailFormat,
  validateName
} from '../utils/personnelValidation';
import './PersonnelImportModal.css';

const TEMPLATE_HEADERS = ['First Name', 'Last Name', 'Email', 'Role', 'Rank Designation', 'Contact Number'];
const BOM = String.fromCharCode(0xfeff);
const MAX_ROWS = 200;
const MAX_FILE_BYTES = 1024 * 1024;
// Every BFP rank, highest first. Same list the Personnel pages use.
const RANK_OPTIONS = ORG_RANK_OPTIONS.map((option) => ({ code: option.value, label: option.label }));
const RANK_CODES = RANK_OPTIONS.map((option) => option.code);
const RANK_ORDER = new Map(RANK_CODES.map((code, index) => [code, index]));
const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', personnel: 'Personnel' };

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

// Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF, BOM.
const parseCsv = (input) => {
  const text = String(input || '').replace(new RegExp(`^${BOM}`), '');
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let startLine = 1;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '\n') line += 1;
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
      record.line = startLine;
      records.push(record);
      record = [];
      field = '';
      line += 1;
      startLine = line;
    } else {
      field += char;
    }
  }
  record.push(field);
  record.line = startLine;
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
  if (RANK_ORDER.has(head)) return head;
  // Also accept the spelled-out name, e.g. "Fire Officer I".
  const byName = RANK_OPTIONS.find((option) => option.label.toLowerCase().endsWith(` - ${raw.toLowerCase()}`));
  return byName ? byName.code : raw;
};

const rowTipText = (number, row) => {
  const name = `${row.first_name} ${row.last_name}`.trim().replace(/\s+/g, ' ');
  return `CSV Row ${number}${name ? ` — ${name}` : ''}.`;
};

const RANK_GROUP_TITLES = { unknown: 'Unrecognized rank', none: 'No rank selected' };

// Rows sharing a rank sit together, highest rank first; each group keeps file order.
const groupRowsByRank = (list) => {
  const buckets = new Map();
  list.forEach((row) => {
    const rank = row.rank.trim();
    const key = RANK_ORDER.has(rank) ? rank : rank ? 'unknown' : 'none';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });
  return [...RANK_CODES, 'unknown', 'none']
    .filter((key) => buckets.has(key))
    .map((key) => ({
      key,
      title: RANK_GROUP_TITLES[key] || RANK_OPTIONS[RANK_ORDER.get(key)].label,
      rows: buckets.get(key)
    }));
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
    ...values
  };
};

// What the server job receives for each confirmed row.
const toJobRow = (row) => ({
  client_id: row.id,
  email: row.email.trim(),
  first_name: row.first_name.trim(),
  last_name: row.last_name.trim(),
  role: normalizeRole(row.role),
  rank: row.rank.trim(),
  contact_number: row.contact_number.trim()
});

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Hover, keyboard-focus and tap tooltip. Portaled so the scrolling table never clips it.
function PimTip({ text, tag: Tag = 'span', className, children, ...rest }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const pointerRef = useRef('mouse');
  const tipId = useId();
  const open = Boolean(pos);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const flip = rect.top < 64;
    setPos({
      left: Math.min(Math.max(rect.left + rect.width / 2, 138), Math.max(138, window.innerWidth - 138)),
      ...(flip ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 })
    });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) hide();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  // Mouse and tap focus should not pop the tip on their own; keyboard focus should.
  const handleFocus = (event) => {
    let keyboard = true;
    try {
      keyboard = event.target.matches(':focus-visible');
    } catch {
      keyboard = true;
    }
    if (keyboard) show();
  };

  return (
    <>
      {React.createElement(Tag, {
        ref,
        className,
        tabIndex: 0,
        'aria-describedby': open ? tipId : undefined,
        onPointerDown: (event) => { pointerRef.current = event.pointerType; },
        onPointerEnter: (event) => { if (event.pointerType === 'mouse') show(); },
        onPointerLeave: (event) => { if (event.pointerType === 'mouse') hide(); },
        onFocus: handleFocus,
        onBlur: hide,
        onClick: () => {
          if (pointerRef.current === 'mouse' || !open) show();
          else hide();
        },
        onKeyDown: (event) => {
          // Closing the tooltip must not also close the dialog.
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            hide();
          }
        },
        ...rest
      }, children)}
      {open && createPortal(
        <div id={tipId} role="tooltip" className="pim-tip" style={pos}>{text}</div>,
        document.body
      )}
    </>
  );
}

// Searchable rank picker. The list is portaled to <body> so the scrolling table never clips it.
function RankCombobox({ value, onChange, error, errorId, ariaLabel, rowId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null); // null = show the saved value
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const skipBlurRef = useRef(false);
  const listId = useId();

  const options = useMemo(() => {
    const text = (query || '').trim().toLowerCase();
    return text ? RANK_OPTIONS.filter((option) => option.label.toLowerCase().includes(text)) : RANK_OPTIONS;
  }, [query]);

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 280);
    const below = window.innerHeight - rect.bottom;
    const flip = below < 220 && rect.top > below;
    setPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(120, Math.min(260, (flip ? rect.top : below) - 12)),
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 })
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onMove = (event) => {
      if (!listRef.current?.contains(event.target)) place();
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active, options]);

  const openList = () => {
    skipBlurRef.current = false;
    if (open) return;
    setActive(Math.max(0, RANK_OPTIONS.findIndex((option) => option.code === value)));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const choose = (code) => {
    skipBlurRef.current = true;
    onChange(code, true);
    close();
  };

  // Leaving the field keeps an exact typed code or name, clears an emptied field, else reverts.
  const handleBlur = () => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      close();
      return;
    }
    if (query !== null) {
      const text = query.trim().toLowerCase();
      if (!text) {
        if (value) onChange('', false);
      } else {
        const exact = RANK_OPTIONS.find(
          (option) => option.code.toLowerCase() === text || option.label.toLowerCase() === text
        );
        if (exact && exact.code !== value) onChange(exact.code, false);
      }
    }
    close();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (options.length ? (current + step + options.length) % options.length : 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (options[active]) choose(options[active].code);
    } else if (event.key === 'Escape' && open) {
      // Closing the list must not also close the dialog.
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="pim-combo">
      <input
        ref={inputRef}
        className={`pim-input pim-combo-input${error ? ' is-invalid' : ''}`}
        data-rank-input={rowId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${options[active].code}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        placeholder="Select rank…"
        value={query ?? value}
        onClick={openList}
        onChange={(event) => {
          skipBlurRef.current = false;
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <FiChevronDown className="pim-combo-chevron" aria-hidden="true" />
      {open && pos && createPortal(
        <ul
          id={listId}
          ref={listRef}
          className="pim-combo-list"
          role="listbox"
          aria-label="BFP rank designations"
          style={pos}
          onMouseDown={(event) => event.preventDefault()}
        >
          {options.length === 0 && <li className="pim-combo-empty" role="presentation">No matching rank</li>}
          {options.map((option, index) => (
            <li
              key={option.code}
              id={`${listId}-${option.code}`}
              role="option"
              aria-selected={option.code === value}
              className={`pim-combo-option${index === active ? ' is-active' : ''}${option.code === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option.code)}
            >
              <strong>{option.code}</strong>
              <span>{option.label.slice(option.code.length + 3)}</span>
              {option.code === value && <FiCheck aria-hidden="true" />}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}

// Confirmation before a row leaves the import preview. Only the preview changes; no account is touched.
function RemoveConfirmDialog({ details, onCancel, onConfirm }) {
  const overlayRef = useRef(null);
  const cardRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  useLayoutEffect(() => {
    cancelRef.current?.focus();
    if (prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'power1.out' });
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 12, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out' }
      );
      gsap.from('.pim-rm-row', { opacity: 0, y: 6, duration: 0.25, stagger: 0.04, delay: 0.12, ease: 'power2.out' });
    }, overlayRef);
    return () => ctx.revert();
  }, []);

  // Keep Tab inside the two buttons while the dialog is open.
  const handleKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const fields = [
    ['Full Name', details.name],
    ['Email', details.email],
    ['Role', details.role],
    ['Rank', details.rank],
    ['Contact Number', details.contact]
  ];

  return createPortal(
    <div
      className="pim-rm-overlay"
      ref={overlayRef}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div
        className="pim-rm-card"
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={handleKeyDown}
      >
        <div className="pim-rm-head">
          <span className="pim-rm-icon" aria-hidden="true"><FiTrash2 /></span>
          <div>
            <h4 id={titleId}>Remove this account from the import?</h4>
            <p id={descId}>Only this import preview changes. Existing accounts are not affected.</p>
          </div>
        </div>
        <dl className="pim-rm-details">
          {fields.map(([label, value]) => (
            <div className="pim-rm-row" key={label}>
              <dt>{label}</dt>
              <dd className={value ? '' : 'is-empty'}>{value || 'Not provided'}</dd>
            </div>
          ))}
        </dl>
        <div className="pim-rm-actions">
          <button type="button" ref={cancelRef} className="pim-btn pim-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" ref={confirmRef} className="pim-btn pim-btn-danger" onClick={onConfirm}>Remove</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function PersonnelImportModal({
  existingEmails = [],
  isSuperAdmin = false,
  onClose
}) {
  const [step, setStep] = useState('upload'); // upload | review | confirm; later steps come from the server job
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const barRef = useRef(null);
  const fileInputRef = useRef(null);
  const startingRef = useRef(false);
  const removeTriggerRef = useRef(null);

  // The import runs on the server; steps 4 and 5 simply reflect its real progress.
  const { job, sourceRows, connectionLost } = useImportJob();
  const isImporting = isImportJobActive(job);
  const phase = job ? (isImporting ? 'importing' : 'results') : step;
  const isCompact = phase === 'confirm' || phase === 'importing' || phase === 'results';

  const jobItems = job?.items || [];
  const createdItems = jobItems.filter((item) => item.state === 'created');
  const failedItems = jobItems.filter((item) => item.state === 'failed');
  const unfinishedItems = jobItems.filter((item) => item.state !== 'created' && item.state !== 'failed');
  const retryItems = jobItems.filter((item) => item.state !== 'created');
  const retryRows = retryItems.map((item) => sourceRows[item.id]).filter(Boolean);
  const canRetry = retryItems.length > 0 && retryRows.length === retryItems.length;
  const processed = job?.processed ?? 0;
  const jobTotal = job?.total ?? 0;
  const percent = jobTotal ? Math.floor((processed / jobTotal) * 100) : 0;

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

      const firstError = validateName(first, 'First name');
      if (firstError) errors.first_name = firstError;
      const lastError = validateName(last, 'Last name');
      if (lastError) errors.last_name = lastError;

      const emailError = validateEmailFormat(email);
      if (emailError) errors.email = emailError;
      else if (existingSet.has(emailKey)) errors.email = 'Email already has an account.';
      else if (firstSeen.has(emailKey)) errors.email = `Duplicate of CSV row ${firstSeen.get(emailKey)}.`;
      else firstSeen.set(emailKey, row.csv_row ?? index + 1);

      if (!role) errors.role = 'Role is required.';
      else if (!ROLE_LABELS[role]) errors.role = 'Choose Admin or Personnel.';
      else if (role === 'super_admin' && !isSuperAdmin) errors.role = 'Super Admin only.';

      if (!rank) errors.rank = 'Rank is required.';
      else if (!RANK_ORDER.has(rank)) errors.rank = 'Pick a rank from the list.';

      const contactError = validateContactNumber(contact);
      if (contactError) errors.contact_number = contactError;

      if (Object.keys(errors).length) errorsById[row.id] = errors;
    });

    return errorsById;
  }, [activeRows, existingSet, isSuperAdmin]);

  const rowNumbers = useMemo(
    () => Object.fromEntries(activeRows.map((row, index) => [row.id, row.csv_row ?? index + 1])),
    [activeRows]
  );
  const errorCount = activeRows.filter((row) => validation[row.id]).length;
  const validRows = activeRows.filter((row) => !validation[row.id]);
  const visibleRows = errorsOnly ? activeRows.filter((row) => validation[row.id]) : activeRows;
  // Recomputed on every edit, so changing a rank moves the row to its new group.
  const rankGroups = useMemo(() => groupRowsByRank(visibleRows), [visibleRows]);

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
      if (phase === 'confirm' || phase === 'importing') {
        gsap.from('.pim-stage .pim-stat', {
          opacity: 0, y: 8, duration: 0.3, stagger: 0.06, ease: 'power2.out', delay: 0.08
        });
      }
    }, stageRef);
    return () => ctx.revert();
  }, [phase]);

  // The dialog settles into its new size when moving between the wide and compact steps.
  const wasCompactRef = useRef(isCompact);
  useLayoutEffect(() => {
    if (wasCompactRef.current === isCompact) return;
    wasCompactRef.current = isCompact;
    if (prefersReducedMotion() || !dialogRef.current) return;
    gsap.fromTo(
      dialogRef.current,
      { scale: 0.96, opacity: 0.6 },
      { scale: 1, opacity: 1, duration: 0.35, ease: 'power3.out', clearProps: 'transform,opacity' }
    );
  }, [isCompact]);

  // The bar only ever moves to the percentage the server reports.
  useEffect(() => {
    if (!barRef.current) return;
    if (prefersReducedMotion()) {
      barRef.current.style.width = `${percent}%`;
    } else {
      gsap.to(barRef.current, { width: `${percent}%`, duration: 0.5, ease: 'power2.out', overwrite: true });
    }
  }, [percent, phase]);

  // Tell the floating widget the full dialog is showing, so it stays out of the way.
  useEffect(() => {
    setImportModalOpen(true);
    return () => setImportModalOpen(false);
  }, []);

  // ---- Close & minimize ----
  const handleClose = useCallback(() => {
    if (isImporting) return;
    onClose?.();
  }, [isImporting, onClose]);

  // Minimizing only hides this dialog; the server keeps processing.
  const handleMinimize = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || prefersReducedMotion()) {
      onClose?.();
      return;
    }
    gsap.to(dialog, {
      scale: 0.3,
      opacity: 0,
      x: window.innerWidth * 0.3,
      y: window.innerHeight * 0.35,
      duration: 0.32,
      ease: 'power2.in',
      onComplete: () => onClose?.()
    });
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event) => {
      // The rank list handles its own Escape (preventDefault) so it closes alone.
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // The removal prompt sits on top, so Escape dismisses it first.
      if (pendingRemoveId) setPendingRemoveId(null);
      else if (cancelPrompt) setCancelPrompt(false);
      else if (isImporting) handleMinimize();
      else handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleClose, handleMinimize, isImporting, cancelPrompt, pendingRemoveId]);

  // Removing every pending row sends the user back to upload.
  useEffect(() => {
    if (phase === 'review' && rows.length === 0) setStep('upload');
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

    const parsed = dataRecords.map((cells, index) => {
      const values = {};
      columns.forEach((key, index) => {
        if (key && values[key] === undefined) values[key] = String(cells[index] ?? '').trim();
      });
      return makeRow({
        csv_row: cells.line ?? index + 2,
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
    setStep('review');
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

  const pendingRow = pendingRemoveId ? rows.find((row) => row.id === pendingRemoveId) : null;

  const requestRemove = (id, event) => {
    removeTriggerRef.current = event.currentTarget;
    setPendingRemoveId(id);
  };

  const cancelRemove = () => {
    const trigger = removeTriggerRef.current;
    removeTriggerRef.current = null;
    setPendingRemoveId(null);
    requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  };

  const confirmRemove = () => {
    const id = pendingRemoveId;
    removeTriggerRef.current = null;
    setPendingRemoveId(null);
    if (!id) return;
    const rowEl = stageRef.current?.querySelector(`[data-row-id="${id}"]`);
    if (rowEl && !prefersReducedMotion()) {
      gsap.to(rowEl, { opacity: 0, x: 16, duration: 0.22, ease: 'power2.in', onComplete: () => removeRow(id) });
    } else {
      removeRow(id);
    }
  };

  const removeDetails = pendingRow ? (() => {
    const role = normalizeRole(pendingRow.role);
    const rankCode = pendingRow.rank.trim();
    const rankOption = RANK_OPTIONS.find((option) => option.code === rankCode);
    return {
      name: `${pendingRow.first_name} ${pendingRow.last_name}`.trim().replace(/\s+/g, ' '),
      email: pendingRow.email.trim(),
      role: ROLE_LABELS[role] || pendingRow.role.trim(),
      rank: rankOption ? rankOption.label : rankCode,
      contact: pendingRow.contact_number.trim()
    };
  })() : null;

  // A row jumps to its new rank group; hand focus back to its rank field afterwards.
  const focusRankRowRef = useRef(null);
  const updateRank = (id, code, keepFocus) => {
    if (keepFocus) focusRankRowRef.current = id;
    updateRow(id, 'rank', code);
  };

  useEffect(() => {
    const id = focusRankRowRef.current;
    if (!id) return;
    focusRankRowRef.current = null;
    stageRef.current?.querySelector(`[data-rank-input="${id}"]`)?.focus();
  }, [rows]);

  // ---- Import (runs on the server) ----
  const launchJob = async (sourceList) => {
    if (startingRef.current || sourceList.length === 0) return;
    startingRef.current = true;
    setStarting(true);
    setStartError('');
    try {
      await startImportJob({ rows: sourceList.map(toJobRow), sourceRows: sourceList, fileName });
    } catch (error) {
      setStartError(error?.message || 'The import could not be started. Nothing was created.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  const confirmImport = () => launchJob(validRows);
  const retryUnfinished = () => launchJob(retryRows);

  const editUnfinished = () => {
    setRows(retryRows.map((row) => ({ ...row, status: 'pending', error: '' })));
    setErrorsOnly(false);
    dismissImportJob();
    setStep('review');
  };

  const finishAndClose = () => {
    dismissImportJob();
    onClose?.();
  };

  const confirmCancelImport = async () => {
    setCancelBusy(true);
    try {
      await cancelImportJob();
      setCancelPrompt(false);
    } catch (error) {
      setStartError(error?.message || 'The cancellation request failed. Please try again.');
    } finally {
      setCancelBusy(false);
    }
  };

  // ---- Render helpers ----
  const renderError = (row, field) => {
    const error = validation[row.id]?.[field];
    return error ? (
      <span id={`pim-err-${row.id}-${field}`} className="pim-field-error" role="alert">{error}</span>
    ) : null;
  };

  const renderInput = (row, field, props = {}) => {
    const error = validation[row.id]?.[field];
    return (
      <>
        <div className="pim-field">
          <input
            className={`pim-input${error ? ' is-invalid' : ''}`}
            value={row[field]}
            onChange={(event) => updateRow(row.id, field, event.target.value)}
            aria-label={`${field.replace('_', ' ')}, row ${rowNumbers[row.id]}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `pim-err-${row.id}-${field}` : undefined}
            {...props}
          />
          <FiEdit2 className="pim-field-pencil" aria-hidden="true" />
        </div>
        {renderError(row, field)}
      </>
    );
  };

  const superAdminCount = validRows.filter((row) => normalizeRole(row.role) === 'super_admin').length;

  const titles = {
    upload: 'Import Personnel',
    review: 'Review & Edit',
    confirm: 'Confirm Import',
    importing: 'Creating Accounts',
    results: job?.status === 'cancelled' ? 'Import Cancelled' : job?.status === 'lost' ? 'Import Status Unavailable' : 'Import Complete'
  };
  const stepNumber = { upload: 1, review: 2, confirm: 3, importing: 4, results: 5 }[phase];

  const summary = (
    <div className="pim-summary" aria-live="polite">
      <PimTip tag="div" className="pim-stat is-tip" text="Accounts prepared for import.">
        <strong>{activeRows.length}</strong><span>Accounts Ready</span>
      </PimTip>
      <PimTip
        tag="div"
        className={`pim-stat is-tip${errorCount ? ' is-error' : ''}`}
        text="Records requiring correction before import."
      >
        <strong>{errorCount}</strong><span>Errors</span>
      </PimTip>
      <PimTip tag="div" className="pim-stat is-tip is-valid" text="Records that passed all required checks.">
        <strong>{validRows.length}</strong><span>Valid</span>
      </PimTip>
    </div>
  );

  return (
    <div className="pim-overlay" ref={overlayRef} role="presentation">
      <div
        className={`pim-modal${isCompact ? ' is-compact' : ''}${phase === 'results' ? ' is-wide' : ''}`}
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

        <div className={`pim-stage is-${phase}`} ref={stageRef}>
          {phase === 'upload' && (
            <>
              <div className="pim-guide">
                <button type="button" className="pim-btn pim-btn-ghost" onClick={downloadTemplate}>
                  <FiDownload aria-hidden="true" /> Download CSV Template
                </button>
                <ul className="pim-muted">
                  <li>Columns: {TEMPLATE_HEADERS.join(', ')}.</li>
                  <li>Role: {isSuperAdmin ? 'Admin, Personnel or Super Admin' : 'Admin or Personnel'}. Email must be a Gmail address.</li>
                  <li>Rank: {RANK_CODES.join(', ')}. Contact: 11 digits starting with 09 (09XXXXXXXXX).</li>
                  <li>Names: letters, spaces, hyphens and apostrophes only.</li>
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

              <p className="pim-hint">Click any field to edit its details.</p>
              <div className="pim-table-wrap">
                <table className="pim-table">
                  <colgroup>
                    <col className="pim-col-num" />
                    <col className="pim-col-first" />
                    <col className="pim-col-last" />
                    <col className="pim-col-email" />
                    <col className="pim-col-role" />
                    <col className="pim-col-rank" />
                    <col className="pim-col-contact" />
                    <col className="pim-col-actions" />
                  </colgroup>
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
                    {rankGroups.map((group) => (
                      <React.Fragment key={group.key}>
                        <tr className="pim-group-row">
                          <th colSpan={8} scope="colgroup">
                            <span className="pim-group-title">{group.title}</span>
                            <span className="pim-group-count">{group.rows.length} personnel</span>
                          </th>
                        </tr>
                        {group.rows.map((row) => {
                          const errors = validation[row.id];
                          const role = normalizeRole(row.role);
                          return (
                            <tr key={row.id} data-row-id={row.id} className={errors ? 'has-error' : ''}>
                              <td className="pim-num">
                                <PimTip
                                  tag="button"
                                  type="button"
                                  className="pim-num-btn"
                                  aria-label={`CSV row ${rowNumbers[row.id]}`}
                                  text={rowTipText(rowNumbers[row.id], row)}
                                >
                                  {rowNumbers[row.id]}
                                </PimTip>
                              </td>
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
                                  aria-describedby={errors?.role ? `pim-err-${row.id}-role` : undefined}
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
                                {renderError(row, 'role')}
                              </td>
                              <td>
                                <RankCombobox
                                  value={row.rank}
                                  onChange={(code, keepFocus) => updateRank(row.id, code, keepFocus)}
                                  error={errors?.rank}
                                  errorId={`pim-err-${row.id}-rank`}
                                  ariaLabel={`rank, row ${rowNumbers[row.id]}`}
                                  rowId={row.id}
                                />
                                {renderError(row, 'rank')}
                              </td>
                              <td>
                                {renderInput(row, 'contact_number', {
                                  inputMode: 'numeric',
                                  maxLength: 11,
                                  placeholder: '09XXXXXXXXX',
                                  onChange: (event) => updateRow(row.id, 'contact_number', sanitizeContactInput(event.target.value))
                                })}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="pim-icon-btn"
                                  onClick={(event) => requestRemove(row.id, event)}
                                  aria-label={`Remove row ${rowNumbers[row.id]} from import`}
                                >
                                  <FiTrash2 aria-hidden="true" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="pim-footer">
                <button type="button" className="pim-btn pim-btn-ghost" onClick={() => { setRows([]); setStep('upload'); }}>
                  Upload different file
                </button>
                <button
                  type="button"
                  className="pim-btn pim-btn-primary"
                  disabled={validRows.length === 0}
                  onClick={() => setStep('confirm')}
                >
                  Continue with {validRows.length} valid
                </button>
              </footer>
            </>
          )}

          {phase === 'confirm' && (
            <>
              <div className="pim-confirm">
                <h4 className="pim-confirm-question">
                  Are you sure you want to create {validRows.length === 1 ? 'this 1 account' : `these ${validRows.length} accounts`}?
                </h4>
                <p className="pim-muted">
                  Each person receives an activation email to set their own password. This action is recorded in the Audit Logs.
                </p>
              </div>
              <div className="pim-summary">
                <div className="pim-stat"><strong>{activeRows.length}</strong><span>Total Accounts</span></div>
                <div className="pim-stat is-valid"><strong>{validRows.length}</strong><span>Valid Records</span></div>
                <div className={`pim-stat${errorCount ? ' is-error' : ''}`}><strong>{errorCount}</strong><span>Errors</span></div>
              </div>
              {(errorCount > 0 || superAdminCount > 0) && (
                <ul className="pim-confirm-list">
                  {errorCount > 0 && <li>{plural(errorCount, 'row')} with errors will be skipped.</li>}
                  {superAdminCount > 0 && <li>{superAdminCount} will be created as Super Admin.</li>}
                </ul>
              )}
              {startError && <p className="pim-alert" role="alert"><FiAlertCircle aria-hidden="true" /> {startError}</p>}
              <footer className="pim-footer">
                <button type="button" className="pim-btn pim-btn-ghost" onClick={handleClose} disabled={starting}>Cancel</button>
                <button type="button" className="pim-btn pim-btn-primary" onClick={confirmImport} disabled={starting || validRows.length === 0}>
                  {starting ? 'Starting…' : 'Confirm & Create'}
                </button>
              </footer>
            </>
          )}

          {phase === 'importing' && (
            <div className="pim-progress">
              <div className="pim-progress-head">
                <span className="pim-progress-percent">{percent}%</span>
                <span className="pim-progress-count" role="status">{processed} / {jobTotal} accounts</span>
              </div>
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
              <div className="pim-summary">
                <div className="pim-stat is-valid"><strong>{job.created}</strong><span>Created</span></div>
                <div className={`pim-stat${job.failed ? ' is-error' : ''}`}><strong>{job.failed}</strong><span>Failed</span></div>
                <div className="pim-stat"><strong>{Math.max(jobTotal - processed, 0)}</strong><span>Remaining</span></div>
              </div>
              {job.status === 'cancelling' && (
                <p className="pim-note">Stopping… records already in progress will finish, the rest will not be created.</p>
              )}
              {job.rate_limited && job.status !== 'cancelling' && (
                <p className="pim-note">The email rate limit was reached. Remaining records are paused and can be retried later.</p>
              )}
              {connectionLost && (
                <p className="pim-note">Reconnecting to the server… The import keeps running.</p>
              )}
              {startError && <p className="pim-alert" role="alert"><FiAlertCircle aria-hidden="true" /> {startError}</p>}
              {cancelPrompt ? (
                <div className="pim-cancel-box" role="alertdialog" aria-labelledby="pim-cancel-title" aria-describedby="pim-cancel-desc">
                  <h4 id="pim-cancel-title">Cancel this import?</h4>
                  <p id="pim-cancel-desc">
                    {plural(job.created, 'account')} already created will be kept. Records not yet started will not be created.
                  </p>
                  <div className="pim-footer">
                    <button type="button" className="pim-btn pim-btn-ghost" autoFocus onClick={() => setCancelPrompt(false)} disabled={cancelBusy}>
                      Keep importing
                    </button>
                    <button type="button" className="pim-btn pim-btn-danger" onClick={confirmCancelImport} disabled={cancelBusy}>
                      {cancelBusy ? 'Cancelling…' : 'Yes, cancel import'}
                    </button>
                  </div>
                </div>
              ) : (
                <footer className="pim-footer">
                  <button type="button" className="pim-btn pim-btn-ghost" onClick={handleMinimize}>
                    <FiMinus aria-hidden="true" /> Minimize
                  </button>
                  <button
                    type="button"
                    className="pim-btn pim-btn-danger-ghost"
                    onClick={() => { setStartError(''); setCancelPrompt(true); }}
                    disabled={job.status === 'cancelling'}
                  >
                    Cancel Import
                  </button>
                </footer>
              )}
            </div>
          )}

          {phase === 'results' && (
            <>
              <p className={`pim-banner${job.status === 'lost' || failedItems.length ? ' is-warn' : ''}`} role="status">
                {job.status === 'cancelled' && `Import cancelled. ${plural(createdItems.length, 'account')} created and kept; ${unfinishedItems.length} not created.`}
                {job.status === 'lost' && 'Live progress for this import is no longer available. Accounts already created are kept; check the Personnel list for the final result.'}
                {job.status === 'completed' && (failedItems.length
                  ? `${plural(createdItems.length, 'account')} created, ${failedItems.length} failed.`
                  : `All ${plural(createdItems.length, 'account')} created. Activation emails were sent.`)}
              </p>
              <div className="pim-summary">
                <div className="pim-stat is-valid"><strong>{createdItems.length}</strong><span>Created</span></div>
                <div className={`pim-stat${failedItems.length ? ' is-error' : ''}`}><strong>{failedItems.length}</strong><span>Failed</span></div>
                {unfinishedItems.length > 0 && (
                  <div className="pim-stat"><strong>{unfinishedItems.length}</strong><span>Not created</span></div>
                )}
              </div>

              <div className="pim-results">
                {failedItems.length > 0 && (
                  <section>
                    <h4>Failed</h4>
                    <ul>
                      {failedItems.map((item) => (
                        <li key={item.id} className="pim-result-item is-failed">
                          <FiAlertCircle aria-hidden="true" />
                          <div>
                            <strong>{item.first_name} {item.last_name}</strong> <span className="pim-muted">{item.email}</span>
                            <p>{item.error}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {unfinishedItems.length > 0 && (
                  <section>
                    <h4>Not created</h4>
                    <ul>
                      {unfinishedItems.map((item) => (
                        <li key={item.id} className="pim-result-item is-skipped">
                          <FiMinus aria-hidden="true" />
                          <div>
                            <strong>{item.first_name} {item.last_name}</strong> <span className="pim-muted">{item.email}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {createdItems.length > 0 && (
                  <section>
                    <h4>Created</h4>
                    <ul>
                      {createdItems.map((item) => (
                        <li key={item.id} className="pim-result-item is-ok">
                          <FiCheckCircle aria-hidden="true" />
                          <div>
                            <strong>{item.first_name} {item.last_name}</strong> <span className="pim-muted">{item.email}</span>
                            <p>Activation email sent.</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {startError && <p className="pim-alert" role="alert"><FiAlertCircle aria-hidden="true" /> {startError}</p>}
              <footer className="pim-footer">
                {canRetry && (
                  <>
                    <button type="button" className="pim-btn pim-btn-ghost" onClick={editUnfinished} disabled={starting}>Edit these rows</button>
                    <button type="button" className="pim-btn pim-btn-ghost" onClick={retryUnfinished} disabled={starting}>
                      <FiRefreshCw aria-hidden="true" /> {starting ? 'Starting…' : `Retry ${retryItems.length} not created`}
                    </button>
                  </>
                )}
                <button type="button" className="pim-btn pim-btn-primary" onClick={finishAndClose}>Done</button>
              </footer>
            </>
          )}
        </div>
      </div>
      {removeDetails && (
        <RemoveConfirmDialog details={removeDetails} onCancel={cancelRemove} onConfirm={confirmRemove} />
      )}
    </div>
  );
}
