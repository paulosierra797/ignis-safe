import React, { useEffect, useId, useMemo, useRef } from 'react';
import {
  FiBarChart2,
  FiEye,
  FiMapPin,
  FiMinus,
  FiTrendingDown,
  FiTrendingUp,
  FiX,
} from 'react-icons/fi';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import Pagination from './Pagination';
import CloseButton from './CloseButton';
import ResponsiveSelect from './ResponsiveSelect';
import { UNSPECIFIED_BARANGAY_LABEL } from '../utils/progressService';
import { buildPrePost } from '../utils/barangayLearning';
import './BarangayLearning.css';

gsap.registerPlugin(useGSAP);

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

// Short, plain-language explanations shown on hover / keyboard focus.
const TIPS = {
  overview: 'Shows whether people in each barangay are learning from IGNIS SAFE. Numbers come from the mobile app users registered under each barangay.',
  barangay: 'The barangay the users chose when they registered in the mobile app.',
  registered: 'All mobile app accounts registered under this barangay, including those who have not started learning.',
  started: 'Users who have begun learning. Counted as registered users minus those who have not started.',
  completed: 'Users who finished the pre-assessment, learning materials, and post-assessment of every module.',
  inProgress: 'Users who have started but have not yet finished all required parts.',
  notStarted: 'The user account exists but there is no learning progress yet.',
  completionRate: 'Percentage of registered users in this barangay who completed the required learning flow.',
  preAvg: 'Average pre-assessment score, taken before learning. Only counts users who also took the post-assessment.',
  postAvg: 'Average post-assessment score, taken after learning. Only counts users who also took the pre-assessment.',
  gain: 'Post-assessment average minus pre-assessment average. A positive number means users learned something.',
};

const getInitials = (name = '') => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join('') || 'U';

const pct = (part, total) => (total > 0 ? (part / total) * 100 : 0);

/* Hover / focus explanation. Keyboard and touch users get it on focus. */
export function Tip({ text, side = 'bottom', focusable = true, className = '', children }) {
  const id = useId();
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);

  // The bubble is position: fixed and clamped to the viewport, so no scroll
  // container or overflow:hidden ancestor can cut the explanation off.
  const place = () => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    // Reset first: a containing block (e.g. container-type) can offset "fixed".
    bubble.style.left = '0px';
    bubble.style.top = '0px';
    const origin = bubble.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = bubble;
    const margin = 8;
    const gap = 8;

    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2 - width / 2, margin),
      Math.max(margin, window.innerWidth - width - margin),
    );
    const below = anchor.bottom + gap;
    const above = anchor.top - gap - height;
    const fitsBelow = below + height <= window.innerHeight - margin;
    const fitsAbove = above >= margin;
    const useAbove = side === 'top' ? (fitsAbove || !fitsBelow) : (!fitsBelow && fitsAbove);

    bubble.style.left = `${left - origin.left}px`;
    bubble.style.top = `${(useAbove ? above : below) - origin.top}px`;
  };

  return (
    <span
      ref={triggerRef}
      className={`bgy-tip ${className}`.trim()}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={id}
      onMouseEnter={place}
      onFocus={place}
    >
      {children}
      <span ref={bubbleRef} role="tooltip" id={id} className="bgy-tip-bubble">{text}</span>
    </span>
  );
}

function GainChip({ pair, compact = false }) {
  if (!pair) return <span className="bgy-gain is-none">No results yet</span>;

  const { gain } = pair;
  const tone = gain > 0 ? 'up' : gain < 0 ? 'down' : 'flat';
  const Icon = gain > 0 ? FiTrendingUp : gain < 0 ? FiTrendingDown : FiMinus;
  const sign = gain > 0 ? '+' : gain < 0 ? '−' : '';

  return (
    <span className={`bgy-gain is-${tone}${compact ? ' is-compact' : ''}`}>
      <Icon aria-hidden="true" />
      {sign}{Math.abs(gain)} pts
    </span>
  );
}

