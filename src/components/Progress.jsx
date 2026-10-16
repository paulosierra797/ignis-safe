import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiBookOpen,
  FiCheckCircle,
  FiChevronDown,
  FiMail,
  FiStar,
} from 'react-icons/fi';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useUser } from '../context/UserContext';
import Sidebar from './Sidebar';
import UserList from './UserList';
import PageHeader from './PageHeader';
import CloseButton from './CloseButton';
import ToastMessage from './ToastMessage';
import ArchiveConfirmDialog from './ArchiveConfirmDialog';
import { archiveRecord } from '../utils/archiveService';
import { BarangayDetailModal, BarangayOverview } from './BarangayLearning';
import { buildLearningDetails } from '../utils/barangayLearning';
import './Progress.css';
import {
  buildBarangaySummary,
  getProgressPageData,
  getUserFeedback,
} from '../utils/progressService';

gsap.registerPlugin(useGSAP);

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

const AGE_BRACKETS = [
  { max: 17, label: 'Under 18' },
  { max: 24, label: '18–24' },
  { max: 34, label: '25–34' },
  { max: 44, label: '35–44' },
  { max: 54, label: '45–54' },
  { max: 64, label: '55–64' },
  { max: Infinity, label: '65 and above' },
];

// Only an age range is shown in User Details, never the exact date of birth.
const getAgeBracket = (user) => {
  if (user?.ageBracket) return user.ageBracket;

  const birthDate = new Date(user?.birthDate || '');
  if (!user?.birthDate || Number.isNaN(birthDate.getTime())) return 'Not recorded';

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday = today.getMonth() > birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  if (age < 0) return 'Not recorded';

  return AGE_BRACKETS.find((bracket) => age <= bracket.max).label;
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US');
};

const formatLongDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const getUserInitials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';

const getActivityDescription = (status) =>
  status === 'Active'
    ? 'Activity recorded within the last 7 days.'
    : 'No activity recorded for 7 consecutive days.';

const COMPLETION_RANGES = [
  { label: 'All', min: null, max: null },
  { label: '0%', min: 0, max: 0 },
  { label: '1%–10%', min: 1, max: 10 },
  { label: '11%–20%', min: 11, max: 20 },
  { label: '21%–30%', min: 21, max: 30 },
  { label: '31%–40%', min: 31, max: 40 },
  { label: '41%–50%', min: 41, max: 50 },
  { label: '51%–60%', min: 51, max: 60 },
  { label: '61%–70%', min: 61, max: 70 },
  { label: '71%–80%', min: 71, max: 80 },
  { label: '81%–90%', min: 81, max: 90 },
  { label: '91%–99%', min: 91, max: 99 },
  { label: '100%', min: 100, max: 100 },
];

const COMPLETION_OPTIONS = COMPLETION_RANGES.map((range) => range.label);

const matchesCompletionFilter = (overallPercent, filterValue) => {
  if (filterValue === 'All') return true;

  const range = COMPLETION_RANGES.find((option) => option.label === filterValue);
  if (!range) return true;

  return overallPercent >= range.min && overallPercent <= range.max;
};

const USERS_PER_PAGE = 10;
const BARANGAYS_PER_PAGE = 10;


