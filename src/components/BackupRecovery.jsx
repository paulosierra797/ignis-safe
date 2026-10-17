import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  FiAlertTriangle, FiCheckCircle, FiClock, FiDownload, FiFileText, FiHardDrive, FiLock, FiPlus, FiRotateCcw
} from 'react-icons/fi';
import ArchiveConfirmDialog from './ArchiveConfirmDialog';
import Pagination from './Pagination';
import Tip from './ArchiveTip';
import usePagination from '../hooks/usePagination';
import { formatBytes } from '../utils/archiveService';
import {
  createBackup, downloadBackup, downloadRecordsCsv, getBackups, isStaleRun, restoreBackup
} from '../utils/backupService';
import './BackupRecovery.css';

gsap.registerPlugin(useGSAP);

const POLL_MS = 4000;
const number = (value) => Number(value || 0).toLocaleString('en-PH');
const formatDateTime = (value) => (value
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
  : '—');
const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })
  : '—');

// Monthly job: the 1st at 18:00 UTC (early on the 2nd in Manila).
const nextMonthlyBackup = (now = new Date()) => {
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 18));
  return thisMonth > now ? thisMonth : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 18));
};

// What a backup row means to an admin, including runs that stopped silently.
const describeStatus = (backup) => {
  if (backup.status === 'completed') return { key: 'verified', label: 'Verified' };
  if (backup.status === 'running' && !isStaleRun(backup.started_at)) return { key: 'creating', label: 'Creating…' };
  return { key: 'failed', label: 'Failed' };
};

const describeRestore = (backup) => {
  if (backup.restore_status === 'running' && !isStaleRun(backup.restore_started_at)) return 'Restoring now…';
  const summary = backup.restore_summary || {};
  if (backup.restore_status === 'completed') {
    const left = Number(summary.records_failed || 0) + Number(summary.files_failed || 0);
    return `Restored ${formatDate(backup.restore_completed_at)} by ${backup.restored_by_name || 'Super Admin'}: `
      + `${number(summary.records_added)} records and ${number(summary.files_added)} files added back`
      + (left ? `, ${number(left)} could not be restored.` : '.');
  }
  if (backup.restore_status) return `Restore didn't finish. ${summary.error || ''}`.trim();
  return '';
};