function StatusBar({ completed, inProgress, notStarted, registered }) {
  return (
    <div className="bgy-statusbar" role="img" aria-label={`${completed} completed, ${inProgress} in progress, ${notStarted} not started`}>
      <span className="bgy-seg is-completed" style={{ width: `${pct(completed, registered)}%` }} />
      <span className="bgy-seg is-progress" style={{ width: `${pct(inProgress, registered)}%` }} />
      <span className="bgy-seg is-not-started" style={{ width: `${pct(notStarted, registered)}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barangay list                                                       */
/* ------------------------------------------------------------------ */

export function BarangayOverview({
  rows,
  pagedRows,
  progressRows,
  isLoading,
  page,
  onPageChange,
  barangayOptions,
  barangayFilter,
  onFilterChange,
  onView,
}) {
  const rootRef = useRef(null);

  const prePostByBarangay = useMemo(() => new Map(
    pagedRows.map((row) => [
      row.barangay,
      buildPrePost(progressRows.filter((user) => user.barangay === row.barangay)),
    ])
  ), [pagedRows, progressRows]);

  const totals = useMemo(() => {
    const totalRegistered = rows.reduce((sum, row) => sum + row.registered, 0);
    const completed = rows.reduce((sum, row) => sum + row.completed, 0);
    const inProgress = rows.reduce((sum, row) => sum + row.inProgress, 0);
    const notStarted = rows.reduce((sum, row) => sum + row.notStarted, 0);
    const scopeUsers = barangayFilter === 'All'
      ? progressRows
      : progressRows.filter((user) => user.barangay === barangayFilter);

    return {
      registered: totalRegistered,
      completed,
      inProgress,
      notStarted,
      completionRate: totalRegistered > 0 ? Math.round((completed / totalRegistered) * 100) : 0,
      prePost: buildPrePost(scopeUsers),
    };
  }, [rows, progressRows, barangayFilter]);

  useGSAP(() => {
    if (isLoading || prefersReducedMotion()) return;

    const items = gsap.utils.toArray('.bgy-row--item');
    if (items.length === 0) return;

    gsap.timeline({ defaults: { ease: 'power2.out' } })
      .from('.bgy-summary', { autoAlpha: 0, y: 8, duration: 0.4, clearProps: 'opacity,visibility,transform' })
      .from('.bgy-summary .bgy-seg', {
        scaleX: 0, transformOrigin: 'left center', duration: 0.6, stagger: 0.08, clearProps: 'transform',
      }, '-=0.2')
      .from(items, {
        autoAlpha: 0, y: 10, duration: 0.35, stagger: 0.035, clearProps: 'opacity,visibility,transform',
      }, '-=0.4')
      .from('.bgy-rate-fill', {
        scaleX: 0, transformOrigin: 'left center', duration: 0.6, stagger: 0.03, ease: 'power3.out', clearProps: 'transform',
      }, '-=0.5');
  }, { scope: rootRef, dependencies: [isLoading, page, rows.length, barangayFilter] });

  return (
    <section className="bgy-panel" ref={rootRef} aria-labelledby="bgy-overview-title">
      <header className="bgy-panel-head">
        <h2 id="bgy-overview-title">
          <FiMapPin aria-hidden="true" />
          <Tip text={TIPS.overview}>Barangay Learning Overview</Tip>
        </h2>

        <div className="bgy-filter">
          <ResponsiveSelect
            id="bgy-filter-barangay"
            aria-label="Show barangay"
            value={barangayFilter}
            onChange={(event) => onFilterChange(event.target.value)}
            options={barangayOptions.map((value) => ({
              value,
              label: value === 'All' ? 'All barangays' : value,
            }))}
          />
          {barangayFilter !== 'All' && (
            <button
              type="button"
              className="bgy-filter-clear"
              onClick={() => onFilterChange('All')}
              aria-label="Show all barangays"
            >
              <FiX aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {!isLoading && rows.length > 0 && (
        <div className="bgy-summary">
          <div className="bgy-summary-block">
            <Tip text={TIPS.registered} className="bgy-label">Total Users</Tip>
            <strong className="bgy-summary-num">{totals.registered}</strong>
          </div>

          <div className="bgy-summary-block bgy-summary-status">
            <StatusBar {...totals} />
            <div className="bgy-legend">
              <Tip text={TIPS.completed}><span className="is-completed"><i />Completed <b>{totals.completed}</b></span></Tip>
              <Tip text={TIPS.inProgress}><span className="is-progress"><i />In progress <b>{totals.inProgress}</b></span></Tip>
              <Tip text={TIPS.notStarted}><span className="is-not-started"><i />Not started <b>{totals.notStarted}</b></span></Tip>
            </div>
          </div>

          <div className="bgy-summary-block">
            <Tip text={TIPS.completionRate} className="bgy-label">Completion rate</Tip>
            <strong className="bgy-summary-num is-green">{totals.completionRate}%</strong>
          </div>

          <div className="bgy-summary-block">
            <Tip text={TIPS.gain} className="bgy-label">Learning gain</Tip>
            <GainChip pair={totals.prePost} />
          </div>
        </div>
      )}

      <div className="bgy-table" role="table" aria-label="Barangay learning overview">
        <div className="bgy-row bgy-row--head" role="row">
          <div role="columnheader"><Tip text={TIPS.barangay}>Barangay</Tip></div>
          <div role="columnheader"><Tip text={TIPS.registered}>Total Users</Tip></div>
          <div role="columnheader"><Tip text={TIPS.completed}>Completed</Tip></div>
          <div role="columnheader"><Tip text={TIPS.inProgress}>In progress</Tip></div>
          <div role="columnheader"><Tip text={TIPS.notStarted}>Not started</Tip></div>
          <div role="columnheader"><Tip text={TIPS.completionRate}>Completion rate</Tip></div>
          <div role="columnheader"><Tip text={TIPS.gain}>Learning gain</Tip></div>
          <div role="columnheader">Action</div>
        </div>

        {isLoading ? (
          <p className="bgy-empty">Loading barangay statistics...</p>
        ) : rows.length === 0 ? (
          <p className="bgy-empty">No barangay records found.</p>
        ) : (
          pagedRows.map((row) => {
            const prePost = prePostByBarangay.get(row.barangay);

            return (
              <div
                className={`bgy-row bgy-row--item${row.barangay === UNSPECIFIED_BARANGAY_LABEL ? ' is-muted' : ''}`}
                role="row"
                key={row.barangay}
              >
                <div role="cell" className="bgy-cell-name">{row.barangay}</div>

                <div role="cell" className="bgy-cell">
                  <span className="bgy-cell-label"><Tip text={TIPS.registered}>Total Users</Tip></span>
                  <span className="bgy-count">{row.registered}</span>
                </div>
                <div role="cell" className="bgy-cell">
                  <span className="bgy-cell-label"><Tip text={TIPS.completed}>Completed</Tip></span>
                  <span className="bgy-count is-completed"><i />{row.completed}</span>
                </div>
                <div role="cell" className="bgy-cell">
                  <span className="bgy-cell-label"><Tip text={TIPS.inProgress}>In progress</Tip></span>
                  <span className="bgy-count is-progress"><i />{row.inProgress}</span>
                </div>
                <div role="cell" className="bgy-cell">
                  <span className="bgy-cell-label"><Tip text={TIPS.notStarted}>Not started</Tip></span>
                  <span className="bgy-count is-not-started"><i />{row.notStarted}</span>
                </div>
                <div role="cell" className="bgy-cell">
                  <span className="bgy-cell-label"><Tip text={TIPS.completionRate}>Completion rate</Tip></span>
                  <span className="bgy-rate">
                    <b>{row.completionRate}%</b>
                    <span className="bgy-rate-track">
                      <span className="bgy-rate-fill" style={{ width: `${Math.min(100, row.completionRate)}%` }} />
                    </span>
                  </span>
                </div>
                <div role="cell" className="bgy-cell">
                  <span className="bgy-cell-label"><Tip text={TIPS.gain}>Learning gain</Tip></span>
                  <span className="bgy-gain-cell">
                    <GainChip pair={prePost} />
                    {prePost && <small>Pre {prePost.pre}% → Post {prePost.post}%</small>}
                  </span>
                </div>

                <div role="cell" className="bgy-cell-action">
                  <button
                    type="button"
                    className="bgy-action"
                    onClick={() => onView(row.barangay)}
                    aria-label={`View learning charts for ${row.barangay}`}
                  >
                    <FiBarChart2 aria-hidden="true" />
                    <span>View charts</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isLoading && (
        <div className="bgy-pagination">
          <Pagination
            page={page}
            totalItems={rows.length}
            onPageChange={onPageChange}
            label="Barangay completion summary pages"
          />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Barangay detail                                                     */
/* ------------------------------------------------------------------ */

const DONUT_RADIUS = 52;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function Donut({ details }) {
  const { registered, completed, inProgress, notStarted } = details;
  const segments = [
    { key: 'completed', value: completed },
    { key: 'progress', value: inProgress },
    { key: 'not-started', value: notStarted },
  ];

  let offset = 0;

  return (
    <div className="bgy-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${registered} learners: ${completed} completed, ${inProgress} in progress, ${notStarted} not started`}>
        <circle className="bgy-donut-track" cx="60" cy="60" r={DONUT_RADIUS} />
        {registered > 0 && segments.map((segment) => {
          const length = (segment.value / registered) * DONUT_CIRCUMFERENCE;
          const circle = (
            <circle
              key={segment.key}
              className={`bgy-donut-seg is-${segment.key}`}
              cx="60"
              cy="60"
              r={DONUT_RADIUS}
              strokeDasharray={`${length} ${DONUT_CIRCUMFERENCE - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return segment.value > 0 ? circle : null;
        })}
      </svg>
      <div className="bgy-donut-center">
        <strong>{registered}</strong>
        <span>learners</span>
      </div>
    </div>
  );
}

function ColumnChart({ columns }) {
  return (
    <div className="bgy-plot">
      <div className="bgy-plot-area">
        {[100, 50, 0].map((value) => (
          <i key={value} className="bgy-plot-line" style={{ bottom: `${value}%` }}><span>{value}</span></i>
        ))}
        <div className="bgy-plot-cols">
          {columns.map((column) => (
            <div className="bgy-plot-col" key={column.label}>
              <span className={`bgy-vbar is-${column.tone}`} style={{ height: `${column.value}%` }}>
                <b>{column.value}%</b>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bgy-plot-names">
        {columns.map((column) => <span key={column.label}>{column.label}</span>)}
      </div>
    </div>
  );
}

function getVerdict(prePost) {
  if (!prePost) {
    return {
      tone: 'none',
      title: 'Not enough results yet',
      text: 'No learner here has finished both a pre- and a post-assessment.',
    };
  }

  const moved = `Average score went from ${prePost.pre}% to ${prePost.post}%`;
  if (prePost.gain > 0) return { tone: 'up', title: 'This barangay is learning', text: `${moved}.` };
  if (prePost.gain < 0) return { tone: 'down', title: 'Scores went down', text: `${moved}.` };
  return { tone: 'flat', title: 'No change in scores yet', text: `${moved}.` };
}

export function BarangayDetailModal({ details, onClose, onViewUser }) {
  const modalRef = useRef(null);
  const verdict = getVerdict(details.prePost);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useGSAP(() => {
    if (prefersReducedMotion()) return;

    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .from(modalRef.current, { autoAlpha: 0, y: 18, scale: 0.985, duration: 0.4, clearProps: 'opacity,visibility,transform' })
      .from('.bgy-modal-icon, .bgy-modal-heading', { autoAlpha: 0, y: 8, duration: 0.35, stagger: 0.06, clearProps: 'opacity,visibility,transform' }, '-=0.25')
      .from('.bgy-reveal', { autoAlpha: 0, y: 10, duration: 0.4, stagger: 0.06, clearProps: 'opacity,visibility,transform' }, '-=0.2')
      .from('.bgy-vbar', { scaleY: 0, transformOrigin: 'bottom center', duration: 0.7, stagger: 0.1, clearProps: 'transform' }, '-=0.3')
      .from('.bgy-hbar-fill', { scaleX: 0, transformOrigin: 'left center', duration: 0.6, stagger: 0.04, clearProps: 'transform' }, '-=0.6')
      .from('.bgy-donut-seg', { autoAlpha: 0, duration: 0.5, stagger: 0.12, clearProps: 'opacity,visibility' }, '-=0.6');
  }, { scope: modalRef, dependencies: [details.barangay] });

  const stats = [
    { key: 'registered', label: 'Total learners', tip: TIPS.registered, value: details.registered },
    { key: 'started', label: 'Started', tip: TIPS.started, value: details.started },
    { key: 'inProgress', label: 'In progress', tip: TIPS.inProgress, value: details.inProgress, tone: 'progress' },
    { key: 'completed', label: 'Completed', tip: TIPS.completed, value: details.completed, tone: 'completed' },
    { key: 'notStarted', label: 'Not started', tip: TIPS.notStarted, value: details.notStarted, tone: 'muted' },
    { key: 'rate', label: 'Completion rate', tip: TIPS.completionRate, value: `${details.completionRate}%`, tone: 'completed' },
    { key: 'pre', label: 'Pre-assessment average', tip: TIPS.preAvg, value: details.prePost ? `${details.prePost.pre}%` : '—' },
    { key: 'post', label: 'Post-assessment average', tip: TIPS.postAvg, value: details.prePost ? `${details.prePost.post}%` : '—', tone: 'brand' },
  ];

  const modulesWithResults = details.modulePerformance.filter((module) => module.prePost);

  return (
    <div className="progress-modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="progress-modal bgy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bgy-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bgy-modal-head">
          <span className="bgy-modal-icon" aria-hidden="true"><FiMapPin /></span>
          <div className="bgy-modal-heading">
            <span className="bgy-modal-eyebrow">Barangay Details</span>
            <h2 id="bgy-modal-title">{details.barangay}</h2>
            <p>Is this barangay learning from IGNIS SAFE?</p>
          </div>
          <CloseButton
            className="bgy-modal-close"
            onClick={onClose}
            label="Close barangay details"
          />
        </div>

        <div className="progress-modal-content bgy-modal-body">
          <section className={`bgy-verdict is-${verdict.tone} bgy-reveal`} aria-live="polite">
            <span className="bgy-verdict-icon" aria-hidden="true">
              {verdict.tone === 'up' && <FiTrendingUp />}
              {verdict.tone === 'down' && <FiTrendingDown />}
              {(verdict.tone === 'flat' || verdict.tone === 'none') && <FiMinus />}
            </span>
            <div>
              <strong>{verdict.title}</strong>
              <p>{verdict.text}</p>
            </div>
          </section>

          <section className="bgy-stats bgy-reveal" aria-label="Barangay summary">
            {stats.map((stat) => (
              <div className="bgy-stat" key={stat.key}>
                <Tip text={stat.tip} className="bgy-label">{stat.label}</Tip>
                <strong className={stat.tone ? `is-${stat.tone}` : ''}>{stat.value}</strong>
              </div>
            ))}
            <div className="bgy-stat">
              <Tip text={TIPS.gain} className="bgy-label">Learning improvement</Tip>
              <GainChip pair={details.prePost} />
            </div>
          </section>

          <div className="bgy-charts bgy-reveal">
            <section className="bgy-chart" aria-label="Pre-assessment compared with post-assessment">
              <h3>Pre-test vs post-test</h3>
              {details.prePost ? (
                <>
                  <ColumnChart
                    columns={[
                      { label: 'Pre-assessment', value: details.prePost.pre, tone: 'pre' },
                      { label: 'Post-assessment', value: details.prePost.post, tone: 'post' },
                    ]}
                  />
                  <p className="bgy-chart-note">Based on {details.prePost.learners} {details.prePost.learners === 1 ? 'learner' : 'learners'} who took both tests.</p>
                </>
              ) : (
                <p className="bgy-empty">No one has finished both tests yet.</p>
              )}
            </section>

            <section className="bgy-chart" aria-label="Learner status">
              <h3>Where learners are now</h3>
              <div className="bgy-status-chart">
                <Donut details={details} />
                <ul className="bgy-legend bgy-legend--stack">
                  <li className="is-completed"><i />Completed <b>{details.completed}</b></li>
                  <li className="is-progress"><i />In progress <b>{details.inProgress}</b></li>
                  <li className="is-not-started"><i />Not started <b>{details.notStarted}</b></li>
                </ul>
              </div>
            </section>
          </div>

          <section className="bgy-chart bgy-reveal" aria-label="Pre-assessment and post-assessment results by module">
            <div className="bgy-chart-head">
              <h3>Results by module</h3>
              <div className="bgy-key" aria-hidden="true">
                <span className="is-pre"><i />Pre</span>
                <span className="is-post"><i />Post</span>
              </div>
            </div>
            {modulesWithResults.length === 0 ? (
              <p className="bgy-empty">No module has both pre- and post-assessment results yet.</p>
            ) : (
              <ul className="bgy-modules">
                {modulesWithResults.map((module) => (
                  <li key={module.name}>
                    <div className="bgy-module-head">
                      <span title={module.name}>{module.name}</span>
                      <GainChip pair={module.prePost} compact />
                    </div>
                    <div className="bgy-hbar">
                      <em>Pre</em>
                      <span className="bgy-hbar-track"><span className="bgy-hbar-fill is-pre" style={{ width: `${module.prePost.pre}%` }} /></span>
                      <b>{module.prePost.pre}%</b>
                    </div>
                    <div className="bgy-hbar">
                      <em>Post</em>
                      <span className="bgy-hbar-track"><span className="bgy-hbar-fill is-post" style={{ width: `${module.prePost.post}%` }} /></span>
                      <b>{module.prePost.post}%</b>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bgy-chart bgy-reveal" aria-label="Mobile users">
            <div className="bgy-chart-head">
              <h3>Learners</h3>
              <span className="bgy-chart-count">{details.registered} total</span>
            </div>
            {details.users.length === 0 ? (
              <p className="bgy-empty">No mobile users are registered under this barangay.</p>
            ) : (
              <ul className="bgy-members">
                {details.users.map((user) => (
                  <li className="bgy-member" key={user.id}>
                    <span className="bgy-member-avatar" aria-hidden="true">{getInitials(user.name)}</span>
                    <span className="bgy-member-name">
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </span>
                    <span className={`bgy-member-status is-${user.completionStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                      {user.completionStatus}
                    </span>
                    <span className="bgy-member-progress">
                      <b>{user.overallPercent}%</b>
                      <span className="bgy-rate-track"><span className="bgy-rate-fill" style={{ width: `${Math.min(100, user.overallPercent)}%` }} /></span>
                    </span>
                    <button
                      type="button"
                      className="bgy-member-view"
                      onClick={() => onViewUser(user)}
                      aria-label={`View learning profile for ${user.name}`}
                    >
                      <FiEye aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
