import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { FiAlertTriangle, FiCheck, FiLock, FiMaximize2, FiMinus, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { logAdminActivity, manageAccount, moveAccountToTrash } from '../utils/usersService';
import './BulkManageModal.css';

const RANKS = ['FDIR', 'DFDIR', 'SSUPT', 'SUPT', 'CINSP', 'SINSP', 'INSP', 'SFO4', 'SFO3', 'SFO2', 'SFO1', 'FO3', 'FO2', 'FO1'];
const STATUSES = ['Active', 'Inactive', 'Suspended'];
const TIERS = [
  { key: 'super_admin', label: 'Super Admin' },
  { key: 'admin', label: 'Admin' },
  { key: 'personnel', label: 'Personnel' }
];
const TIER_LABEL = Object.fromEntries(TIERS.map((tier) => [tier.key, tier.label]));
const EMPTY_FORM = { rank: '', role: '', status: '' };

const getTier = (account) => {
  if (account.is_super_admin) return 'super_admin';
  return String(account.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'personnel';
};

const getName = (account) =>
  `${account.first_name || ''} ${account.last_name || ''}`.trim() || account.email || 'Unnamed account';

// Mirrors the manage_account rules; the database remains the authority.
const planRole = (account, target) => {
  const from = getTier(account);
  if (!target || target === from) return { kind: 'none' };
  if (from === 'personnel' && target === 'admin') return { kind: 'promote', label: 'Personnel → Admin' };
  if (from === 'admin' && target === 'super_admin') return { kind: 'promote', label: 'Admin → Super Admin' };
  if (from === 'super_admin' && target === 'admin') return { kind: 'demote', label: 'Super Admin → Admin' };
  return {
    kind: 'invalid',
    reason: target === 'super_admin' && from === 'personnel'
      ? 'Personnel must be promoted to Admin first'
      : 'Role change not allowed'
  };
};

const buildEditPlan = (accounts, form) => accounts.map((account) => {
  const role = planRole(account, form.role);
  if (role.kind === 'invalid') return { account, skip: role.reason };

  const lines = [];
  const changes = {};
  if (role.kind !== 'none') {
    changes.role = form.role;
    lines.push(`Role: ${role.label}`);
  }
  if (form.rank && form.rank !== account.rank) {
    changes.rank = form.rank;
    lines.push(`Rank: ${account.rank || '—'} → ${form.rank}`);
  }
  if (form.status && form.status !== account.status) {
    changes.status = form.status;
    lines.push(`Status: ${account.status || '—'} → ${form.status}`);
  }
  return lines.length ? { account, changes, lines } : { account, skip: 'Already up to date' };
});

const BulkManageModal = ({ accounts, protectedIds, currentAdminId, actor, onClose, onCompleted }) => {
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [step, setStep] = useState('select'); // select | edit | confirm | progress
  const [mode, setMode] = useState('edit'); // edit | delete
  const [form, setForm] = useState(EMPTY_FORM);
  const [progress, setProgress] = useState({ done: 0, total: 0, results: [], finished: false, current: '' });
  const [minimized, setMinimized] = useState(false);
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const stageRef = useRef(null);
  const barRef = useRef(null);
  const widgetRef = useRef(null);
  const widgetBarRef = useRef(null);
  const listRef = useRef(null);
  const minimizingRef = useRef(false);
  const mountedRef = useRef(true);
  const processing = step === 'progress' && !progress.finished;
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isLocked = (account) =>
    protectedIds.includes(account.admin_id) || account.admin_id === currentAdminId;
  const lockLabel = (account) => (protectedIds.includes(account.admin_id) ? 'Protected' : 'You');

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return TIERS.map((tier) => {
      const all = accounts.filter((account) => getTier(account) === tier.key);
      const rows = term
        ? all.filter((account) => `${getName(account)} ${account.email || ''}`.toLowerCase().includes(term))
        : all;
      return {
        ...tier,
        rows,
        selectable: rows.filter(
          (account) => !protectedIds.includes(account.admin_id) && account.admin_id !== currentAdminId
        )
      };
    });
  }, [accounts, search, protectedIds, currentAdminId]);

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selected.has(account.admin_id)),
    [accounts, selected]
  );
  const plan = useMemo(
    () => (mode === 'edit' ? buildEditPlan(selectedAccounts, form) : []),
    [mode, selectedAccounts, form]
  );
  const isDelete = mode === 'delete';
  const actionable = isDelete ? selectedAccounts : plan.filter((item) => !item.skip);
  const skipped = plan.filter((item) => item.skip);

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleGroup = (group) => setSelected((prev) => {
    const next = new Set(prev);
    const allOn = group.selectable.every((account) => next.has(account.admin_id));
    group.selectable.forEach((account) => (allOn ? next.delete(account.admin_id) : next.add(account.admin_id)));
    return next;
  });

  // Entrance (and restore after minimizing).
  useLayoutEffect(() => {
    if (minimized || reduceMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' });
      gsap.fromTo(panelRef.current, { y: 16, scale: 0.98, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'power3.out' });
    });
    return () => ctx.revert();
  }, [minimized]);

  // Floating widget entrance.
  useLayoutEffect(() => {
    if (!minimized || reduceMotion()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(widgetRef.current, { y: 16, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out' });
    });
    return () => ctx.revert();
  }, [minimized]);

  // Lock the page behind the full modal: no scroll, wheel or touch movement.
  useEffect(() => {
    if (minimized) return undefined;
    const { body, documentElement: html } = document;
    const prev = { body: body.style.overflow, html: html.style.overflow, pad: body.style.paddingRight };
    const scrollbar = window.innerWidth - html.clientWidth;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    const overlay = overlayRef.current;
    const guard = (event) => {
      const scroller = event.target.closest?.('.bm-scroll');
      if (!scroller || !overlay.contains(scroller)) {
        event.preventDefault();
        return;
      }
      if (event.type === 'wheel') {
        const atTop = scroller.scrollTop <= 0;
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
        if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault();
      }
    };
    overlay?.addEventListener('wheel', guard, { passive: false });
    overlay?.addEventListener('touchmove', guard, { passive: false });
    return () => {
      body.style.overflow = prev.body;
      html.style.overflow = prev.html;
      body.style.paddingRight = prev.pad;
      overlay?.removeEventListener('wheel', guard);
      overlay?.removeEventListener('touchmove', guard);
    };
  }, [minimized]);

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !stageRef.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(stageRef.current, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: 'power2.out' });
      gsap.fromTo('.bm-anim', { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.025, ease: 'power2.out', delay: 0.05 });
    }, stageRef);
    return () => ctx.revert();
  }, [step, progress.finished]);

  useLayoutEffect(() => {
    const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
    [barRef.current, widgetBarRef.current].filter(Boolean).forEach((bar) => {
      gsap.to(bar, { width: `${pct}%`, duration: 0.3, ease: 'power2.out' });
    });
  }, [progress.done, progress.total, progress.finished, step, minimized]);

  // Newest result slides in and the list follows it.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !list.lastElementChild) return;
    list.scrollTop = list.scrollHeight;
    if (!reduceMotion()) {
      gsap.fromTo(list.lastElementChild, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' });
    }
  }, [progress.results.length]);

  const minimize = () => {
    if (!processing || minimizingRef.current) return;
    const panel = panelRef.current;
    if (!panel || reduceMotion()) {
      setMinimized(true);
      return;
    }
    minimizingRef.current = true;
    const rect = panel.getBoundingClientRect();
    const dx = window.innerWidth - 24 - 160 - (rect.left + rect.width / 2);
    const dy = window.innerHeight - 24 - 60 - (rect.top + rect.height / 2);
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.25, ease: 'power1.in' });
    gsap.to(panel, {
      x: dx, y: dy, scale: 0.25, opacity: 0, duration: 0.3, ease: 'power2.in',
      onComplete: () => { minimizingRef.current = false; setMinimized(true); }
    });
  };

  const requestClose = () => {
    if (!processing) onClose();
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape' || minimized) return;
      if (processing) minimize(); else requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startRun = async () => {
    const items = isDelete ? selectedAccounts.map((account) => ({ account })) : actionable;
    const results = [];
    setProgress({ done: 0, total: items.length, results: [], finished: false, current: getName(items[0].account) });
    setStep('progress');

    for (const item of items) {
      const { account } = item;
      let error = null;
      try {
        if (isDelete) {
          const res = await moveAccountToTrash(account.admin_id, 'Bulk delete by Super Admin');
          error = res.error || (res.data?.itemId ? null : 'Protected or ineligible account');
        } else {
          error = (await manageAccount(account.admin_id, item.changes)).error;
        }
      } catch (err) {
        error = err.message || 'Unexpected error';
      }
      results.push({ id: account.admin_id, name: getName(account), error });
      if (mountedRef.current) {
        const next = items[results.length];
        setProgress({
          done: results.length, total: items.length, results: [...results], finished: false,
          current: next ? getName(next.account) : ''
        });
      }
    }

    const succeeded = results.filter((result) => !result.error);
    if (isDelete && succeeded.length) {
      logAdminActivity({
        actorId: actor?.id || null,
        actorName: actor?.name || 'Super Admin',
        action: 'Bulk Accounts Moved to Trash',
        actionType: 'archive',
        details: `Moved ${succeeded.length} account(s) to Archive & Trash: ${succeeded.map((result) => result.name).join(', ')}.`,
        metadata: { trashed_admin_ids: succeeded.map((result) => result.id), failed: results.length - succeeded.length }
      }).catch((err) => console.warn('Unable to write admin activity log:', err));
    }
    if (mountedRef.current) {
      setProgress({ done: results.length, total: items.length, results, finished: true, current: '' });
    }
    onCompleted();
  };

  const failed = progress.results.filter((result) => result.error);
  const formReady = Boolean(form.rank || form.role || form.status);

  const renderSelect = () => (
    <>
      <div className="bm-search bm-anim">
        <FiSearch aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search accounts"
          aria-label="Search accounts"
        />
      </div>
      {groups.map((group) => {
        const picked = group.selectable.filter((account) => selected.has(account.admin_id)).length;
        const allOn = group.selectable.length > 0 && picked === group.selectable.length;
        return (
          <section className="bm-group bm-anim" key={group.key}>
            <label className="bm-group-head">
              <input
                type="checkbox"
                checked={allOn}
                ref={(node) => { if (node) node.indeterminate = picked > 0 && !allOn; }}
                disabled={group.selectable.length === 0}
                onChange={() => toggleGroup(group)}
                aria-label={`Select all ${group.label} accounts`}
              />
              <span className="bm-group-title">{group.label}</span>
              <span className="bm-count">{picked ? `${picked} / ` : ''}{group.rows.length}</span>
            </label>
            {group.rows.length === 0 ? (
              <p className="bm-empty">No accounts</p>
            ) : (
              <ul className="bm-rows">
                {group.rows.map((account) => {
                  const locked = isLocked(account);
                  return (
                    <li key={account.admin_id}>
                      <label className={`bm-row${selected.has(account.admin_id) ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected.has(account.admin_id)}
                          disabled={locked}
                          onChange={() => toggleOne(account.admin_id)}
                        />
                        <span className="bm-identity">
                          <span className="bm-name">{getName(account)}</span>
                          <span className="bm-email">{account.email}</span>
                        </span>
                        <span className="bm-rank">{account.rank || '—'}</span>
                        {locked ? (
                          <span className="bm-chip is-locked"><FiLock aria-hidden="true" />{lockLabel(account)}</span>
                        ) : (
                          <span className={`bm-chip is-${String(account.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                            {account.status || '—'}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );

  const renderEdit = () => (
    <div className="bm-form">
      <p className="bm-lead bm-anim">
        Applying to <strong>{selectedAccounts.length}</strong> selected {selectedAccounts.length === 1 ? 'account' : 'accounts'}. Leave a field on “No change” to keep it.
      </p>
      <label className="bm-field bm-anim">
        <span>Rank</span>
        <select value={form.rank} onChange={(event) => setForm({ ...form, rank: event.target.value })}>
          <option value="">No change</option>
          {RANKS.map((rank) => <option key={rank} value={rank}>{rank}</option>)}
        </select>
      </label>
      <label className="bm-field bm-anim">
        <span>Role</span>
        <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
          <option value="">No change</option>
          <option value="admin">Admin (promote Personnel / demote Super Admin)</option>
          <option value="super_admin">Super Admin (promote Admin)</option>
        </select>
      </label>
      <label className="bm-field bm-anim">
        <span>Account status</span>
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="">No change</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      <p className="bm-hint bm-anim">Personnel can’t be promoted straight to Super Admin; those accounts are skipped.</p>
    </div>
  );

  const renderConfirm = () => (
    <div className="bm-confirm">
      <div className={`bm-alert bm-anim${isDelete ? ' is-danger' : ''}`}>
        <FiAlertTriangle aria-hidden="true" />
        <div>
          <h3>Are you sure?</h3>
          <p>
            {isDelete
              ? `${actionable.length} ${actionable.length === 1 ? 'account' : 'accounts'} will be moved to Archive & Trash. Access is revoked immediately; they can be restored from Trash.`
              : `${actionable.length} ${actionable.length === 1 ? 'account' : 'accounts'} will be updated${skipped.length ? `, ${skipped.length} skipped` : ''}.`}
          </p>
        </div>
      </div>
      <ul className="bm-summary">
        {(isDelete ? selectedAccounts.map((account) => ({ account })) : plan).map((item) => (
          <li className={`bm-summary-row bm-anim${item.skip ? ' is-skipped' : ''}`} key={item.account.admin_id}>
            <span className="bm-name">{getName(item.account)}</span>
            <span className="bm-tier">{TIER_LABEL[getTier(item.account)]}</span>
            <span className="bm-change">
              {isDelete ? 'Move to Trash' : item.skip ? `Skipped · ${item.skip}` : item.lines.join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const succeededCount = progress.results.length - failed.length;
  const actionText = !progress.finished
    ? `${isDelete ? 'Moving to Trash' : 'Updating'}: ${progress.current}`
    : failed.length === 0
      ? 'All done'
      : `${succeededCount} succeeded, ${failed.length} failed`;

  const renderProgress = () => {
    return (
      <div className="bm-progress">
        <div className="bm-progress-head bm-anim">
          <h3 title={actionText}>{actionText}</h3>
          <span className="bm-figures">{progress.done} of {progress.total} · {pct}%</span>
        </div>
        <div className="bm-bar bm-anim" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="bm-bar-fill" ref={barRef} />
        </div>
        <div className="bm-stats bm-anim">
          <span className="is-ok"><FiCheck aria-hidden="true" />{succeededCount} completed</span>
          <span className={failed.length ? 'is-fail' : ''}><FiX aria-hidden="true" />{failed.length} failed</span>
          <span>{progress.total - progress.done} remaining</span>
        </div>
        <ul className="bm-summary bm-scroll" ref={listRef}>
          {progress.results.map((result) => (
            <li className={`bm-summary-row${result.error ? ' is-failed' : ''}`} key={result.id}>
              <span className="bm-name">{result.name}</span>
              <span className="bm-result">
                {result.error ? <><FiX aria-hidden="true" />{result.error}</> : <><FiCheck aria-hidden="true" />Done</>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const titles = { select: 'Bulk Manage', edit: 'Bulk Edit', confirm: 'Review changes', progress: progress.finished ? 'Completed' : 'Processing' };

  if (minimized) {
    return (
      <aside className="bm-widget" ref={widgetRef} role="status" aria-live="polite" aria-label="Bulk processing progress">
        <div className="bm-widget-head">
          <strong>{isDelete ? 'Move to Trash' : 'Bulk update'}</strong>
          <div className="bm-widget-actions">
            <button type="button" className="bm-icon-btn" onClick={() => setMinimized(false)} aria-label="Expand progress window">
              <FiMaximize2 aria-hidden="true" />
            </button>
            {progress.finished && (
              <button type="button" className="bm-icon-btn" onClick={onClose} aria-label="Dismiss">
                <FiX aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <p className="bm-widget-action" title={actionText}>{actionText}</p>
        <div className="bm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="bm-bar-fill" ref={widgetBarRef} />
        </div>
        <div className="bm-widget-meta">
          <span>{progress.done} of {progress.total} · {pct}%</span>
          <span>
            {succeededCount} completed{failed.length ? ` · ${failed.length} failed` : ''}
          </span>
        </div>
      </aside>
    );
  }

  return (
    <div className="bm-overlay" ref={overlayRef} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div className={`bm-panel${step === 'progress' ? ' is-compact' : ''}`} ref={panelRef} role="dialog" aria-modal="true" aria-label="Bulk manage accounts">
        <header className="bm-header">
          <h2>{titles[step]}</h2>
          {processing ? (
            <button type="button" className="bm-icon-btn" onClick={minimize} aria-label="Minimize">
              <FiMinus aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="bm-icon-btn" onClick={requestClose} aria-label="Close">
              <FiX aria-hidden="true" />
            </button>
          )}
        </header>

        <div className={`bm-body${step === 'progress' ? ' is-progress' : ' bm-scroll'}`} ref={stageRef} key={step + (progress.finished ? '-done' : '')}>
          {step === 'select' && renderSelect()}
          {step === 'edit' && renderEdit()}
          {step === 'confirm' && renderConfirm()}
          {step === 'progress' && renderProgress()}
        </div>

        <footer className="bm-footer">
          {step === 'select' && (
            <>
              <span className="bm-selected">{selected.size} selected</span>
              <div className="bm-actions">
                <button type="button" className="bm-btn is-danger" disabled={!selected.size}
                  onClick={() => { setMode('delete'); setStep('confirm'); }}>
                  <FiTrash2 aria-hidden="true" />Bulk Delete
                </button>
                <button type="button" className="bm-btn is-primary" disabled={!selected.size}
                  onClick={() => { setMode('edit'); setForm(EMPTY_FORM); setStep('edit'); }}>
                  Bulk Edit
                </button>
              </div>
            </>
          )}
          {step === 'edit' && (
            <>
              <button type="button" className="bm-btn" onClick={() => setStep('select')}>Back</button>
              <button type="button" className="bm-btn is-primary" disabled={!formReady} onClick={() => setStep('confirm')}>Review</button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button type="button" className="bm-btn" onClick={() => setStep(isDelete ? 'select' : 'edit')}>Back</button>
              <button type="button" className={`bm-btn ${isDelete ? 'is-danger-solid' : 'is-primary'}`}
                disabled={actionable.length === 0} onClick={startRun}>
                {isDelete ? `Move ${actionable.length} to Trash` : `Apply to ${actionable.length}`}
              </button>
            </>
          )}
          {step === 'progress' && (
            <>
              <span className="bm-selected">{processing ? 'You can minimize this window; it keeps running.' : ''}</span>
              <button type="button" className="bm-btn is-primary" disabled={processing} onClick={onClose}>Done</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};

export default BulkManageModal;