export default function BackupRecovery({ isSuperAdmin, onToast, onChanged }) {
  const scope = useRef(null);
  const seen = useRef(new Map());
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBackups(await getBackups());
      setLoadError('');
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) load();
    else setLoading(false);
  }, [isSuperAdmin, load]);

  const running = backups.find((backup) => backup.status === 'running' && !isStaleRun(backup.started_at));
  const restoring = backups.find((backup) => backup.restore_status === 'running' && !isStaleRun(backup.restore_started_at));
  const latest = backups.find((backup) => backup.status === 'completed');
  const working = Boolean(running || restoring);

  // Keep the list fresh while a backup or restore is in progress.
  useEffect(() => {
    if (!working) return undefined;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [working, load]);

  // Tell the admin when a backup or restore they started finishes.
  useEffect(() => {
    const previous = seen.current;
    const next = new Map();
    backups.forEach((backup) => {
      const key = `${backup.status}|${backup.restore_status || ''}`;
      next.set(backup.backup_id, key);
      const before = previous.get(backup.backup_id);
      if (!before || before === key) return;
      const [beforeStatus, beforeRestore] = before.split('|');
      if (beforeStatus === 'running' && backup.status === 'completed') {
        onToast?.({ type: 'success', text: 'Backup created and checked. It is ready to download.' });
        onChanged?.();
      } else if (beforeStatus === 'running' && backup.status === 'failed') {
        onToast?.({ type: 'error', text: `The backup didn't finish. ${backup.error || ''}`.trim() });
      } else if (beforeRestore === 'running' && backup.restore_status === 'completed') {
        onToast?.({ type: 'success', text: describeRestore(backup) });
        onChanged?.();
      } else if (beforeRestore === 'running' && backup.restore_status === 'failed') {
        onToast?.({ type: 'error', text: describeRestore(backup) });
      }
    });
    seen.current = next;
  }, [backups, onToast, onChanged]);

  const pages = usePagination(backups, backups.length);
  const nextBackup = useMemo(() => nextMonthlyBackup(), []);

  const rowKey = pages.items.map((backup) => backup.backup_id).join(',');
  useGSAP(() => {
    if (loading) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.br-reveal', { y: 12, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope, dependencies: [loading, isSuperAdmin] });

  useGSAP(() => {
    if (loading) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.br-row', { y: 8, opacity: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope, dependencies: [loading, rowKey] });

  useGSAP(() => {
    if (!working) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo('.br-progress-bar', { xPercent: -100 }, { xPercent: 250, duration: 1.4, ease: 'power1.inOut', repeat: -1 });
    });
    return () => media.revert();
  }, { scope, dependencies: [working] });

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError('');
  };

  const runDialog = async (note) => {
    if (!dialog) return;
    setDialogBusy(true);
    setDialogError('');
    try {
      if (dialog.kind === 'create') {
        await createBackup(note);
        onToast?.({ type: 'info', text: 'Backup started. This can take a few minutes.' });
      } else {
        await restoreBackup(dialog.backup.backup_id);
        onToast?.({ type: 'info', text: 'Restore started. This can take a few minutes.' });
      }
      setDialog(null);
      await load();
    } catch (error) {
      setDialogError(error.message);
    } finally {
      setDialogBusy(false);
    }
  };

  const handleDownload = async (backup) => {
    setDownloadingId(backup.backup_id);
    try {
      await downloadBackup(backup.backup_id);
    } catch (error) {
      onToast?.({ type: 'error', text: error.message });
    } finally {
      setDownloadingId('');
    }
  };

  const handleCsv = async () => {
    setCsvBusy(true);
    try {
      await downloadRecordsCsv();
    } catch (error) {
      onToast?.({ type: 'error', text: error.message });
    } finally {
      setCsvBusy(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <section className="br" aria-labelledby="br-title">
        <h3 id="br-title" className="br-title"><Tip info label="Backup" text="Creates a saved copy of your records and files." /></h3>
        <p className="br-locked"><FiLock aria-hidden="true" /> Only a Super Admin can create, download, or restore backups.</p>
      </section>
    );
  }

  const summaryOf = (backup) => backup.contents || {};

  return (
    <section className="br" ref={scope} aria-labelledby="br-title">
      <div className="br-card br-reveal">
        <div className="br-card-main">
          <h3 id="br-title" className="br-title">
            <Tip info label="Backup" text="Creates a saved copy of your records and files." />
          </h3>
          {loading ? (
            <p className="br-muted">Loading…</p>
          ) : latest ? (
            <>
              <p className="br-last-label">Last verified backup</p>
              <p className="br-last-date">{formatDate(latest.started_at)}</p>
              <p className="br-muted">
                {formatDateTime(latest.started_at)} · {formatBytes(latest.size_bytes)} · {number(summaryOf(latest).records)} records · {number(summaryOf(latest).files)} files
              </p>
            </>
          ) : (
            <>
              <p className="br-last-label">Last verified backup</p>
              <p className="br-last-date br-last-date--none">None yet</p>
              <p className="br-muted">Create a backup to protect your data. Nothing can be permanently deleted until one is verified.</p>
            </>
          )}
          {loadError && <p className="br-error" role="alert">{loadError}</p>}
        </div>

        <dl className="br-facts">
          <div>
            <dt><Tip info label="Stored in" text="Backups are encrypted and kept in a private space. Only Super Admins can download or restore them." /></dt>
            <dd><FiHardDrive aria-hidden="true" /> Private storage</dd>
          </div>
          <div>
            <dt><Tip info label="Recovery" text="Restore Backup adds back records and files that are missing. Nothing that exists now is changed. You can also download the encrypted file and keep it safe." /></dt>
            <dd><FiRotateCcw aria-hidden="true" /> Restore Backup</dd>
          </div>
          <div>
            <dt><Tip info label="Next automatic backup" text="A backup is also created by itself once a month. The three newest automatic backups are kept." /></dt>
            <dd><FiClock aria-hidden="true" /> {formatDate(nextBackup)}</dd>
          </div>
        </dl>

        <div className="br-actions">
          <Tip text="Save a copy of your system data.">
            <button type="button" className="at-button at-button--primary" onClick={() => { setDialogError(''); setDialog({ kind: 'create' }); }} disabled={working}>
              <FiPlus aria-hidden="true" /> Create Backup
            </button>
          </Tip>
          <Tip text="Download your saved backup.">
            <button type="button" className="at-button" onClick={() => handleDownload(latest)} disabled={!latest || Boolean(downloadingId)}>
              <FiDownload aria-hidden="true" /> {downloadingId && downloadingId === latest?.backup_id ? 'Preparing…' : 'Download Backup'}
            </button>
          </Tip>
          <Tip text="Recover records and files from a previous backup.">
            <button type="button" className="at-button" onClick={() => { setDialogError(''); setDialog({ kind: 'restore', backup: latest }); }} disabled={!latest || working}>
              <FiRotateCcw aria-hidden="true" /> Restore Backup
            </button>
          </Tip>
          <Tip text="Download your current records as spreadsheets. This is for reading only, not a full backup.">
            <button type="button" className="at-button at-button--ghost" onClick={handleCsv} disabled={csvBusy}>
              <FiFileText aria-hidden="true" /> {csvBusy ? 'Preparing…' : 'Records (CSV)'}
            </button>
          </Tip>
        </div>

        {working && (
          <div className="br-progress" role="status" aria-live="polite">
            <span>{restoring ? 'Restoring from your backup…' : 'Creating your backup…'}</span>
            <small>{restoring ? 'Checking the backup, then adding back anything that is missing.' : 'Saving records and files, then checking the saved copy.'}</small>
            <div className="br-progress-track" aria-hidden="true"><div className="br-progress-bar" /></div>
          </div>
        )}
      </div>

      <div className="br-history br-reveal">
        <h3 className="br-subtitle">
          <Tip info label="Backup History" text="Every backup that was made, and whether it was checked." />
        </h3>

        {!loading && backups.length === 0 ? (
          <div className="at-empty"><strong>No backups yet</strong><span>Your first backup will appear here.</span></div>
        ) : (
          <div className="at-table-wrap">
            <table className="at-table br-table">
              <thead>
                <tr>
                  <th scope="col"><Tip info label="Date" text="When the backup started (Philippine time)." /></th>
                  <th scope="col"><Tip info label="Size" text="How much space the saved backup takes." /></th>
                  <th scope="col"><Tip info label="Contents" text="What the backup includes: records, assessment history, attendance, reports, user information, and uploaded files." /></th>
                  <th scope="col"><Tip info label="Status" text="Verified means the saved copy was read back and checked. Only verified backups can be downloaded or restored." /></th>
                  <th scope="col"><Tip info label="Location" text="Where the backup is kept." /></th>
                  <th scope="col"><span className="at-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pages.items.map((backup) => {
                  const status = describeStatus(backup);
                  const contents = summaryOf(backup);
                  const restoreNote = describeRestore(backup);
                  return (
                    <tr key={backup.backup_id} className="br-row">
                      <td data-label="Date">
                        <strong>{formatDateTime(backup.started_at)}</strong>
                        <span className="at-table-sub">
                          {backup.kind === 'scheduled' ? 'Automatic · monthly' : `Manual${backup.created_by_name ? ` · ${backup.created_by_name}` : ''}`}
                        </span>
                        {backup.note && <span className="at-table-sub">“{backup.note}”</span>}
                      </td>
                      <td data-label="Size">{status.key === 'verified' ? formatBytes(backup.size_bytes) : '—'}</td>
                      <td data-label="Contents">
                        {status.key === 'verified' ? (
                          <>
                            <strong>{number(contents.records)} records · {number(contents.files)} files</strong>
                            <span className="at-table-sub">
                              {number(contents.assessment_attempts)} assessments · {number(contents.attendance_records)} attendance · {number(contents.reports)} reports · {number(contents.learners)} learners · {number(contents.staff_accounts)} staff
                            </span>
                          </>
                        ) : '—'}
                      </td>
                      <td data-label="Status">
                        <span className={`br-status br-status--${status.key}`}>
                          {status.key === 'verified' && <FiCheckCircle aria-hidden="true" />}
                          {status.key === 'failed' && <FiAlertTriangle aria-hidden="true" />}
                          {status.label}
                        </span>
                        {status.key === 'failed' && <span className="at-table-sub">{backup.error || 'It stopped before it finished.'}</span>}
                        {restoreNote && <span className="at-table-sub">{restoreNote}</span>}
                      </td>
                      <td data-label="Location">{backup.storage_location}</td>
                      <td data-label="">
                        {status.key === 'verified' && (
                          <div className="br-row-actions">
                            <Tip text="Download your saved backup.">
                              <button type="button" className="at-button at-button--ghost" onClick={() => handleDownload(backup)} disabled={Boolean(downloadingId)}>
                                <FiDownload aria-hidden="true" /> {downloadingId === backup.backup_id ? 'Preparing…' : 'Download'}
                              </button>
                            </Tip>
                            <Tip text="Recover records and files from this backup.">
                              <button type="button" className="at-button at-button--ghost" onClick={() => { setDialogError(''); setDialog({ kind: 'restore', backup }); }} disabled={working}>
                                <FiRotateCcw aria-hidden="true" /> Restore
                              </button>
                            </Tip>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pages.page} totalItems={pages.totalItems} onPageChange={pages.onPageChange} label="Backup pages" />
      </div>

      <ArchiveConfirmDialog
        open={dialog?.kind === 'create'}
        tone="archive"
        title="Create a backup?"
        description={<p>Saves an encrypted copy of your records and files, then checks it. You can keep using the system while it runs.</p>}
        reasonLabel="Note"
        reasonPlaceholder="e.g. Before the new school year"
        confirmLabel="Create Backup"
        busyLabel="Starting…"
        busy={dialogBusy}
        error={dialogError}
        onConfirm={runDialog}
        onClose={closeDialog}
      />
      <ArchiveConfirmDialog
        open={dialog?.kind === 'restore'}
        tone="restore"
        title="Restore this backup?"
        description={(
          <p>
            Records and files that are missing now will be added back. Nothing that exists today is changed or replaced.
            The backup is checked first; if it is damaged, nothing is restored.
          </p>
        )}
        recordLabel={dialog?.backup ? formatDateTime(dialog.backup.started_at) : ''}
        recordMeta={dialog?.backup ? `${formatBytes(dialog.backup.size_bytes)} · ${number(summaryOf(dialog.backup).records)} records · ${number(summaryOf(dialog.backup).files)} files` : ''}
        showReason={false}
        confirmPhrase="RESTORE"
        confirmLabel="Restore Backup"
        busyLabel="Starting…"
        busy={dialogBusy}
        error={dialogError}
        onConfirm={runDialog}
        onClose={closeDialog}
      />
    </section>
  );
}
