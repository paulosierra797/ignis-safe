import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiDownload, FiUpload } from 'react-icons/fi';
import CloseButton from './CloseButton';
import { IMPORT_COLUMNS, IMPORT_RANKS, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, normalizeImportRow, parsePersonnelCsv, personnelCsvTemplate, validateImportRows } from '../utils/personnelImport';
import { createPersonnelImport, validatePersonnelImport } from '../utils/personnelImportService';
import './PersonnelImportModal.css';

// Each dialog owns its keyboard boundary and restores focus to its opener.
function ImportDialog({ children, active = true, className = '', labelledBy, describedBy }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    const dialog = ref.current;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length > 0);
    (focusable()[0] || dialog).focus();
    const handleKey = (event) => {
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [active]);
  return <section ref={ref} tabIndex={-1} role="dialog" aria-modal={active ? 'true' : undefined} aria-labelledby={labelledBy} aria-describedby={describedBy} inert={!active ? true : undefined} className={`accounts-modal ${className}`}>{children}</section>;
}

const isCreated = (row) => row.result?.status === 'created';
const isReady = (row) => !row.excluded && !isCreated(row) && row.status === 'Valid';
const rowStatus = (row) => row.excluded ? 'Skipped' : isCreated(row) ? 'Created' : row.result?.status === 'failed' || row.result?.status === 'processing' ? 'Failed' : row.result?.status === 'skipped' ? 'Skipped' : row.status;

