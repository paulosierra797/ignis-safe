import React, { useRef } from 'react';
import { FiEye, FiTrash2, FiUsers, FiX } from 'react-icons/fi';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import Pagination from './Pagination';
import ResponsiveSelect from './ResponsiveSelect';
import { Tip } from './BarangayLearning';
import { OUTSIDE_DASMARINAS_LOCATION } from '../utils/mobileUserLocation';
import { UNSPECIFIED_BARANGAY_LABEL } from '../utils/progressService';
import './BarangayLearning.css';
import './UserList.css';

gsap.registerPlugin(useGSAP);

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

// Display only: the stored value stays "Outside Dasmariñas City".
const getBarangayLabel = (barangay) => (
  barangay === OUTSIDE_DASMARINAS_LOCATION ? 'Outside Dasma' : barangay
);

// Progress counts the three required activities only. Optional 3D
// simulations never add to, or take away from, completion.
const PROGRESS_RULE = 'Each module is worth 100%, split equally between its Pre-Assessment, Learning Materials, and Post-Assessment. Optional 3D Simulations are not counted.';

const TIPS = {
  list: 'Mobile app users and how far they are in the required learning flow.',
  name: 'The user’s full name and email address.',
  barangay: 'The barangay the user chose when registering. “Outside Dasma” means outside Dasmariñas City.',
  modules: 'Modules finished out of all modules. A module is finished when its Pre-Assessment, Learning Materials, and Post-Assessment are all done.',
  overall: `Average completion across all modules. ${PROGRESS_RULE}`,
  lastActivity: 'The latest date activity was recorded for this account.',
  actions: 'View a user’s details, or move the account to Trash.',
  view: 'View this user’s details and learning history.',
  trash: 'Move this account to Trash. It can be restored within 30 days.',
};