export default function Progress() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [progressRows, setProgressRows] = useState([]);
  const [moduleOptions, setModuleOptions] = useState(['All']);
  const [barangayOptions, setBarangayOptions] = useState(['All']);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [barangayFilter, setBarangayFilter] = useState('All');
  const [completionFilter, setCompletionFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedBarangay, setSelectedBarangay] = useState(null);
  const [expandedTests, setExpandedTests] = useState({});
  const [userFeedback, setUserFeedback] = useState([]);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [isMoreDetailsOpen, setIsMoreDetailsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [barangayPage, setBarangayPage] = useState(1);
  const [trashTarget, setTrashTarget] = useState(null);
  const [isTrashing, setIsTrashing] = useState(false);
  const [trashError, setTrashError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const userModalRef = useRef(null);
  const moreDetailsRef = useRef(null);
  const { currentUser } = useUser();
  // Same gate as the /dashboard/users route: admin role with manage_users.
  const canViewMoreDetails = String(currentUser?.role || '').trim().toLowerCase() === 'admin'
    && Boolean(currentUser?.permissions?.includes('manage_users'));
  const requestedView = searchParams.get('view');
  const defaultView = location.pathname.endsWith('/users') ? 'users' : 'participation';
  const activeView = requestedView === 'users' || (!requestedView && defaultView === 'users')
    ? 'users'
    : 'barangays';

  const handleViewChange = (view) => {
    setSearchParams({ view });
    setCurrentPage(1);
    setBarangayPage(1);
  };

  useEffect(() => {
    let isMounted = true;

    const loadProgress = async () => {
      setIsLoading(true);
      setErrorMessage('');

      const { data, error } = await getProgressPageData();
      if (!isMounted) return;

      if (error) {
        setErrorMessage(`Failed to load progress: ${error}`);
        setProgressRows([]);
        setModuleOptions(['All']);
        setBarangayOptions(['All']);
      } else {
        setProgressRows(data?.users || []);
        const nextModuleOptions = ['All', ...(data?.modules || [])];
        setModuleOptions(nextModuleOptions);
        setModuleFilter((current) => (
          nextModuleOptions.includes(current) ? current : 'All'
        ));

        // Barangay options are the active dasmarinas_barangays rows in
        // display_order, with "All" kept as the default. Selecting one matches
        // against the barangay resolved from each user's own profile record.
        const nextBarangayOptions = ['All', ...(data?.barangays || [])];
        setBarangayOptions(nextBarangayOptions);
        setBarangayFilter((current) => (
          nextBarangayOptions.includes(current) ? current : 'All'
        ));
      }

      setIsLoading(false);
    };

    loadProgress();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleClearFilters = () => {
    setModuleFilter('All');
    setBarangayFilter('All');
    setCompletionFilter('All');
    setSearchQuery('');
    setBarangayPage(1);
  };

  const hasActiveFilters = barangayFilter !== 'All'
    || moduleFilter !== 'All'
    || completionFilter !== 'All'
    || searchQuery.trim() !== '';

  const openTrashDialog = (user) => {
    setTrashError('');
    setSuccessMessage('');
    setTrashTarget(user);
  };

  const closeTrashDialog = () => {
    if (isTrashing) return;
    setTrashTarget(null);
    setTrashError('');
  };

  const handleMoveUserToTrash = async (reason) => {
    if (!trashTarget?.id || isTrashing) return;
    setIsTrashing(true);
    setTrashError('');
    try {
      await archiveRecord('mobile_users', trashTarget.id, reason);
      setProgressRows((current) => current.filter((row) => row.id !== trashTarget.id));
      setSuccessMessage(`${trashTarget.name || 'Account'} moved to Trash. You can restore it within 30 days.`);
      setTrashTarget(null);
    } catch (error) {
      setTrashError(error.message);
    } finally {
      setIsTrashing(false);
    }
  };

  const handleViewUser = (user) => {
    setSelectedUser(user);
    setIsMoreDetailsOpen(false);
    setShowModal(true);
  };

  const handleViewBarangay = (barangay) => {
    setSelectedBarangay(barangay);
  };

  const handleCloseBarangay = () => {
    setSelectedBarangay(null);
  };

  const handleCloseModal = () => {
    if (moreDetailsRef.current) gsap.killTweensOf(moreDetailsRef.current);
    setShowModal(false);
    setSelectedUser(null);
    setExpandedTests({});
    setUserFeedback([]);
    setIsMoreDetailsOpen(false);
  };

  // Entrance: the panel settles in, then the essential details follow.
  useGSAP(() => {
    const modal = userModalRef.current;
    if (!showModal || !modal || prefersReducedMotion()) return;

    gsap.timeline({ defaults: { ease: 'power3.out', clearProps: 'opacity,visibility,transform' } })
      .from(modal, { autoAlpha: 0, y: 18, scale: 0.985, duration: 0.42 })
      .from(modal.querySelectorAll('[data-user-detail-reveal]'), {
        autoAlpha: 0,
        y: 10,
        duration: 0.4,
        stagger: 0.05,
      }, '-=0.2');
  }, { scope: userModalRef, dependencies: [showModal, selectedUser?.id] });

  // More Details: height opens from 0, then its groups fade up in sequence.
  useGSAP(() => {
    const panel = moreDetailsRef.current;
    if (!isMoreDetailsOpen || !panel || prefersReducedMotion()) return;

    gsap.timeline({ defaults: { ease: 'power2.out' } })
      .fromTo(panel, { height: 0, autoAlpha: 0, overflow: 'hidden' }, {
        height: 'auto',
        autoAlpha: 1,
        duration: 0.45,
        clearProps: 'height,opacity,visibility,overflow',
      })
      .from(panel.querySelectorAll('.progress-user-group'), {
        autoAlpha: 0,
        y: 12,
        duration: 0.35,
        stagger: 0.05,
        clearProps: 'opacity,visibility,transform',
      }, '-=0.25')
      .from(panel.querySelectorAll('.progress-user-meta-bar > span'), {
        scaleX: 0,
        transformOrigin: 'left center',
        duration: 0.6,
        ease: 'power3.out',
        clearProps: 'transform',
      }, '-=0.2');
  }, { scope: userModalRef, dependencies: [isMoreDetailsOpen] });

  const handleToggleMoreDetails = () => {
    const panel = moreDetailsRef.current;
    if (!isMoreDetailsOpen || !panel || prefersReducedMotion()) {
      setIsMoreDetailsOpen((current) => !current);
      return;
    }

    gsap.to(panel, {
      height: 0,
      autoAlpha: 0,
      overflow: 'hidden',
      duration: 0.3,
      ease: 'power2.inOut',
      onComplete: () => setIsMoreDetailsOpen(false),
    });
  };

  useEffect(() => {
    if (!showModal || !selectedUser?.id) return undefined;

    let isMounted = true;

    const loadFeedback = async () => {
      setIsFeedbackLoading(true);

      const { data } = await getUserFeedback(selectedUser.id);
      if (!isMounted) return;

      setUserFeedback(data);
      setIsFeedbackLoading(false);
    };

    loadFeedback();

    return () => {
      isMounted = false;
    };
  }, [showModal, selectedUser?.id]);

  const toggleTestExpanded = (moduleName) => {
    setExpandedTests(prev => ({
      ...prev,
      [moduleName]: !prev[moduleName]
    }));
  };

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return progressRows.filter((item) => {
      const matchesSearch =
        !normalizedQuery ||
        String(item.name || '').toLowerCase().includes(normalizedQuery) ||
        String(item.email || '').toLowerCase().includes(normalizedQuery) ||
        String(item.barangay || '').toLowerCase().includes(normalizedQuery) ||
        String(item.location || '').toLowerCase().includes(normalizedQuery);

      const matchesModule =
        moduleFilter === 'All' ||
        item.modules.some((module) => module.name === moduleFilter && module.progress > 0);

      const matchesBarangay = barangayFilter === 'All' || item.barangay === barangayFilter;

      const matchesCompletion = matchesCompletionFilter(item.overallPercent, completionFilter);

      return matchesSearch && matchesModule && matchesBarangay && matchesCompletion;
    });
  }, [barangayFilter, completionFilter, moduleFilter, progressRows, searchQuery]);

  // User Progress table pagination: 5 users per page, controls shown only when
  // the filtered list has more than one page. Changing any filter jumps back to
  // the first page (adjusted during render, per the React "you might not need an
  // effect" pattern).
  const filterSignature = `${barangayFilter}|${completionFilter}|${moduleFilter}|${searchQuery}`;
  const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature);
  if (filterSignature !== lastFilterSignature) {
    setLastFilterSignature(filterSignature);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / USERS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * USERS_PER_PAGE, safePage * USERS_PER_PAGE),
    [filteredRows, safePage]
  );

  const barangayBreakdown = useMemo(() => {
    const recordedSummary = buildBarangaySummary(progressRows);
    const summaryByBarangay = new Map(recordedSummary.map((row) => [row.barangay, row]));

    return barangayOptions
      .filter((barangay) => barangay !== 'All')
      .map((barangay) => summaryByBarangay.get(barangay) || {
        barangay,
        registered: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        completionRate: 0,
      });
  }, [barangayOptions, progressRows]);

  const visibleBreakdown = useMemo(() => (
    barangayFilter === 'All'
      ? barangayBreakdown
      : barangayBreakdown.filter((row) => row.barangay === barangayFilter)
  ), [barangayBreakdown, barangayFilter]);

  const barangayTotalPages = Math.max(1, Math.ceil(visibleBreakdown.length / BARANGAYS_PER_PAGE));
  const safeBarangayPage = Math.min(barangayPage, barangayTotalPages);
  const paginatedBreakdown = useMemo(
    () => visibleBreakdown.slice(
      (safeBarangayPage - 1) * BARANGAYS_PER_PAGE,
      safeBarangayPage * BARANGAYS_PER_PAGE
    ),
    [safeBarangayPage, visibleBreakdown]
  );

  const selectedBarangayDetails = useMemo(() => (
    selectedBarangay
      ? buildLearningDetails(
        selectedBarangay,
        progressRows.filter((row) => row.barangay === selectedBarangay),
        moduleOptions.filter((moduleName) => moduleName !== 'All')
      )
      : null
  ), [moduleOptions, progressRows, selectedBarangay]);

  const totalUsers = progressRows.length;

  return (
    <div className="progress-container">
      <Sidebar />

      <div className="progress-main">
        <PageHeader title="Users" />

        <nav className="progress-view-tabs" aria-label="Users page sections">
          <button type="button" className={activeView === 'barangays' ? 'is-active' : ''} onClick={() => handleViewChange('barangays')}>
            Barangay List
          </button>
          <button type="button" className={activeView === 'users' ? 'is-active' : ''} onClick={() => handleViewChange('users')}>
            User List
          </button>
        </nav>

        {activeView === 'barangays' && (
          <BarangayOverview
            rows={visibleBreakdown}
            pagedRows={paginatedBreakdown}
            progressRows={progressRows}
            isLoading={isLoading}
            page={safeBarangayPage}
            onPageChange={setBarangayPage}
            barangayOptions={barangayOptions}
            barangayFilter={barangayFilter}
            onFilterChange={(value) => {
              setBarangayFilter(value);
              setBarangayPage(1);
            }}
            onView={handleViewBarangay}
          />
        )}

        {activeView === 'users' && (
          <>
            <ToastMessage message={errorMessage} type="error" />
            <ToastMessage message={successMessage} type="success" />
            <ArchiveConfirmDialog
              open={Boolean(trashTarget)}
              tone="archive"
              title="Move account to Trash?"
              description={(
                <p>
                  They can&apos;t sign in until it&apos;s restored. You can restore it within 30 days.
                  Their learning history is kept.
                </p>
              )}
              recordLabel={trashTarget?.name}
              recordMeta={trashTarget?.email}
              reasonPlaceholder="e.g. Duplicate registration"
              confirmLabel="Move to Trash"
              busyLabel="Moving…"
              busy={isTrashing}
              error={trashError}
              onConfirm={handleMoveUserToTrash}
              onClose={closeTrashDialog}
            />
            <UserList
              rows={filteredRows}
              pagedRows={paginatedRows}
              totalUsers={totalUsers}
              isLoading={isLoading}
              page={safePage}
              onPageChange={setCurrentPage}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              barangayOptions={barangayOptions}
              barangayFilter={barangayFilter}
              onBarangayChange={(value) => {
                setBarangayFilter(value);
                setBarangayPage(1);
              }}
              moduleOptions={moduleOptions}
              moduleFilter={moduleFilter}
              onModuleChange={setModuleFilter}
              completionOptions={COMPLETION_OPTIONS}
              completionFilter={completionFilter}
              onCompletionChange={setCompletionFilter}
              hasActiveFilters={hasActiveFilters}
              onClear={handleClearFilters}
              onView={handleViewUser}
              onTrash={openTrashDialog}
              formatDate={formatDate}
            />
          </>
        )}

        {selectedBarangayDetails && (
          <BarangayDetailModal
            details={selectedBarangayDetails}
            onClose={handleCloseBarangay}
            onViewUser={(user) => {
              handleCloseBarangay();
              handleViewUser(user);
            }}
          />
        )}

        {showModal && selectedUser && (
          <div className="progress-modal-overlay" onClick={handleCloseModal}>
            <div
              ref={userModalRef}
              className="progress-modal progress-user-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="progress-user-modal-name"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="progress-modal-header">
                <div className="progress-modal-heading">
                  <span className="progress-modal-eyebrow">Users</span>
                  <h2>User Details</h2>
                  <p>Essential account information</p>
                </div>
                <CloseButton
                  className="progress-modal-close"
                  onClick={handleCloseModal}
                  label="Close user details"
                />
              </div>

              <div className="progress-modal-content progress-user-content">
                <section className="progress-user-identity" data-user-detail-reveal>
                  <div className="progress-user-avatar" aria-hidden="true">
                    {selectedUser.avatarUrl ? (
                      <img src={selectedUser.avatarUrl} alt="" />
                    ) : (
                      getUserInitials(selectedUser.name)
                    )}
                  </div>
                  <div className="progress-user-identity-copy">
                    <span className="progress-user-label">Full Name</span>
                    <h3 id="progress-user-modal-name">{selectedUser.name}</h3>
                  </div>
                </section>

                <dl className="progress-user-essentials">
                  <div className="progress-user-field progress-user-field-wide" data-user-detail-reveal>
                    <dt className="progress-user-label">Email Address</dt>
                    <dd className="progress-user-field-email">
                      <FiMail aria-hidden="true" />
                      <span>{selectedUser.email}</span>
                    </dd>
                  </div>
                  <div className="progress-user-field" data-user-detail-reveal>
                    <dt className="progress-user-label">Barangay</dt>
                    <dd>{selectedUser.barangay}</dd>
                  </div>
                  <div className="progress-user-field" data-user-detail-reveal>
                    <dt className="progress-user-label">Age Bracket</dt>
                    <dd>{getAgeBracket(selectedUser)}</dd>
                  </div>
                  <div className="progress-user-field progress-user-field-wide" data-user-detail-reveal>
                    <dt className="progress-user-label">Account Status</dt>
                    <dd className="progress-user-field-status">
                      <span className={`progress-modal-status ${selectedUser.accessStatus.toLowerCase()}`}>
                        {selectedUser.accessStatus}
                      </span>
                      <small>{getActivityDescription(selectedUser.accessStatus)}</small>
                    </dd>
                  </div>
                </dl>

                {canViewMoreDetails && (
                  <section className="progress-user-more" data-user-detail-reveal>
                    <button
                      type="button"
                      className="progress-user-more-toggle"
                      onClick={handleToggleMoreDetails}
                      aria-expanded={isMoreDetailsOpen}
                      aria-controls="progress-user-more-details"
                    >
                      <span className="progress-user-more-copy">
                        <strong>More Details</strong>
                        <small>Activity, learning progress, and assessment history</small>
                      </span>
                      <span className={`progress-user-more-chevron ${isMoreDetailsOpen ? 'open' : ''}`} aria-hidden="true">
                        <FiChevronDown />
                      </span>
                    </button>

                    {isMoreDetailsOpen && (
                      <div
                        id="progress-user-more-details"
                        ref={moreDetailsRef}
                        className="progress-user-more-panel"
                      >
                        {/* Overview: one compact grid; fields without data are left out. */}
                        <section className="progress-user-group" aria-label="Activity and learning overview">
                          <dl className="progress-user-meta">
                            <div>
                              <dt className="progress-user-label">Account Type</dt>
                              <dd>
                                <span className={`progress-account-type-badge ${selectedUser.accountType.toLowerCase().replace(/\s+/g, '-')}`}>
                                  {selectedUser.accountType}
                                </span>
                              </dd>
                            </div>
                            {selectedUser.lastActivityAt && (
                              <div>
                                <dt className="progress-user-label">Last Activity</dt>
                                <dd>{formatLongDate(selectedUser.lastActivityAt)}</dd>
                              </div>
                            )}
                            <div>
                              <dt className="progress-user-label">Location</dt>
                              <dd>{selectedUser.location}</dd>
                            </div>
                            <div>
                              <dt className="progress-user-label">Modules Completed</dt>
                              <dd>{selectedUser.modulesCompleted} of {selectedUser.modules.length}</dd>
                            </div>
                            <div>
                              <dt className="progress-user-label">Overall Progress</dt>
                              <dd className="progress-user-meta-progress">
                                <span>{selectedUser.overallPercent}%</span>
                                <span className="progress-user-meta-bar" aria-hidden="true">
                                  <span style={{ width: `${selectedUser.overallPercent}%` }} />
                                </span>
                              </dd>
                            </div>
                            <div>
                              <dt className="progress-user-label">Simulations</dt>
                              <dd>
                                {selectedUser.completedSimulations} completed
                                {selectedUser.lastSimulation && selectedUser.lastSimulation !== 'Not recorded' && (
                                  <small className="progress-modal-value-note">Last: {selectedUser.lastSimulation}</small>
                                )}
                              </dd>
                            </div>
                            {selectedUser.lastAccessedModule && selectedUser.lastAccessedModule !== 'N/A' && (
                              <div>
                                <dt className="progress-user-label">Last Module Accessed</dt>
                                <dd>{selectedUser.lastAccessedModule}</dd>
                              </div>
                            )}
                          </dl>
                        </section>

                        <section className="progress-user-group">
                          <h4><FiBookOpen className="progress-modal-section-icon" aria-hidden="true" />Module Progress</h4>
                          <div className="progress-modal-modules">
                            {selectedUser.modules.map((module) => (
                              <div key={module.name} className="progress-modal-module-card">
                                <div className="progress-modal-module-header">
                                  <span className="progress-modal-module-name">{module.name}</span>
                                  <span className={`progress-modal-module-badge ${module.status === 'In Progress' ? 'in-progress' : module.status === 'Completed' ? 'completed' : 'not-started'}`}>
                                    {module.status === 'In Progress' ? `${module.progress}%` : module.status}
                                  </span>
                                </div>
                                {module.status === 'In Progress' && (
                                  <div className="progress-modal-bar">
                                    <div className="progress-modal-bar-fill" style={{ width: `${module.progress}%` }}></div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="progress-user-group">
                          <h4><FiCheckCircle className="progress-modal-section-icon" aria-hidden="true" />Assessment History</h4>
                          {selectedUser.modules.every((module) => module.tests.length === 0) ? (
                            <p className="progress-modal-feedback-empty">No pre- or post-assessments taken yet.</p>
                          ) : (
                          <div className="progress-modal-tests">
                            {selectedUser.modules.filter((module) => module.tests.length > 0).map((module) => (
                              <div key={module.name}>
                                <button
                                  type="button"
                                  className="progress-modal-test-item"
                                  onClick={() => toggleTestExpanded(module.name)}
                                  aria-expanded={Boolean(expandedTests[module.name])}
                                >
                                  <span className="progress-modal-test-name">
                                    <span className={`progress-modal-test-dropdown ${expandedTests[module.name] ? 'open' : ''}`}>
                                      <FiChevronDown aria-hidden="true" />
                                    </span>
                                    {module.name}
                                  </span>
                                  <span className="progress-modal-test-status">
                                    {module.tests.length} {module.tests.length === 1 ? 'attempt' : 'attempts'}
                                  </span>
                                </button>
                                {expandedTests[module.name] && (
                                  <ul className="progress-modal-test-details">
                                    {module.tests.map((test) => (
                                      <li key={test.id} className="progress-modal-test-row">
                                        <span className="progress-modal-test-row-name">{test.name}</span>
                                        <span className="progress-modal-test-row-meta">
                                          <strong>{test.score}/10</strong>
                                          {test.date && <small>{formatDate(test.date)}</small>}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                          )}
                        </section>

                        <section className="progress-user-group">
                          <h4><FiStar className="progress-modal-section-icon" aria-hidden="true" />User Feedback</h4>
                          {isFeedbackLoading ? (
                            <p className="progress-modal-feedback-empty">Loading feedback...</p>
                          ) : userFeedback.length === 0 ? (
                            <p className="progress-modal-feedback-empty">No feedback submitted yet.</p>
                          ) : (
                            <div className="progress-modal-feedback-list">
                              {userFeedback.map((item) => (
                                <div key={item.id} className="progress-modal-feedback-card">
                                  <div className="progress-modal-feedback-header">
                                    <span className="progress-modal-feedback-rating">
                                      <FiStar aria-hidden="true" /> {item.rating} / 5
                                    </span>
                                    <span className="progress-modal-feedback-date">
                                      {formatLongDate(item.created_at)}
                                    </span>
                                  </div>
                                  <p className="progress-modal-feedback-comment">
                                    {item.comment && item.comment.trim() ? item.comment : 'No comment provided.'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