export default function PersonnelImportModal({ onClose, onCreated, onStateChange, navigationBlocked = false, onCancelNavigation, onDiscardNavigation }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationFailed, setValidationFailed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [hasProcessed, setHasProcessed] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const rowsRef = useRef([]);
  const requestRef = useRef(0);
  const processingRef = useRef(false);
  const uploadRef = useRef(null);
  const dirty = rows.some((row) => !isCreated(row)) || Boolean(editing);
  const blockedDiscard = navigationBlocked && !processing;
  const secondaryOpen = confirming || discarding || blockedDiscard;

  const updateRows = useCallback((next) => { rowsRef.current = next; setRows(next); }, []);
  useEffect(() => () => { requestRef.current += 1; }, []);
  useEffect(() => { onStateChange?.({ dirty, processing }); }, [dirty, processing, onStateChange]);
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);
  useEffect(() => {
    if (!dirty && !processing) return undefined;
    const preventExit = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventExit);
    return () => window.removeEventListener('beforeunload', preventExit);
  }, [dirty, processing]);

  const requestClose = useCallback(() => {
    if (processingRef.current) return;
    if (dirty || parsing) setDiscarding(true);
    else onClose();
  }, [dirty, parsing, onClose]);
  useEffect(() => {
    const escape = (event) => {
      if (event.key !== 'Escape' || processingRef.current) return;
      event.preventDefault();
      if (confirming) setConfirming(false);
      else if (blockedDiscard) onCancelNavigation?.();
      else if (discarding) setDiscarding(false);
      else requestClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [confirming, blockedDiscard, discarding, onCancelNavigation, requestClose]);

  const revalidate = async (records) => {
    const requestId = ++requestRef.current;
    const active = records.filter((row) => !row.excluded && !isCreated(row));
    const local = validateImportRows(active.map(normalizeImportRow));
    const localById = new Map(local.map((row) => [row.row_id, row]));
    const next = records.map((row) => localById.has(row.row_id) ? { ...row, ...localById.get(row.row_id) } : row);
    updateRows(next);
    setValidating(true);
    setValidationFailed(false);
    setMessage('');
    try {
      const candidates = local.filter((row) => row.status === 'Valid');
      if (candidates.length) {
        const { data, error } = await validatePersonnelImport(candidates);
        if (requestId !== requestRef.current) return;
        if (error || !Array.isArray(data?.results)) {
          setValidationFailed(true);
          setMessage(error || 'Unable to verify these records. Please retry validation before creating accounts.');
          return;
        }
        const results = new Map(data.results.map((result) => [result.row_id, result]));
        let incomplete = false;
        const validated = next.map((row) => {
          if (!candidates.some((candidate) => candidate.row_id === row.row_id)) return row;
          const result = results.get(row.row_id);
          if (!result || !['Valid', 'Needs Correction', 'Duplicate', 'Already Exists'].includes(result.status)) { incomplete = true; return row; }
          return {
            ...row, status: result.status, errors: result.errors || [],
            auth_created: row.auth_created || result.auth_created,
            ownership_unknown: typeof result.auth_created === 'boolean' ? false : row.ownership_unknown,
          };
        });
        updateRows(validated);
        if (incomplete) {
          setValidationFailed(true);
          setMessage('Some records could not be verified. Retry validation before creating accounts.');
        }
      }
    } catch {
      if (requestId === requestRef.current) {
        setValidationFailed(true);
        setMessage('Unable to verify these records. Please retry validation before creating accounts.');
      }
    } finally {
      if (requestId === requestRef.current) setValidating(false);
    }
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || processingRef.current) return;
    if (rowsRef.current.length && !window.confirm('Replace this import preview? Unsaved records and retry information will be discarded.')) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setMessage('Choose a CSV file using the personnel template.'); return; }
    if (file.size > MAX_IMPORT_BYTES) { setMessage('The CSV file must be 1 MB or smaller.'); return; }
    const requestId = ++requestRef.current;
    setParsing(true);
    setValidating(false);
    setMessage('');
    try {
      let contents;
      try { contents = await file.text(); }
      catch { throw new Error('Unable to read this CSV file. Choose it again and retry.'); }
      if (requestId !== requestRef.current) return;
      const parsed = parsePersonnelCsv(contents);
      setFileName(file.name);
      setHasProcessed(false);
      setEditing(null);
      setParsing(false);
      await revalidate(parsed);
    } catch (error) {
      if (requestId === requestRef.current) setMessage(error?.message || 'Unable to read this CSV file. Check the template and try again.');
    } finally {
      if (requestId === requestRef.current) setParsing(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([personnelCsvTemplate()], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'personnel-import-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const saveEdit = () => {
    const normalized = normalizeImportRow(editing);
    const next = rowsRef.current.map((row) => row.row_id === editing.row_id ? {
      ...row, ...Object.fromEntries(IMPORT_COLUMNS.map(({ key }) => [key, normalized[key]])),
      email: row.auth_created || row.ownership_unknown ? row.email : editing.email,
      role: row.auth_created || row.ownership_unknown ? row.role : editing.role,
      result: undefined,
      parse_error: undefined,
    } : row);
    setEditing(null);
    void revalidate(next);
  };
  const toggleExclude = (row) => {
    setEditing(null);
    void revalidate(rowsRef.current.map((record) => record.row_id === row.row_id ? { ...record, excluded: !record.excluded, result: undefined } : record));
  };
  const ready = rows.filter(isReady);
  const canCreate = ready.length > 0 && !validating && !validationFailed && !parsing && !processing && !editing;
  const summary = useMemo(() => ({
    valid: rows.filter((row) => !row.excluded && !isCreated(row) && row.status === 'Valid').length,
    correction: rows.filter((row) => !row.excluded && !isCreated(row) && row.status === 'Needs Correction').length,
    duplicate: rows.filter((row) => !row.excluded && !isCreated(row) && ['Duplicate', 'Already Exists'].includes(row.status)).length,
    created: rows.filter(isCreated).length,
    failed: rows.filter((row) => !row.excluded && ['failed', 'processing'].includes(row.result?.status)).length,
    skipped: rows.filter((row) => row.excluded || row.result?.status === 'skipped'
      || (hasProcessed && !isCreated(row) && row.status !== 'Valid' && !['failed', 'processing'].includes(row.result?.status))).length,
  }), [rows, hasProcessed]);

  const createAccounts = async () => {
    if (processingRef.current || !canCreate) return;
    processingRef.current = true;
    setProcessing(true);
    setConfirming(false);
    setHasProcessed(true);
    setMessage('');
    const candidates = rowsRef.current.filter(isReady);
    let refreshed = false;
    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const row = candidates[index];
        setProgress({ current: index + 1, total: candidates.length });
        let result;
        try {
          const { data, error } = await createPersonnelImport([row]);
          result = data?.results?.find((item) => item.row_id === row.row_id);
          if (!result || !['created', 'failed', 'skipped', 'processing'].includes(result.status)) {
            result = { status: 'failed', ownership_unknown: true, reason: error || 'The outcome could not be confirmed. Retry this row to safely check and continue its account creation.' };
          }
        } catch {
          result = { status: 'failed', ownership_unknown: true, reason: 'The outcome could not be confirmed. Retry this row to safely check and continue its account creation.' };
        }
        updateRows(rowsRef.current.map((record) => record.row_id === row.row_id ? {
          ...record, result, auth_created: record.auth_created || result.auth_created,
          ownership_unknown: result.ownership_unknown || result.status === 'processing',
          status: result.status === 'skipped' ? 'Already Exists' : record.status,
        } : record));
      }
      // Recover account ownership before any failed row becomes editable again.
      // Retain row IDs and prior outcomes, including requests whose outcome is uncertain.
      await revalidate(rowsRef.current);
      // Refresh once per run, including partial Auth/profile changes.
      try { await onCreated?.(); refreshed = true; } catch { /* Successful import results remain visible. */ }
      if (!refreshed) setMessage('Import results are saved below. The directory could not refresh; reload it after reviewing these results.');
    } finally {
      processingRef.current = false;
      setProcessing(false);
      onCancelNavigation?.();
    }
  };

  const actionLabel = hasProcessed ? `Retry ${ready.length} Accounts` : `Create ${ready.length} Accounts`;
  return <div className="accounts-modal-overlay personnel-import-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !secondaryOpen) requestClose(); }}>
    <ImportDialog active={!secondaryOpen} labelledBy="personnel-import-title" describedBy="personnel-import-description" className="personnel-import-modal">
      <header className="accounts-modal-header personnel-import-header">
        <div><span className="personnel-import-eyebrow">Personnel Directory</span><h3 id="personnel-import-title">Import Personnel</h3><p id="personnel-import-description">Review and correct each record before creating accounts.</p></div>
        <CloseButton label="Close personnel import" onClick={requestClose} disabled={processing} />
      </header>
      <div className="personnel-import-body" aria-busy={parsing || validating || processing}>
        <section className="personnel-import-upload" aria-labelledby="personnel-import-file-title">
          <div><h4 id="personnel-import-file-title">Upload your personnel CSV</h4><p>Use the six template columns. Maximum {MAX_IMPORT_ROWS} records, 1 MB.</p></div>
          <div className="personnel-import-file-actions">
            <button type="button" className="shift-schedule-btn" onClick={downloadTemplate} disabled={processing}><FiDownload aria-hidden="true" /> Download Template</button>
            <button type="button" className="accounts-modal-add" onClick={() => uploadRef.current.click()} disabled={parsing || validating || processing}><FiUpload aria-hidden="true" /> {rows.length ? 'Replace CSV' : 'Choose CSV File'}</button>
            <input ref={uploadRef} type="file" accept=".csv,text/csv" aria-label="Upload personnel CSV" onChange={upload} hidden disabled={parsing || validating || processing} />
          </div>
          <p className="personnel-import-guidance">All fields are required. Use Gmail addresses, contact numbers in <strong>09xxxxxxxxx</strong> format, roles <strong>admin</strong> or <strong>personnel</strong>, and a supported rank. For a custom rank, enter <strong>OTHER: your rank</strong>.</p>
          <details><summary>Supported rank codes</summary><p>{IMPORT_RANKS.join(', ')}</p></details>
        </section>
        {(parsing || validating || processing) && <div className="personnel-import-progress" role="status" aria-live="polite">
          <span className="personnel-import-spinner" aria-hidden="true" />
          <div><strong>{parsing ? 'Parsing file…' : validating ? 'Validating records…' : `Creating account ${progress.current} / ${progress.total}`}</strong>{processing && <p>Sending activation emails is part of each account's processing. Account creation and profile saving are also checked. Keep this window open.</p>}</div>
        </div>}
        {navigationBlocked && processing && <p className="personnel-import-notice" role="alert">Please wait for account and activation email processing to finish before leaving.</p>}
        {message && <p className="personnel-import-error" role="alert">{message}</p>}
        {validationFailed && <button type="button" className="shift-schedule-btn" disabled={validating || processing || Boolean(editing)} onClick={() => void revalidate(rowsRef.current)}>Retry Validation</button>}
        {!rows.length && !parsing && <div className="personnel-import-empty"><h4>No records uploaded</h4><p>Download the template, fill in one person per row, then choose your CSV file. Uploading only starts validation.</p></div>}
        {rows.length > 0 && <section aria-labelledby="personnel-import-preview-title">
          <div className="personnel-import-preview-heading"><h4 id="personnel-import-preview-title">Import Preview</h4><span>{fileName}</span></div>
          <dl className="personnel-import-summary" aria-live="polite"><div><dt>Total Records</dt><dd>{rows.length}</dd></div><div><dt>Valid</dt><dd>{summary.valid}</dd></div><div><dt>Needs Correction</dt><dd>{summary.correction}</dd></div><div><dt>Duplicate / Already Exists</dt><dd>{summary.duplicate}</dd></div></dl>
          {hasProcessed && <section className="personnel-import-result" aria-labelledby="personnel-import-result-title"><h4 id="personnel-import-result-title">Import Result</h4><dl className="personnel-import-summary"><div><dt>Successfully Created</dt><dd>{summary.created}</dd></div><div><dt>Failed</dt><dd>{summary.failed}</dd></div><div><dt>Skipped</dt><dd>{summary.skipped}</dd></div></dl><p>Created rows are complete and will never be sent again. Correct failed or skipped records, then retry the valid remaining rows.</p></section>}
          <div className="personnel-import-table-wrap"><table className="personnel-import-table"><caption className="personnel-import-sr-only">Uploaded personnel records, validation details, and row actions</caption><thead><tr>{IMPORT_COLUMNS.map((column) => <th key={column.key} scope="col">{column.label}</th>)}<th scope="col">Validation Status</th><th scope="col">Action</th></tr></thead><tbody>{rows.map((row) => {
            const isEditing = editing?.row_id === row.row_id;
            const status = rowStatus(row);
            return <tr key={row.row_id} className={row.excluded ? 'is-excluded' : ''}>
              {IMPORT_COLUMNS.map((column) => (
                <td key={column.key} data-label={column.label}>
                  {isEditing ? column.key === 'role' ? (
                    <select
                      aria-label={`Role for row ${row.source_row}`}
                      value={editing.role}
                      disabled={row.auth_created || row.ownership_unknown}
                      onChange={(event) => setEditing({ ...editing, role: event.target.value })}
                    >
                      <option value="">Select role</option>
                      <option value="admin">Admin</option>
                      <option value="personnel">Personnel</option>
                    </select>
                  ) : (
                    <input
                      aria-label={`${column.label} for row ${row.source_row}`}
                      type={column.key === 'email' ? 'email' : 'text'}
                      inputMode={column.key === 'contact_number' ? 'tel' : undefined}
                      list={column.key === 'rank' ? 'personnel-import-ranks' : undefined}
                      value={editing[column.key] || ''}
                      disabled={(row.auth_created || row.ownership_unknown) && column.key === 'email'}
                      onChange={(event) => setEditing({ ...editing, [column.key]: event.target.value })}
                    />
                  ) : <span>{row[column.key] || '—'}</span>}
                </td>
              ))}
              <td data-label="Validation Status">
                <span className={`personnel-import-status personnel-import-status--${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
                <small>CSV row {row.source_row}</small>
                {row.errors?.length > 0 && !row.excluded && !isCreated(row) && (
                  <ul>{row.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
                )}
                {row.result?.reason && !row.excluded && <p className="personnel-import-row-reason">{row.result.reason}</p>}
                {isEditing && row.auth_created && <p className="personnel-import-row-reason">An account already exists for this import. Its email and role are locked; correct the remaining details to retry.</p>}
                {isEditing && !row.auth_created && row.ownership_unknown && <p className="personnel-import-row-reason">The previous creation outcome is still uncertain. Email and role remain locked until validation checks its saved progress.</p>}
              </td>
              <td data-label="Action"><div className="personnel-import-row-actions">{isCreated(row) ? <span>Complete</span> : isEditing ? <><button type="button" onClick={saveEdit} disabled={processing}>Save</button><button type="button" onClick={() => setEditing(null)} disabled={processing}>Cancel</button></> : <><button type="button" onClick={() => setEditing({ ...row })} disabled={processing || row.excluded || Boolean(editing)}>Edit</button><button type="button" onClick={() => toggleExclude(row)} disabled={processing || Boolean(editing)}>{row.excluded ? 'Restore' : 'Exclude'}</button></>}</div></td>
            </tr>;
          })}</tbody></table></div>
          <datalist id="personnel-import-ranks">{IMPORT_RANKS.map((rank) => <option key={rank} value={rank} />)}</datalist>
        </section>}
      </div>
      <footer className="accounts-modal-footer personnel-import-footer"><p>{processing ? 'Processing accounts and activation emails…' : editing ? 'Save or cancel your row edit to continue.' : validating ? 'Wait for secure validation to finish.' : validationFailed ? 'Retry validation before creating accounts.' : `${ready.length} ${ready.length === 1 ? 'account is' : 'accounts are'} ready for ${hasProcessed ? 'retry' : 'creation'}.`}</p><div><button type="button" className="accounts-modal-draft" onClick={requestClose} disabled={processing}>Close</button><button type="button" className="accounts-modal-add" onClick={() => setConfirming(true)} disabled={!canCreate}>{actionLabel}</button></div></footer>
    </ImportDialog>
    {confirming && <div className="personnel-import-confirm-overlay"><ImportDialog labelledBy="personnel-import-confirm-title" describedBy="personnel-import-confirm-description" className="personnel-import-confirm"><h3 id="personnel-import-confirm-title">Create Personnel Accounts?</h3><p id="personnel-import-confirm-description">You are about to create {ready.length} personnel accounts. Please review all personnel information before continuing. Once confirmed, account creation and activation email processing will begin.</p><div className="personnel-import-confirm-actions"><button type="button" className="accounts-modal-draft" onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="accounts-modal-add" onClick={() => void createAccounts()} disabled={!canCreate}>Create All Accounts</button></div></ImportDialog></div>}
    {(discarding || blockedDiscard) && <div className="personnel-import-confirm-overlay"><ImportDialog labelledBy="personnel-import-discard-title" className="personnel-import-confirm"><h3 id="personnel-import-discard-title">Close Personnel Import?</h3><p>Unsaved records and retry information will be discarded. Any accounts already created will remain in the directory.</p><div className="personnel-import-confirm-actions"><button type="button" className="accounts-modal-draft" onClick={() => { setDiscarding(false); if (blockedDiscard) onCancelNavigation?.(); }}>Keep Reviewing</button><button type="button" className="accounts-modal-discard" onClick={() => { requestRef.current += 1; if (blockedDiscard) onDiscardNavigation?.(); else onClose(); }}>Discard and {blockedDiscard ? 'Leave' : 'Close'}</button></div></ImportDialog></div>}
  </div>;
}
