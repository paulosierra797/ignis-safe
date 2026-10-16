import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  FiAlertTriangle, FiArchive, FiChevronDown, FiClock, FiCpu, FiDatabase, FiDownload,
  FiHardDrive, FiRotateCcw, FiSearch, FiShield, FiTrash2, FiUser
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

const EVENT_LABELS = {
  archived: 'Archived',
  soft_deleted: 'Moved to Trash',
  restored: 'Restored',
  purged: 'Permanently deleted',
  deleted: 'Deleted directly',
  purge_blocked: 'Deletion on hold',
  purge_failed: 'Deletion failed',
  policy_updated: 'Policy updated',
  backup_confirmed: 'Backup confirmed'
};

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'archived', label: 'Archived' },
  { value: 'soft_deleted', label: 'In Trash' },
  { value: 'due', label: 'Awaiting cleanup' },
  { value: 'queued', label: 'Queued for deletion' },
  { value: 'blocked', label: 'Deletion on hold' }
];

const SORTS = [
  { value: 'deletion', label: 'Deletion date (soonest)' },
  { value: 'newest', label: 'Archived (newest)' },
  { value: 'oldest', label: 'Archived (oldest)' },
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

function CountdownRing({ days, total }) {
  const ratio = days == null ? 0 : Math.min(1, Math.max(0, days / Math.max(total, 1)));
  const tone = days == null || days <= 2 ? 'critical' : days <= 7 ? 'warning' : 'calm';
  return (
    <div className={`at-ring at-ring--${tone}`} role="img" aria-label={days == null ? 'Deletion date unknown' : `${days} of ${total} recovery days left`}>
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

function ActorPill({ type, name }) {
  const Icon = type === 'system' ? FiCpu : FiUser;
  const label = type === 'system' ? 'System' : type === 'user' ? 'User' : 'Admin';
  return (
    <span className={`at-actor at-actor--${type || 'admin'}`}>
      <Icon aria-hidden="true" />
      <span className="at-actor-type">{label}</span>
      {type !== 'system' && name && <span className="at-actor-name">{name}</span>}
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
  const [activeTab, setActiveTab] = useState('trash');
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
      autoDeleted: decoratedItems.filter((item) => item.module === 'mobile_users' && item.actor_type === 'system').length,
      databaseBytes: Number(overview?.database_bytes) || 0,
      fileBytes
    };
  }, [decoratedItems, overview]);

  const latestBackup = useMemo(() => archivablePolicies
    .map((policy) => policy.backup_confirmed_at)
    .filter(Boolean)
    .sort()
    .pop() || null, [archivablePolicies]);

  // Entrance and countdown motion; respects reduced-motion preferences.
  useGSAP(() => {
    if (loading) return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.at-reveal', { y: 14, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope, dependencies: [loading] });

  const pageKey = itemPages.items.map((item) => item.item_id).join(',');
  useGSAP(() => {
    if (loading || activeTab !== 'trash') return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.at-item', { y: 10, opacity: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out', clearProps: 'transform,opacity' });
      gsap.from('.at-ring-progress', { strokeDashoffset: RING_CIRCUMFERENCE, duration: 0.9, stagger: 0.04, ease: 'power2.out' });
    });
    return () => media.revert();
  }, { scope, dependencies: [loading, activeTab, pageKey] });

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.at-panel', { y: 8, opacity: 0, duration: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' });
    });
    return () => media.revert();
  }, { scope, dependencies: [activeTab], revertOnUpdate: true });

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
        setToast({ type: 'success', text: `"${dialog.item.record_label}" was restored. Its scheduled deletion is cancelled.` });
      } else if (dialog.kind === 'purge') {
        await purgeArchiveItem(dialog.item.item_id, reason);
        setToast({ type: 'success', text: `"${dialog.item.record_label}" was permanently deleted. The deletion is recorded in History.` });
      } else if (dialog.kind === 'backup') {
        await confirmArchiveBackup(reason);
        setToast({ type: 'success', text: 'Backup confirmation recorded. Items archived before now may be purged once all other checks pass.' });
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
      setToast({ type: 'success', text: `${policy.label} retention policy saved.` });
      await loadAll();
    } catch (error) {
      setToast({ type: 'error', text: error.message });
    } finally {
      setSavingPolicy('');
    }
  };

  const exportHistory = () => {
    const header = ['Date', 'Event', 'Module', 'Record', 'By', 'Actor type', 'Reason'];
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
    { id: 'trash', label: 'Trash', count: metrics.total },
    { id: 'history', label: 'History', count: events.length },
    { id: 'policies', label: 'Retention policies' }
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
        <ToastMessage message={loadError ? `Failed to load Archive & Trash: ${loadError}` : ''} type="error" />
        <ToastMessage message={toast.text} type={toast.type || 'info'} />

        <section className="at-hero at-reveal" aria-labelledby="at-hero-title">
          <div className="at-hero-copy">
            <span className="at-eyebrow"><FiShield aria-hidden="true" /> Storage &amp; recovery</span>
            <h2 id="at-hero-title">
              {loading ? 'Loading archived records…' : (
                <><span className="at-hero-number">{metrics.total}</span> {metrics.total === 1 ? 'record is' : 'records are'} recoverable</>
              )}
            </h2>
            <p>
              Archived and deleted records stay recoverable for 30 days. After that, permanent deletion runs
              only when retention, dependency, backup, and file checks all pass. Every step is logged.
            </p>
          </div>
          <dl className="at-metrics">
            <div className="at-metric"><dt><FiClock aria-hidden="true" /> Deleting within 7 days</dt><dd>{metrics.dueSoon}</dd></div>
            <div className="at-metric"><dt><FiAlertTriangle aria-hidden="true" /> On hold</dt><dd>{metrics.onHold}</dd></div>
            <div className="at-metric"><dt><FiCpu aria-hidden="true" /> Auto-removed inactive accounts</dt><dd>{metrics.autoDeleted}</dd></div>
            <div className="at-metric"><dt><FiDatabase aria-hidden="true" /> Database</dt><dd>{formatBytes(metrics.databaseBytes)}</dd></div>
            <div className="at-metric"><dt><FiHardDrive aria-hidden="true" /> File storage</dt><dd>{formatBytes(metrics.fileBytes)}</dd></div>
          </dl>
        </section>

        {!loading && overview && (
          <section className="at-charts at-reveal" aria-label="Storage and archive charts">
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

          {activeTab === 'trash' && (
            <div id="at-panel-trash" role="tabpanel" aria-labelledby="at-tab-trash" className="at-panel">
              <div className="at-toolbar">
                <label className="at-field at-field--search">
                  <span>Search</span>
                  <span className="at-search">
                    <FiSearch aria-hidden="true" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, reason, or admin" />
                  </span>
                </label>
                <label className="at-field">
                  <span>Module</span>
                  <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
                    <option value="all">All modules</option>
                    {archivablePolicies.map((policy) => <option key={policy.module} value={policy.module}>{policy.label}</option>)}
                  </select>
                </label>
                <label className="at-field">
                  <span>Status</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="at-field">
                  <span>Sort by</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)}>
                    {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>

              {loading ? (
                <div className="at-empty">Loading archived records…</div>
              ) : filteredItems.length === 0 ? (
                <div className="at-empty">
                  <FiArchive aria-hidden="true" />
                  <strong>{items.length ? 'No records match these filters.' : 'Archive & Trash is empty.'}</strong>
                  <span>{items.length ? 'Try a different search or filter.' : 'Archived records from any module will appear here.'}</span>
                </div>
              ) : (
                <ul className="at-list" aria-label="Archived and deleted records">
                  {itemPages.items.map((item) => {
                    const history = eventsByItem.get(item.item_id) || [];
                    const expanded = expandedId === item.item_id;
                    const protectedModule = policyByModule.get(item.module)?.is_protected;
                    return (
                      <li key={item.item_id} className={`at-item at-item--${item.lifecycle.key}`}>
                        <CountdownRing days={item.remainingDays} total={item.recoveryDays} />
                        <div className="at-item-main">
                          <div className="at-item-title">
                            <strong>{item.record_label}</strong>
                            <span className="at-module">{moduleLabel(item.module)}</span>
                            {protectedModule && <span className="at-protected" title="Retention-protected record"><FiShield aria-hidden="true" /> Protected</span>}
                          </div>
                          {item.record_context && <span className="at-item-context">{item.record_context}</span>}
                          <span className="at-item-reason">{item.reason || 'No reason provided'}</span>
                          {item.purge_block_reason && (
                            <span className="at-item-hold"><FiAlertTriangle aria-hidden="true" /> {item.purge_block_reason}</span>
                          )}
                        </div>
                        <dl className="at-item-facts">
                          <div><dt>{item.disposition === 'soft_deleted' ? 'Deleted by' : 'Archived by'}</dt><dd><ActorPill type={item.actor_type} name={item.archived_by_name} /></dd></div>
                          <div><dt>Date</dt><dd>{formatDateTime(item.archived_at)}</dd></div>
                          <div><dt>Permanent deletion</dt><dd>{formatDate(item.purge_after)}</dd></div>
                          <div><dt>Status</dt><dd><span className={`at-status at-status--${item.lifecycle.key}`}>{item.lifecycle.label}</span></dd></div>
                        </dl>
                        <div className="at-item-actions">
                          <button
                            type="button"
                            className="at-button at-button--restore"
                            onClick={() => { setDialogError(''); setDialog({ kind: 'restore', item }); }}
                            disabled={item.lifecycle.key === 'purging'}
                          >
                            <FiRotateCcw aria-hidden="true" /> Restore
                          </button>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              className="at-button at-button--danger"
                              onClick={() => { setDialogError(''); setDialog({ kind: 'purge', item }); }}
                              disabled={item.lifecycle.key === 'purging'}
                            >
                              <FiTrash2 aria-hidden="true" /> Delete permanently
                            </button>
                          )}
                          <button
                            type="button"
                            className="at-button at-button--ghost"
                            aria-expanded={expanded}
                            aria-controls={`at-history-${item.item_id}`}
                            onClick={() => setExpandedId(expanded ? '' : item.item_id)}
                          >
                            History <FiChevronDown aria-hidden="true" className={expanded ? 'is-flipped' : ''} />
                          </button>
                        </div>
                        {expanded && (
                          <ol id={`at-history-${item.item_id}`} className="at-item-history">
                            {history.length === 0 && <li>No events recorded yet.</li>}
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
                <label className="at-field at-field--search">
                  <span>Search</span>
                  <span className="at-search">
                    <FiSearch aria-hidden="true" />
                    <input type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Record, reason, or actor" />
                  </span>
                </label>
                <label className="at-field">
                  <span>Event</span>
                  <select value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
                    <option value="all">All events</option>
                    {Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="at-field">
                  <span>Module</span>
                  <select value={historyModule} onChange={(event) => setHistoryModule(event.target.value)}>
                    <option value="all">All modules</option>
                    {policies.map((policy) => <option key={policy.module} value={policy.module}>{policy.label}</option>)}
                    <option value="system">System</option>
                  </select>
                </label>
                <button type="button" className="at-button at-button--ghost at-toolbar-action" onClick={exportHistory} disabled={!filteredEvents.length}>
                  <FiDownload aria-hidden="true" /> Export CSV
                </button>
              </div>
              <p className="at-note">
                History is append-only and is kept after records are permanently deleted, so every archive, restore, and deletion stays auditable.
              </p>
              {filteredEvents.length === 0 ? (
                <div className="at-empty"><strong>No events match these filters.</strong></div>
              ) : (
                <div className="at-table-wrap">
                  <table className="at-table">
                    <thead>
                      <tr><th scope="col">Date &amp; time</th><th scope="col">Event</th><th scope="col">Record</th><th scope="col">By</th><th scope="col">Reason</th></tr>
                    </thead>
                    <tbody>
                      {eventPages.items.map((event) => (
                        <tr key={event.event_id}>
                          <td data-label="Date & time">{formatDateTime(event.occurred_at)}</td>
                          <td data-label="Event"><span className={`at-event at-event--${event.event_type}`}>{EVENT_LABELS[event.event_type] || event.event_type}</span></td>
                          <td data-label="Record"><strong>{event.record_label || '—'}</strong><span className="at-table-sub">{moduleLabel(event.module)}</span></td>
                          <td data-label="By"><ActorPill type={event.actor_type} name={event.actor_name} /></td>
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

          {activeTab === 'policies' && (
            <div id="at-panel-policies" role="tabpanel" aria-labelledby="at-tab-policies" className="at-panel">
              <div className="at-backup">
                <div>
                  <h3><FiShield aria-hidden="true" /> Backup verification</h3>
                  <p>
                    {latestBackup
                      ? <>Last confirmed backup: <strong>{formatDateTime(latestBackup)}</strong>. Only records archived before this time can be permanently deleted.</>
                      : <>No backup has been confirmed. Permanent deletion stays disabled for every module until a Super Admin confirms one.</>}
                  </p>
                </div>
                {isSuperAdmin && (
                  <button type="button" className="at-button at-button--primary" onClick={() => { setDialogError(''); setDialog({ kind: 'backup' }); }}>
                    Confirm backup
                  </button>
                )}
              </div>
              {!isSuperAdmin && <p className="at-note">Retention policies can only be changed by a Super Admin.</p>}
              <div className="at-table-wrap">
                <table className="at-table at-policies">
                  <thead>
                    <tr><th scope="col">Module</th><th scope="col">Recovery</th><th scope="col">Retention (days)</th><th scope="col">Permanent deletion</th>{isSuperAdmin && <th scope="col"><span className="at-sr-only">Save</span></th>}</tr>
                  </thead>
                  <tbody>
                    {policies.map((policy) => {
                      const draft = getPolicyDraft(policy);
                      const dirty = Boolean(policyDrafts[policy.module]);
                      return (
                        <Fragment key={policy.module}>
                          <tr>
                            <td data-label="Module">
                              <strong>{policy.label}</strong>
                              {policy.is_protected && <span className="at-protected"><FiShield aria-hidden="true" /> Protected</span>}
                              <span className="at-table-sub">{policy.description}</span>
                              {policy.module === 'mobile_users' && policy.inactivity_days && (
                                <span className="at-table-sub">Inactive for {policy.inactivity_days} days → Trash automatically (tracked since {formatDate(policy.inactivity_tracking_since)}). Admin, Super Admin, and Personnel accounts are never removed for inactivity.</span>
                              )}
                            </td>
                            <td data-label="Recovery">{policy.is_archivable ? `${policy.recovery_days} days` : '—'}</td>
                            <td data-label="Retention (days)">
                              {isSuperAdmin ? (
                                <input
                                  type="number"
                                  min="1"
                                  max="36500"
                                  className="at-input"
                                  aria-label={`${policy.label} retention in days`}
                                  value={draft.retentionDays}
                                  placeholder={policy.is_protected ? 'Required' : 'None'}
                                  onChange={(event) => setPolicyDrafts((current) => ({ ...current, [policy.module]: { ...draft, retentionDays: event.target.value } }))}
                                />
                              ) : (policy.retention_days ?? (policy.is_protected ? 'Not approved' : 'None'))}
                            </td>
                            <td data-label="Permanent deletion">
                              {isSuperAdmin ? (
                                <label className="at-switch">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(draft.purgeEnabled)}
                                    onChange={(event) => setPolicyDrafts((current) => ({ ...current, [policy.module]: { ...draft, purgeEnabled: event.target.checked } }))}
                                  />
                                  <span className="at-switch-track" aria-hidden="true" />
                                  <span>{draft.purgeEnabled ? 'Approved' : 'Disabled'}</span>
                                </label>
                              ) : (
                                <span className={`at-status at-status--${policy.purge_enabled ? 'archived' : 'blocked'}`}>{policy.purge_enabled ? 'Approved' : 'Disabled'}</span>
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
                        </Fragment>
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
          title="Restore this record?"
          description={<p>The record returns to its module with its previous state, and the scheduled permanent deletion is cancelled.</p>}
          recordLabel={dialog?.item?.record_label}
          recordMeta={dialog?.item ? `${moduleLabel(dialog.item.module)} · deletion was scheduled for ${formatDate(dialog.item.purge_after)}` : ''}
          reasonLabel="Restore note"
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
          title="Permanently delete this record?"
          description={(
            <>
              <p><strong>This cannot be undone.</strong> The record and its stored files are erased and cannot be recovered from Archive &amp; Trash.</p>
              <p>The server refuses the deletion unless the module&apos;s deletion is approved, retention has elapsed, a backup was confirmed after this record was archived, and no protected history depends on it.</p>
            </>
          )}
          recordLabel={dialog?.item?.record_label}
          recordMeta={dialog?.item ? `${moduleLabel(dialog.item.module)} · ${dialog.item.storage_objects?.length || 0} attached file(s)` : ''}
          reasonLabel="Reason for permanent deletion"
          reasonRequired
          confirmPhrase="DELETE"
          confirmLabel="Delete permanently"
          busyLabel="Deleting…"
          busy={dialogBusy}
          error={dialogError}
          onConfirm={runDialogAction}
          onClose={closeDialog}
        />
        <ArchiveConfirmDialog
          open={dialog?.kind === 'backup'}
          tone="archive"
          title="Confirm a current backup?"
          description={(
            <p>
              Confirm only after verifying that a database and Storage backup exists as of now (for example in the
              Supabase dashboard under Database → Backups). Records archived before this moment become eligible for
              permanent deletion once their other checks pass.
            </p>
          )}
          reasonLabel="Backup reference"
          reasonPlaceholder="e.g. Daily backup Oct 16, 2026 verified in Supabase"
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
