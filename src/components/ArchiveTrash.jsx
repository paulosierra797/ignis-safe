import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  FiAlertTriangle, FiArchive, FiBarChart2, FiChevronDown, FiCpu, FiDownload, FiLock,
  FiRotateCcw, FiSearch, FiShield, FiTrash2, FiUser
} from 'react-icons/fi';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import Pagination from './Pagination';
import ToastMessage from './ToastMessage';
import ArchiveConfirmDialog from './ArchiveConfirmDialog';
import {
  ArchiveActivityChart, DeletionCountdownChart, StorageCompositionChart, StorageGrowthChart
} from './ArchiveTrashCharts';
import usePagination from '../hooks/usePagination';
import { useUser } from '../context/UserContext';
import {
  confirmArchiveBackup, formatBytes, getArchiveEvents, getArchiveItemStatus, getArchiveItems, getArchivePolicies,
  getRemainingRecoveryDays, getStorageOverview, purgeArchiveItem, restoreArchiveItem, updateArchivePolicy
} from '../utils/archiveService';
import './ArchiveTrash.css';

gsap.registerPlugin(useGSAP);

const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const DAY_MS = 24 * 60 * 60 * 1000;

const EVENT_LABELS = {
  archived: 'Archived',
  soft_deleted: 'Moved to Trash',
  restored: 'Restored',
  purged: 'Deleted forever',
  deleted: 'Deleted',
  purge_blocked: 'Put on hold',
  purge_failed: 'Delete failed',
  policy_updated: 'Settings changed',
  backup_confirmed: 'Backup confirmed'
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Any status' },
  { value: 'archived', label: 'Archived' },
  { value: 'soft_deleted', label: 'In Trash' },
  { value: 'due', label: 'Ready to delete' },
  { value: 'queued', label: 'Deleting soon' },
  { value: 'blocked', label: 'On hold' }
];

const SORTS = [
  { value: 'deletion', label: 'Deletes soonest' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' }
];

const formatDateTime = (value) => (value
  ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
  : '—');
const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })
  : '—');

const escapeCsv = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const daysLeftLabel = (days) => {
  if (days == null) return 'No date set';
  if (days === 0) return 'Deleting soon';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
};

// Mirrors the server's purge checks that the page can see, so the Delete
// button explains itself up front. The server still runs every check.
const getDeleteBlock = (item, policy, isSuperAdmin, now) => {
  if (item.lifecycle.key === 'purging') return 'Deleting now…';
  if (!isSuperAdmin) return 'Only a Super Admin can delete for good.';
  if (!policy) return '';
  const adminTrashed = !policy.is_protected && item.disposition === 'soft_deleted' && item.actor_type === 'admin';
  if (!policy.purge_enabled && !adminTrashed) return `Deleting is turned off for ${policy.label}.`;
  if (policy.is_protected && policy.retention_days == null) return 'Keep period not set yet.';
  if (policy.retention_days != null) {
    const start = new Date(item.record_created_at || item.archived_at).getTime();
    const keepUntil = start + policy.retention_days * DAY_MS;
    if (Number.isFinite(keepUntil) && keepUntil > now) return `Must be kept until ${formatDate(keepUntil)}.`;
  }
  const backupAt = policy.backup_confirmed_at ? new Date(policy.backup_confirmed_at).getTime() : null;
  const archivedAt = new Date(item.archived_at).getTime();
  if (backupAt == null || (Number.isFinite(archivedAt) && backupAt < archivedAt)) return 'Needs a newer backup first.';
  return '';
};