export default function UserList({
  rows,
  pagedRows,
  totalUsers,
  isLoading,
  page,
  onPageChange,
  searchQuery,
  onSearchChange,
  barangayOptions,
  barangayFilter,
  onBarangayChange,
  moduleOptions,
  moduleFilter,
  onModuleChange,
  completionOptions,
  completionFilter,
  onCompletionChange,
  hasActiveFilters,
  onClear,
  onView,
  onTrash,
  formatDate,
}) {
  const rootRef = useRef(null);

  useGSAP(() => {
    if (isLoading || prefersReducedMotion()) return;

    const items = gsap.utils.toArray('.usr-row--item');
    if (items.length === 0) return;

    gsap.timeline({ defaults: { ease: 'power2.out' } })
      .from(items, {
        autoAlpha: 0, y: 10, duration: 0.35, stagger: 0.035, clearProps: 'opacity,visibility,transform',
      })
      .from('.usr-row--item .bgy-rate-fill', {
        scaleX: 0, transformOrigin: 'left center', duration: 0.6, stagger: 0.03, ease: 'power3.out', clearProps: 'transform',
      }, '-=0.5');
  }, { scope: rootRef, dependencies: [isLoading, page, rows.length] });

  return (
    <section className="bgy-panel usr-panel" ref={rootRef} aria-labelledby="usr-list-title">
      <header className="bgy-panel-head">
        <h2 id="usr-list-title">
          <FiUsers aria-hidden="true" />
          <Tip text={TIPS.list}>User List</Tip>
        </h2>
        <span className="usr-count">
          {rows.length === totalUsers ? `${totalUsers} users` : `${rows.length} of ${totalUsers} users`}
        </span>
      </header>

      <div className="usr-filters">
        <input
          id="usr-search"
          type="search"
          className="usr-search"
          aria-label="Search users"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, email, or barangay"
          autoComplete="off"
        />
        <ResponsiveSelect
          id="usr-filter-barangay"
          aria-label="Barangay"
          value={barangayFilter}
          onChange={(event) => onBarangayChange(event.target.value)}
          options={barangayOptions.map((value) => ({
            value,
            label: value === 'All' ? 'All barangays' : getBarangayLabel(value),
          }))}
        />
        <ResponsiveSelect
          id="usr-filter-module"
          aria-label="Module"
          value={moduleFilter}
          onChange={(event) => onModuleChange(event.target.value)}
          options={moduleOptions.map((value) => ({
            value,
            label: value === 'All' ? 'All modules' : value,
          }))}
        />
        <ResponsiveSelect
          id="usr-filter-completion"
          aria-label="Overall progress"
          value={completionFilter}
          onChange={(event) => onCompletionChange(event.target.value)}
          options={completionOptions.map((value) => ({
            value,
            label: value === 'All' ? 'All progress' : value,
          }))}
        />
        {hasActiveFilters && (
          <button
            type="button"
            className="bgy-filter-clear"
            onClick={onClear}
            aria-label="Clear filters"
            title="Clear filters"
          >
            <FiX aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="bgy-table" role="table" aria-label="User list">
        <div className="usr-row usr-row--head" role="row">
          <div role="columnheader"><Tip text={TIPS.name}>Name</Tip></div>
          <div role="columnheader"><Tip text={TIPS.barangay}>Barangay</Tip></div>
          <div role="columnheader"><Tip text={TIPS.modules}>Module Progress</Tip></div>
          <div role="columnheader"><Tip text={TIPS.overall}>Overall Progress</Tip></div>
          <div role="columnheader"><Tip text={TIPS.lastActivity}>Last Activity</Tip></div>
          <div role="columnheader" className="usr-head-action"><Tip text={TIPS.actions}>Actions</Tip></div>
        </div>

        {isLoading ? (
          <p className="bgy-empty">Loading progress...</p>
        ) : rows.length === 0 ? (
          <p className="bgy-empty">No progress records found.</p>
        ) : (
          pagedRows.map((item) => (
            <div
              className={`usr-row usr-row--item${item.barangay === UNSPECIFIED_BARANGAY_LABEL ? ' is-muted' : ''}`}
              role="row"
              key={item.id}
            >
              <div role="cell" className="usr-cell-name">
                <strong>{item.name}</strong>
                <small>{item.email}</small>
              </div>

              <div role="cell" className="usr-cell">
                <span className="usr-cell-label"><Tip text={TIPS.barangay}>Barangay</Tip></span>
                <span className="usr-text">{getBarangayLabel(item.barangay)}</span>
              </div>

              <div role="cell" className="usr-cell">
                <span className="usr-cell-label"><Tip text={TIPS.modules}>Module Progress</Tip></span>
                <Tip
                  text={`${item.modulesCompleted} of ${item.modules.length} modules finished (Pre-Assessment, Learning Materials, and Post-Assessment all done).`}
                  focusable={false}
                >
                  <span className="usr-text">{item.moduleProgress}</span>
                </Tip>
              </div>

              <div role="cell" className="usr-cell">
                <span className="usr-cell-label"><Tip text={TIPS.overall}>Overall Progress</Tip></span>
                <Tip className="usr-fill" text={`${item.overallPercent}% overall. ${PROGRESS_RULE}`} focusable={false}>
                  <span className="bgy-rate">
                    <b>{item.overallPercent}%</b>
                    <span className="bgy-rate-track">
                      <span className="bgy-rate-fill" style={{ width: `${Math.min(100, item.overallPercent)}%` }} />
                    </span>
                  </span>
                </Tip>
              </div>

              <div role="cell" className="usr-cell">
                <span className="usr-cell-label"><Tip text={TIPS.lastActivity}>Last Activity</Tip></span>
                <span className="usr-text">{formatDate(item.lastActivityAt)}</span>
              </div>

              <div role="cell" className="usr-cell-action">
                <Tip text={TIPS.view} side="top" focusable={false}>
                  <button
                    type="button"
                    className="bgy-action"
                    onClick={() => onView(item)}
                    aria-label={`View details for ${item.name}`}
                  >
                    <FiEye aria-hidden="true" />
                  </button>
                </Tip>
                <Tip text={TIPS.trash} side="top" focusable={false}>
                  <button
                    type="button"
                    className="bgy-action usr-action--danger"
                    onClick={() => onTrash(item)}
                    aria-label={`Move ${item.name} to Trash`}
                  >
                    <FiTrash2 aria-hidden="true" />
                  </button>
                </Tip>
              </div>
            </div>
          ))
        )}
      </div>

      {!isLoading && (
        <div className="bgy-pagination">
          <Pagination
            page={page}
            totalItems={rows.length}
            onPageChange={onPageChange}
            label="Learning profile pages"
          />
        </div>
      )}
    </section>
  );
}