function CountdownRing({ days, total }) {
  const ratio = days == null ? 0 : Math.min(1, Math.max(0, days / Math.max(total, 1)));
  const tone = days == null || days <= 2 ? 'critical' : days <= 7 ? 'warning' : 'calm';
  return (
    <div className={`at-ring at-ring--${tone}`} role="img" aria-label={days == null ? 'No deletion date' : `${days} of ${total} days left`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="at-ring-track" cx="22" cy="22" r={RING_RADIUS} />
        <circle
          className="at-ring-progress"
          cx="22"
          cy="22"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          style={{ strokeDashoffset: RING_CIRCUMFERENCE * (1 - ratio) }}
        />
      </svg>
      <span className="at-ring-value" aria-hidden="true">
        <strong>{days ?? '–'}</strong>
        <small>{days === 1 ? 'day' : 'days'}</small>
      </span>
    </div>
  );
}

function Actor({ type, name }) {
  const Icon = type === 'system' ? FiCpu : FiUser;
  const label = type === 'system' ? 'System' : name || (type === 'user' ? 'User' : 'Admin');
  return (
    <span className="at-actor">
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export default function ArchiveTrash() {
  const { isSuperAdmin } = useUser();
  const scope = useRef(null);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('items');
  const [showCharts, setShowCharts] = useState(false);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('deletion');
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState('all');
  const [historyModule, setHistoryModule] = useState('all');
  const [expandedId, setExpandedId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [policyDrafts, setPolicyDrafts] = useState({});
  const [savingPolicy, setSavingPolicy] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      const [nextItems, nextEvents, nextPolicies, nextOverview] = await Promise.all([
        getArchiveItems(),
        getArchiveEvents(),
        getArchivePolicies(),
        getStorageOverview()
      ]);
      setItems(nextItems);
      setEvents(nextEvents);
      setPolicies(nextPolicies);
      setOverview(nextOverview);
      setNow(Date.now());
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const policyByModule = useMemo(() => new Map(policies.map((policy) => [policy.module, policy])), [policies]);
  const moduleLabel = useCallback(
    (module) => policyByModule.get(module)?.label || (module === 'system' ? 'System' : module),
    [policyByModule]
  );
  const archivablePolicies = useMemo(() => policies.filter((policy) => policy.is_archivable), [policies]);

  const decoratedItems = useMemo(() => items.map((item) => ({
    ...item,
    remainingDays: getRemainingRecoveryDays(item.purge_after, now),
    recoveryDays: policyByModule.get(item.module)?.recovery_days || 30,
    lifecycle: getArchiveItemStatus(item, now)
  })), [items, now, policyByModule]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = decoratedItems.filter((item) => {
      if (moduleFilter !== 'all' && item.module !== moduleFilter) return false;
      if (statusFilter !== 'all' && item.lifecycle.key !== statusFilter) return false;
      if (!query) return true;
      return [item.record_label, item.record_context, item.reason, item.archived_by_name, moduleLabel(item.module)]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
    const sorters = {
      deletion: (left, right) => new Date(left.purge_after) - new Date(right.purge_after),
      newest: (left, right) => new Date(right.archived_at) - new Date(left.archived_at),
      oldest: (left, right) => new Date(left.archived_at) - new Date(right.archived_at),
      name: (left, right) => String(left.record_label).localeCompare(String(right.record_label))
    };
    return [...matches].sort(sorters[sort] || sorters.deletion);
  }, [decoratedItems, moduleFilter, statusFilter, search, sort, moduleLabel]);

  const filteredEvents = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return events.filter((event) => {
      if (historyType !== 'all' && event.event_type !== historyType) return false;
      if (historyModule !== 'all' && event.module !== historyModule) return false;
      if (!query) return true;
      return [event.record_label, event.reason, event.actor_name, moduleLabel(event.module)]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [events, historySearch, historyType, historyModule, moduleLabel]);

  const itemPages = usePagination(filteredItems, `${search}|${moduleFilter}|${statusFilter}|${sort}`);
  const eventPages = usePagination(filteredEvents, `${historySearch}|${historyType}|${historyModule}`);

  const eventsByItem = useMemo(() => {
    const grouped = new Map();
    events.forEach((event) => {
      if (!event.item_id) return;
      grouped.set(event.item_id, [...(grouped.get(event.item_id) || []), event]);
    });
    return grouped;
  }, [events]);

  const metrics = useMemo(() => {
    const fileBytes = (overview?.buckets || []).reduce((total, bucket) => total + (Number(bucket.bytes) || 0), 0);
    return {
      total: decoratedItems.length,
      dueSoon: decoratedItems.filter((item) => item.remainingDays != null && item.remainingDays <= 7).length,
      onHold: decoratedItems.filter((item) => item.lifecycle.key === 'blocked').length,
      storageBytes: (Number(overview?.database_bytes) || 0) + fileBytes
    };
  }, [decoratedItems, overview]);

  const latestBackup = useMemo(() => archivablePolicies
    .map((policy) => policy.backup_confirmed_at)
    .filter(Boolean)
    .sort()
    .pop() || null, [archivablePolicies]);

  // Subtle entrance and countdown motion; skipped when reduced motion is preferred.
  useGSAP(() => {
    if (loading) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.at-reveal', { y: 12, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope, dependencies: [loading] });

  const pageKey = itemPages.items.map((item) => item.item_id).join(',');
  useGSAP(() => {
    if (loading || activeTab !== 'items') return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.at-item', { y: 8, opacity: 0, duration: 0.35, stagger: 0.035, ease: 'power2.out', clearProps: 'transform,opacity' });
      gsap.from('.at-ring-progress', { strokeDashoffset: RING_CIRCUMFERENCE, duration: 0.9, stagger: 0.035, ease: 'power2.out' });
    });
    return () => media.revert();
  }, { scope, dependencies: [loading, activeTab, pageKey] });

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.at-panel', { y: 6, opacity: 0, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope, dependencies: [activeTab], revertOnUpdate: true });

  useGSAP(() => {
    if (!showCharts) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.at-chart', { y: 10, opacity: 0, duration: 0.4, stagger: 0.06, ease: 'power2.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope, dependencies: [showCharts] });

  useGSAP(() => {
    if (!expandedId) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.at-item-history > li', { x: -6, opacity: 0, duration: 0.3, stagger: 0.04, ease: 'power2.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope, dependencies: [expandedId] });

  const openDialog = (next) => {
    setDialogError('');
    setDialog(next);
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError('');
  };

  const runDialogAction = async (reason) => {
    if (!dialog) return;
    setDialogBusy(true);
    setDialogError('');
    try {
      if (dialog.kind === 'restore') {
        await restoreArchiveItem(dialog.item.item_id, reason);
        setToast({ type: 'success', text: `"${dialog.item.record_label}" restored.` });
      } else if (dialog.kind === 'purge') {
        await purgeArchiveItem(dialog.item.item_id, reason);
        setToast({ type: 'success', text: `"${dialog.item.record_label}" deleted forever.` });
      } else if (dialog.kind === 'backup') {
        await confirmArchiveBackup(reason);
        setToast({ type: 'success', text: 'Backup confirmed.' });
      }
      setDialog(null);
      await loadAll();
    } catch (error) {
      setDialogError(error.message);
    } finally {
      setDialogBusy(false);
    }
  };

  const getPolicyDraft = (policy) => policyDrafts[policy.module] || {
    purgeEnabled: policy.purge_enabled,
    retentionDays: policy.retention_days ?? ''
  };

  const savePolicy = async (policy) => {
    const draft = getPolicyDraft(policy);
    setSavingPolicy(policy.module);
    try {
      await updateArchivePolicy(policy.module, draft);
      setPolicyDrafts((current) => {
        const next = { ...current };
        delete next[policy.module];
        return next;
      });
      setToast({ type: 'success', text: `${policy.label} settings saved.` });
      await loadAll();
    } catch (error) {
      setToast({ type: 'error', text: error.message });
    } finally {
      setSavingPolicy('');
    }
  };

  const exportHistory = () => {
    const header = ['Date', 'Action', 'Section', 'Item', 'By', 'Actor type', 'Reason'];
    const rows = filteredEvents.map((event) => [
      formatDateTime(event.occurred_at), EVENT_LABELS[event.event_type] || event.event_type, moduleLabel(event.module),
      event.record_label, event.actor_name, event.actor_type, event.reason
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `archive-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'items', label: 'Items', count: metrics.total },
    { id: 'history', label: 'History', count: events.length },
    { id: 'settings', label: 'Settings' }
  ];

  const onTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const index = tabs.findIndex((tab) => tab.id === activeTab);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setActiveTab(next.id);
    document.getElementById(`at-tab-${next.id}`)?.focus();
  };

  return (
    <div className="archive-trash-container">
      <Sidebar />
      <main className="archive-trash-main" ref={scope}>
        <PageHeader title="Archive & Trash" />
        <ToastMessage message={loadError ? `Couldn't load Archive & Trash. ${loadError}` : ''} type="error" />
        <ToastMessage message={toast.text} type={toast.type || 'info'} />

        <section className="at-hero at-reveal" aria-labelledby="at-hero-title">
          <div className="at-hero-copy">
            <h2 id="at-hero-title">
              {loading ? 'Loading…' : metrics.total === 0 ? 'Nothing here right now' : (
                <><span className="at-hero-number">{metrics.total}</span> {metrics.total === 1 ? 'item' : 'items'} you can restore</>
              )}
            </h2>
            <p>Items stay here for 30 days. Restore them anytime before then.</p>
          </div>
          <dl className="at-stats">
            <div className="at-stat"><dt>Deleting this week</dt><dd>{metrics.dueSoon}</dd></div>
            <div className="at-stat"><dt>On hold</dt><dd>{metrics.onHold}</dd></div>
            <div className="at-stat"><dt>Storage used</dt><dd>{formatBytes(metrics.storageBytes)}</dd></div>
          </dl>
          {overview && (
            <button
              type="button"
              className="at-button at-button--ghost at-charts-toggle"
              aria-expanded={showCharts}
              aria-controls="at-charts"
              onClick={() => setShowCharts((value) => !value)}
            >
              <FiBarChart2 aria-hidden="true" /> {showCharts ? 'Hide charts' : 'Show charts'}
              <FiChevronDown aria-hidden="true" className={showCharts ? 'is-flipped' : ''} />
            </button>
          )}
        </section>

        {showCharts && overview && (
          <section id="at-charts" className="at-charts" aria-label="Storage and activity charts">
            <StorageGrowthChart growth={overview.file_growth || []} />
            <StorageCompositionChart databaseBytes={overview.database_bytes} buckets={overview.buckets || []} />
            <ArchiveActivityChart trend={overview.event_trend || []} />
            <DeletionCountdownChart remainingDays={decoratedItems.map((item) => item.remainingDays).filter((days) => days != null)} />
          </section>
        )}

        <section className="at-workspace at-reveal">
          <div className="at-tabs" role="tablist" aria-label="Archive & Trash views" onKeyDown={onTabKeyDown}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`at-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`at-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={`at-tab${activeTab === tab.id ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {tab.count != null && <span className="at-tab-count">{tab.count}</span>}
              </button>
            ))}
          </div>

          {activeTab === 'items' && (
            <div id="at-panel-items" role="tabpanel" aria-labelledby="at-tab-items" className="at-panel">
              <div className="at-toolbar">
                <label className="at-search">
                  <FiSearch aria-hidden="true" />
                  <span className="at-sr-only">Search items</span>
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or reason" />
                </label>
                <label className="at-select">
                  <span className="at-sr-only">Section</span>
                  <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
                    <option value="all">All sections</option>
                    {archivablePolicies.map((policy) => <option key={policy.module} value={policy.module}>{policy.label}</option>)}
                  </select>
                </label>
                <label className="at-select">
                  <span className="at-sr-only">Status</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="at-select">
                  <span className="at-sr-only">Sort</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)}>
                    {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>

              {!isSuperAdmin && filteredItems.length > 0 && (
                <p className="at-note"><FiLock aria-hidden="true" /> You can restore items. Only a Super Admin can delete them for good.</p>
              )}

              {loading ? (
                <div className="at-empty">Loading…</div>
              ) : filteredItems.length === 0 ? (
                <div className="at-empty">
                  <FiArchive aria-hidden="true" />
                  <strong>{items.length ? 'No matches' : 'Nothing here'}</strong>
                  <span>{items.length ? 'Try another search or filter.' : 'Archived and deleted items will show up here.'}</span>
                </div>
              ) : (
                <ul className="at-list" aria-label="Archived and deleted items">
                  {itemPages.items.map((item) => {
                    const history = eventsByItem.get(item.item_id) || [];
                    const expanded = expandedId === item.item_id;
                    const policy = policyByModule.get(item.module);
                    const purging = item.lifecycle.key === 'purging';
                    const deleteBlock = getDeleteBlock(item, policy, isSuperAdmin, now);
                    const hintId = `at-hint-${item.item_id}`;
                    return (
                      <li key={item.item_id} className={`at-item at-item--${item.lifecycle.key}`}>
                        <CountdownRing days={item.remainingDays} total={item.recoveryDays} />
                        <div className="at-item-main">
                          <div className="at-item-title">
                            <strong>{item.record_label}</strong>
                            <span className={`at-status at-status--${item.lifecycle.key}`}>{item.lifecycle.label}</span>
                            {policy?.is_protected && <span className="at-chip" title="Kept for a set time before it can be deleted"><FiShield aria-hidden="true" /> Protected</span>}
                          </div>
                          <span className="at-item-meta">{moduleLabel(item.module)}{item.record_context ? ` · ${item.record_context}` : ''}</span>
                          {item.reason && <span className="at-item-reason">“{item.reason}”</span>}
                          {item.purge_block_reason && (
                            <span className="at-item-hold"><FiAlertTriangle aria-hidden="true" /> On hold: {item.purge_block_reason}</span>
                          )}
                        </div>
                        <div className="at-item-when">
                          <strong className={`at-days at-days--${item.remainingDays != null && item.remainingDays <= 7 ? 'soon' : 'later'}`}>
                            {daysLeftLabel(item.remainingDays)}
                          </strong>
                          <span>Deletes {formatDate(item.purge_after)}</span>
                          <span className="at-item-by">
                            {item.disposition === 'soft_deleted' ? 'Deleted' : 'Archived'} {formatDate(item.archived_at)} by <Actor type={item.actor_type} name={item.archived_by_name} />
                          </span>
                        </div>
                        <div className="at-item-actions">
                          <div className="at-item-buttons">
                            <button
                              type="button"
                              className="at-button at-button--primary"
                              onClick={() => openDialog({ kind: 'restore', item })}
                              disabled={purging}
                              title={purging ? 'Deleting now…' : undefined}
                            >
                              <FiRotateCcw aria-hidden="true" /> Restore
                            </button>
                            <button
                              type="button"
                              className="at-button at-button--danger"
                              onClick={() => openDialog({ kind: 'purge', item })}
                              disabled={Boolean(deleteBlock)}
                              title={deleteBlock || 'Delete for good'}
                              aria-describedby={deleteBlock && isSuperAdmin ? hintId : undefined}
                            >
                              <FiTrash2 aria-hidden="true" /> Delete
                            </button>
                            <button
                              type="button"
                              className="at-button at-button--icon"
                              aria-label={`${expanded ? 'Hide' : 'Show'} history for ${item.record_label}`}
                              title={expanded ? 'Hide history' : 'Show history'}
                              aria-expanded={expanded}
                              aria-controls={`at-history-${item.item_id}`}
                              onClick={() => setExpandedId(expanded ? '' : item.item_id)}
                            >
                              <FiChevronDown aria-hidden="true" className={expanded ? 'is-flipped' : ''} />
                            </button>
                          </div>
                          {deleteBlock && isSuperAdmin && <span id={hintId} className="at-hint">{deleteBlock}</span>}
                        </div>
                        {expanded && (
                          <ol id={`at-history-${item.item_id}`} className="at-item-history">
                            {history.length === 0 && <li>No history yet.</li>}
                            {history.map((event) => (
                              <li key={event.event_id} className={`at-timeline-event at-timeline-event--${event.event_type}`}>
                                <span className="at-timeline-dot" aria-hidden="true" />
                                <strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong>
                                <span>{formatDateTime(event.occurred_at)} · {event.actor_name}</span>
                                {event.reason && <em>{event.reason}</em>}
                              </li>
                            ))}
                          </ol>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <Pagination page={itemPages.page} totalItems={itemPages.totalItems} onPageChange={itemPages.onPageChange} label="Archive & Trash pages" />
            </div>
          )}

          {activeTab === 'history' && (
            <div id="at-panel-history" role="tabpanel" aria-labelledby="at-tab-history" className="at-panel">
              <div className="at-toolbar">
                <label className="at-search">
                  <FiSearch aria-hidden="true" />
                  <span className="at-sr-only">Search history</span>
                  <input type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search by item, reason, or person" />
                </label>
                <label className="at-select">
                  <span className="at-sr-only">Action</span>
                  <select value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
                    <option value="all">All actions</option>
                    {Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="at-select">
                  <span className="at-sr-only">Section</span>
                  <select value={historyModule} onChange={(event) => setHistoryModule(event.target.value)}>
                    <option value="all">All sections</option>
                    {policies.map((policy) => <option key={policy.module} value={policy.module}>{policy.label}</option>)}
                    <option value="system">System</option>
                  </select>
                </label>
                <button type="button" className="at-button at-button--ghost at-toolbar-action" onClick={exportHistory} disabled={!filteredEvents.length}>
                  <FiDownload aria-hidden="true" /> Export CSV
                </button>
              </div>
              <p className="at-note">Every action is saved here, even after an item is deleted.</p>
              {filteredEvents.length === 0 ? (
                <div className="at-empty"><strong>No matches</strong><span>Try another search or filter.</span></div>
              ) : (
                <div className="at-table-wrap">
                  <table className="at-table">
                    <thead>
                      <tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Item</th><th scope="col">By</th><th scope="col">Reason</th></tr>
                    </thead>
                    <tbody>
                      {eventPages.items.map((event) => (
                        <tr key={event.event_id}>
                          <td data-label="When">{formatDateTime(event.occurred_at)}</td>
                          <td data-label="Action"><span className={`at-event at-event--${event.event_type}`}>{EVENT_LABELS[event.event_type] || event.event_type}</span></td>
                          <td data-label="Item"><strong>{event.record_label || '—'}</strong><span className="at-table-sub">{moduleLabel(event.module)}</span></td>
                          <td data-label="By"><Actor type={event.actor_type} name={event.actor_name} /></td>
                          <td data-label="Reason">{event.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={eventPages.page} totalItems={eventPages.totalItems} onPageChange={eventPages.onPageChange} label="History pages" />
            </div>
          )}

          {activeTab === 'settings' && (
            <div id="at-panel-settings" role="tabpanel" aria-labelledby="at-tab-settings" className="at-panel">
              <div className="at-backup">
                <div>
                  <h3><FiShield aria-hidden="true" /> Backup</h3>
                  <p>
                    {latestBackup
                      ? <>Last confirmed <strong>{formatDateTime(latestBackup)}</strong>. Only items moved here before then can be deleted.</>
                      : <>No backup confirmed yet. Nothing can be deleted until a Super Admin confirms one.</>}
                  </p>
                </div>
                <button
                  type="button"
                  className="at-button at-button--primary"
                  onClick={() => openDialog({ kind: 'backup' })}
                  disabled={!isSuperAdmin}
                  title={isSuperAdmin ? undefined : 'Only a Super Admin can confirm a backup.'}
                >
                  Confirm backup
                </button>
              </div>
              {!isSuperAdmin && <p className="at-note"><FiLock aria-hidden="true" /> Only a Super Admin can change these settings.</p>}
              <div className="at-table-wrap">
                <table className="at-table at-policies">
                  <thead>
                    <tr>
                      <th scope="col">Section</th>
                      <th scope="col">Restore window</th>
                      <th scope="col">Keep for (days)</th>
                      <th scope="col">Deleting</th>
                      {isSuperAdmin && <th scope="col"><span className="at-sr-only">Save</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map((policy) => {
                      const draft = getPolicyDraft(policy);
                      const dirty = Boolean(policyDrafts[policy.module]);
                      return (
                        <tr key={policy.module}>
                          <td data-label="Section">
                            <strong>{policy.label}</strong>
                            {policy.is_protected && <span className="at-chip"><FiShield aria-hidden="true" /> Protected</span>}
                            <span className="at-table-sub">{policy.description}</span>
                            {policy.module === 'mobile_users' && policy.inactivity_days && (
                              <span className="at-table-sub">
                                Unused for {policy.inactivity_days} days? Moved to Trash automatically (since {formatDate(policy.inactivity_tracking_since)}). Staff accounts are never affected.
                              </span>
                            )}
                          </td>
                          <td data-label="Restore window">{policy.is_archivable ? `${policy.recovery_days} days` : '—'}</td>
                          <td data-label="Keep for (days)">
                            {isSuperAdmin ? (
                              <input
                                type="number"
                                min="1"
                                max="36500"
                                className="at-input"
                                aria-label={`${policy.label}: keep for how many days`}
                                value={draft.retentionDays}
                                placeholder={policy.is_protected ? 'Required' : 'None'}
                                onChange={(event) => setPolicyDrafts((current) => ({ ...current, [policy.module]: { ...draft, retentionDays: event.target.value } }))}
                              />
                            ) : (policy.retention_days ?? (policy.is_protected ? 'Not set' : 'None'))}
                          </td>
                          <td data-label="Deleting">
                            {isSuperAdmin ? (
                              <label className="at-switch">
                                <input
                                  type="checkbox"
                                  checked={Boolean(draft.purgeEnabled)}
                                  onChange={(event) => setPolicyDrafts((current) => ({ ...current, [policy.module]: { ...draft, purgeEnabled: event.target.checked } }))}
                                />
                                <span className="at-switch-track" aria-hidden="true" />
                                <span>{draft.purgeEnabled ? 'Allowed' : 'Off'}</span>
                              </label>
                            ) : (
                              <span className={`at-status at-status--${policy.purge_enabled ? 'soft_deleted' : 'archived'}`}>{policy.purge_enabled ? 'Allowed' : 'Off'}</span>
                            )}
                          </td>
                          {isSuperAdmin && (
                            <td data-label="">
                              <button type="button" className="at-button at-button--ghost" disabled={!dirty || savingPolicy === policy.module} onClick={() => savePolicy(policy)}>
                                {savingPolicy === policy.module ? 'Saving…' : 'Save'}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <ArchiveConfirmDialog
          open={dialog?.kind === 'restore'}
          tone="restore"
          title="Restore this item?"
          description={<p>It goes back to {dialog?.item ? moduleLabel(dialog.item.module) : 'its section'} and won&apos;t be deleted.</p>}
          recordLabel={dialog?.item?.record_label}
          recordMeta={dialog?.item ? daysLeftLabel(dialog.item.remainingDays) : ''}
          showReason={false}
          confirmLabel="Restore"
          busyLabel="Restoring…"
          busy={dialogBusy}
          error={dialogError}
          onConfirm={runDialogAction}
          onClose={closeDialog}
        />
        <ArchiveConfirmDialog
          open={dialog?.kind === 'purge'}
          tone="danger"
          title="Delete forever?"
          description={<p><strong>This can&apos;t be undone.</strong> The item and its files will be erased.</p>}
          recordLabel={dialog?.item?.record_label}
          recordMeta={dialog?.item ? `${moduleLabel(dialog.item.module)} · ${dialog.item.storage_objects?.length || 0} file(s)` : ''}
          reasonLabel="Reason"
          reasonPlaceholder="e.g. Duplicate record"
          reasonRequired
          confirmPhrase="DELETE"
          confirmLabel="Delete forever"
          busyLabel="Deleting…"
          busy={dialogBusy}
          error={dialogError}
          onConfirm={runDialogAction}
          onClose={closeDialog}
        />
        <ArchiveConfirmDialog
          open={dialog?.kind === 'backup'}
          tone="archive"
          title="Confirm backup?"
          description={(
            <p>
              Only confirm after checking that today&apos;s backup exists (Supabase → Database → Backups).
              Items moved here before now can then be deleted.
            </p>
          )}
          reasonLabel="Backup note"
          reasonPlaceholder="e.g. Daily backup, Oct 17 — checked"
          reasonRequired
          confirmLabel="Confirm backup"
          busyLabel="Saving…"
          busy={dialogBusy}
          error={dialogError}
          onConfirm={runDialogAction}
          onClose={closeDialog}
        />
      </main>
    </div>
  );
}
