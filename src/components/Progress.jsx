import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAward,
  FiBarChart2,
  FiBookOpen,
  FiCheckCircle,
  FiChevronDown,
  FiEye,
  FiMail,
  FiMapPin,
  FiPieChart,
  FiPlayCircle,
  FiStar,
  FiUsers,
} from 'react-icons/fi';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useUser } from '../context/UserContext';
import Sidebar from './Sidebar';
import RecordActions from './RecordActions';
import Pagination from './Pagination';
import PageHeader from './PageHeader';
import CloseButton from './CloseButton';
import ToastMessage from './ToastMessage';
import ArchiveConfirmDialog from './ArchiveConfirmDialog';
import { archiveRecord } from '../utils/archiveService';
import ResponsiveSelect from './ResponsiveSelect';
import './Progress.css';
import {
  UNSPECIFIED_BARANGAY_LABEL,
  buildBarangaySummary,
  getProgressPageData,
  getUserFeedback,
  summarizeUsers,
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

const getUserMilestones = (user) => {
  const milestones = [];
  const startedModules = user.modules?.filter((module) => module.progress > 0).length || 0;

  if (startedModules > 0) {
    milestones.push({ key: 'started', label: 'Training Started', detail: `${startedModules} module${startedModules === 1 ? '' : 's'} accessed` });
  }
  if (user.modulesCompleted > 0) {
    milestones.push({ key: 'modules', label: 'Module Finisher', detail: `${user.modulesCompleted} module${user.modulesCompleted === 1 ? '' : 's'} completed` });
  }
  if (user.completedSimulations > 0) {
    milestones.push({ key: 'simulations', label: 'Simulation Participant', detail: `${user.completedSimulations} simulation${user.completedSimulations === 1 ? '' : 's'} completed` });
  }
  if (user.overallPercent >= 100) {
    milestones.push({ key: 'complete', label: 'Training Complete', detail: 'All available modules completed' });
  }

  return milestones;
};

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

const averagePercent = (values = []) => {
  const numericValues = values.filter((value) => Number.isFinite(Number(value)));
  if (numericValues.length === 0) return 0;
  return Math.round(numericValues.reduce((sum, value) => sum + Number(value), 0) / numericValues.length);
};

const buildBarangayLearningDetails = (barangay, rows = [], modules = []) => {
  const users = rows.filter((row) => row.barangay === barangay);
  const summary = summarizeUsers(users);
  const latestAssessmentScores = users.flatMap((user) =>
    (user.modules || []).flatMap((module) => (
      module.tests?.[0] ? [Number(module.tests[0].score) * 10] : []
    ))
  );
  const usersWithAssessments = users.filter((user) =>
    user.modules?.some((module) => (module.tests?.length || 0) > 0)
  ).length;

  const modulePerformance = modules.map((moduleName) => {
    const moduleRows = users
      .map((user) => user.modules?.find((module) => module.name === moduleName))
      .filter(Boolean);
    const moduleScores = moduleRows.flatMap((module) => (
      module.tests?.[0] ? [Number(module.tests[0].score) * 10] : []
    ));

    return {
      name: moduleName,
      completed: moduleRows.filter((module) => module.progress >= 100).length,
      inProgress: moduleRows.filter((module) => module.progress > 0 && module.progress < 100).length,
      averageProgress: averagePercent(moduleRows.map((module) => module.progress)),
      knowledgeScore: averagePercent(moduleScores),
      assessedUsers: moduleScores.length,
    };
  });

  const latestActivityTimestamp = users.reduce((latest, user) => {
    const timestamp = new Date(user.lastActivityAt || 0).getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  return {
    barangay,
    users,
    ...summary,
    activeUsers: users.filter((user) => user.accessStatus === 'Active').length,
    averageProgress: averagePercent(users.map((user) => user.overallPercent)),
    knowledgeScore: averagePercent(latestAssessmentScores),
    assessmentCoverage: summary.registered > 0
      ? Math.round((usersWithAssessments / summary.registered) * 100)
      : 0,
    simulationsCompleted: users.reduce((sum, user) => sum + Number(user.completedSimulations || 0), 0),
    modulesCompleted: users.reduce((sum, user) => sum + Number(user.modulesCompleted || 0), 0),
    latestActivityAt: latestActivityTimestamp > 0 ? new Date(latestActivityTimestamp).toISOString() : null,
    modulePerformance,
  };
};

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
  const [locationFilter, setLocationFilter] = useState('All');
  const [completionFilter, setCompletionFilter] = useState('All');
  const [completionSearchText, setCompletionSearchText] = useState('All');
  const [isCompletionDropdownOpen, setIsCompletionDropdownOpen] = useState(false);
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
  const completionBlurTimeoutRef = useRef(null);
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
    setLocationFilter('All');
    setCompletionFilter('All');
    setCompletionSearchText('All');
    setSearchQuery('');
    setBarangayPage(1);
  };

  const completionDropdownOptions = useMemo(() => {
    const normalizedQuery = completionSearchText.trim().toLowerCase();
    if (!normalizedQuery || normalizedQuery === completionFilter.toLowerCase()) {
      return COMPLETION_OPTIONS;
    }
    return COMPLETION_OPTIONS.filter((option) =>
      option.toLowerCase().includes(normalizedQuery)
    );
  }, [completionSearchText, completionFilter]);

  const handleCompletionInputFocus = () => {
    if (completionBlurTimeoutRef.current) {
      clearTimeout(completionBlurTimeoutRef.current);
    }
    setCompletionSearchText('');
    setIsCompletionDropdownOpen(true);
  };

  const handleCompletionInputChange = (event) => {
    setCompletionSearchText(event.target.value);
    setIsCompletionDropdownOpen(true);
  };

  const handleCompletionInputBlur = () => {
    completionBlurTimeoutRef.current = setTimeout(() => {
      setCompletionSearchText(completionFilter);
      setIsCompletionDropdownOpen(false);
    }, 150);
  };

  const handleSelectCompletionOption = (option) => {
    if (completionBlurTimeoutRef.current) {
      clearTimeout(completionBlurTimeoutRef.current);
    }
    setCompletionFilter(option);
    setCompletionSearchText(option);
    setIsCompletionDropdownOpen(false);
  };

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
      setSuccessMessage(`${trashTarget.name || 'The account'} was moved to Trash. It can be restored from Archive & Trash for 30 days.`);
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
      const matchesLocation = locationFilter === 'All' || item.locationKey === locationFilter;

      const matchesCompletion = matchesCompletionFilter(item.overallPercent, completionFilter);

      return matchesSearch && matchesModule && matchesBarangay && matchesLocation && matchesCompletion;
    });
  }, [barangayFilter, locationFilter, completionFilter, moduleFilter, progressRows, searchQuery]);

  // User Progress table pagination: 5 users per page, controls shown only when
  // the filtered list has more than one page. Changing any filter jumps back to
  // the first page (adjusted during render, per the React "you might not need an
  // effect" pattern).
  const filterSignature = `${barangayFilter}|${locationFilter}|${completionFilter}|${moduleFilter}|${searchQuery}`;
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
      ? buildBarangayLearningDetails(
        selectedBarangay,
        progressRows,
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

        <div className="progress-controls">
          <div className={`progress-filters progress-filters--${activeView}`}>
            <div className="progress-filter">
              <label htmlFor="progress-filter-barangay">Barangay / Location</label>
              <ResponsiveSelect
                id="progress-filter-barangay"
                value={barangayFilter}
                onChange={(event) => {
                  setBarangayFilter(event.target.value);
                  setBarangayPage(1);
                }}
                options={barangayOptions.map((value) => ({ value, label: value }))}
              />
            </div>

            {activeView === 'users' && <div className="progress-filter">
              <label htmlFor="progress-filter-location">Location</label>
              <ResponsiveSelect
                id="progress-filter-location"
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                options={[
                  { value: 'All', label: 'All locations' },
                  { value: 'dasmarinas', label: 'Dasmariñas City, Cavite' },
                  { value: 'outside', label: 'Outside Dasmariñas City' },
                ]}
              />
            </div>}

            {activeView === 'users' && <div className="progress-filter">
              <label htmlFor="progress-filter-module">Filter by Module</label>
              <ResponsiveSelect
                id="progress-filter-module"
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
                options={moduleOptions.map((value) => ({ value, label: value }))}
              />
            </div>}

            {activeView === 'users' && <div className="progress-filter progress-filter-searchable">
              <label htmlFor="progress-filter-completion">Filter by Completion</label>
              <div className="progress-searchable-select">
                <input
                  id="progress-filter-completion"
                  type="text"
                  className="progress-searchable-input"
                  value={isCompletionDropdownOpen ? completionSearchText : completionFilter}
                  onFocus={handleCompletionInputFocus}
                  onChange={handleCompletionInputChange}
                  onBlur={handleCompletionInputBlur}
                  placeholder="Search completion..."
                  autoComplete="off"
                />
                {isCompletionDropdownOpen && (
                  <ul className="progress-searchable-options">
                    {completionDropdownOptions.length === 0 ? (
                      <li className="progress-searchable-option-empty">No matches</li>
                    ) : (
                      completionDropdownOptions.map((option) => (
                        <li
                          key={option}
                          className={`progress-searchable-option ${option === completionFilter ? 'selected' : ''}`}
                          onMouseDown={() => handleSelectCompletionOption(option)}
                        >
                          {option}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>}

            {activeView === 'users' && <div className="progress-filter progress-filter-query">
              <label htmlFor="progress-user-search">Search Users</label>
              <input
                id="progress-user-search"
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search name, email, or location..."
                autoComplete="off"
              />
            </div>}

            <button className="progress-clear" onClick={handleClearFilters}>
              CLEAR FILTERS
            </button>
          </div>
        </div>

        {activeView === 'barangays' && <div className="progress-table-card progress-barangay-breakdown">
          <div className="progress-breakdown-header">
            <h3>
              <FiMapPin aria-hidden="true" />
              Barangay Learning Overview
            </h3>
            <span className="progress-breakdown-formula">
              Select a barangay to view its mobile users and complete learning details
            </span>
          </div>
          <div className="progress-desktop-table">
            <table className="progress-table progress-table--breakdown">
              <thead>
                <tr>
                  <th>Barangay</th>
                  <th>Total Registered Users</th>
                  <th>Completed</th>
                  <th>In Progress</th>
                  <th>Not Started</th>
                  <th>Completion Rate</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                      Loading barangay statistics...
                    </td>
                  </tr>
                ) : visibleBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                      No barangay records found.
                    </td>
                  </tr>
                ) : (
                  paginatedBreakdown.map((row) => (
                    <tr
                      key={row.barangay}
                      className={row.barangay === UNSPECIFIED_BARANGAY_LABEL ? 'progress-row-muted' : ''}
                    >
                      <td>{row.barangay}</td>
                      <td>{row.registered}</td>
                      <td>{row.completed}</td>
                      <td>{row.inProgress}</td>
                      <td>{row.notStarted}</td>
                      <td>
                        <div className="progress-rate-cell">
                          <span>{row.completionRate}%</span>
                          <div className="progress-rate-bar">
                            <div
                              className="progress-rate-bar-fill"
                              style={{ width: `${Math.min(100, row.completionRate)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="progress-barangay-view-btn"
                          onClick={() => handleViewBarangay(row.barangay)}
                          title={`View ${row.barangay} details`}
                          aria-label={`View learning details for ${row.barangay}`}
                        >
                          <FiEye aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="progress-mobile-cards">
            {isLoading ? (
              <div className="progress-card-empty">Loading barangay statistics...</div>
            ) : visibleBreakdown.length === 0 ? (
              <div className="progress-card-empty">No barangay records found.</div>
            ) : (
              paginatedBreakdown.map((row) => (
                <div className="progress-user-card" key={row.barangay}>
                  <div className="progress-card-header">
                    <div>
                      <h3>{row.barangay}</h3>
                      <p>{row.registered} registered {row.registered === 1 ? 'user' : 'users'}</p>
                    </div>
                    <span className="progress-percent">{row.completionRate}%</span>
                  </div>
                  <div className="progress-card-row">
                    <span>Completed</span>
                    <strong>{row.completed}</strong>
                  </div>
                  <div className="progress-card-row">
                    <span>In Progress</span>
                    <strong>{row.inProgress}</strong>
                  </div>
                  <div className="progress-card-row">
                    <span>Not Started</span>
                    <strong>{row.notStarted}</strong>
                  </div>
                  <button
                    type="button"
                    className="progress-barangay-mobile-view-btn"
                    onClick={() => handleViewBarangay(row.barangay)}
                  >
                    <FiEye aria-hidden="true" />
                    View barangay details
                  </button>
                </div>
              ))
            )}
          </div>
          {!isLoading && (
            <div className="progress-section-pagination progress-section-pagination--barangays">
              <Pagination
                page={safeBarangayPage}
                totalItems={visibleBreakdown.length}
                onPageChange={setBarangayPage}
                label="Barangay completion summary pages"
              />
            </div>
          )}
        </div>}

        {activeView === 'users' && <div className="progress-table-card progress-users-table">
          <div className="progress-breakdown-header">
            <h3>
              <FiBarChart2 aria-hidden="true" />
              User Progress
            </h3>
            <span className="progress-breakdown-formula">
              Showing {filteredRows.length} of {totalUsers} users
            </span>
          </div>
          <ToastMessage message={errorMessage} type="error" />
          <ToastMessage message={successMessage} type="success" />
          <ArchiveConfirmDialog
            open={Boolean(trashTarget)}
            tone="archive"
            title="Move mobile account to Trash?"
            description={(
              <p>
                The learner can no longer sign in or save progress in the mobile app. The account stays
                recoverable in Archive &amp; Trash for 30 days, and learning and assessment history is kept.
              </p>
            )}
            recordLabel={trashTarget?.name}
            recordMeta={trashTarget?.email}
            reasonPlaceholder="e.g. Duplicate registration"
            confirmLabel="Move to Trash"
            busyLabel="Moving..."
            busy={isTrashing}
            error={trashError}
            onConfirm={handleMoveUserToTrash}
            onClose={closeTrashDialog}
          />
          {!isLoading && (
            <div className="progress-section-pagination progress-section-pagination--users">
              <Pagination
                page={safePage}
                totalItems={filteredRows.length}
                onPageChange={setCurrentPage}
                label="Learning profile pages"
              />
            </div>
          )}
         <div className="progress-desktop-table">
  <table className="progress-table progress-table--users">
            <thead>
              <tr>
                <th>No.</th>
                <th>Name</th>
                <th>Location / Barangay</th>
                <th>Account Type</th>
                <th>Module Progress</th>
                <th>Overall %</th>
                <th>Last Activity</th>
                <th>Last Accessed Module</th>
                <th>Milestones</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                    Loading progress...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                    No progress records found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((item, index) => (
                  <tr key={item.id}>
                    <td>{(safePage - 1) * USERS_PER_PAGE + index + 1}</td>
                    <td title={item.name}>{item.name}</td>
                    <td
                      title={item.locationKey === 'outside' ? item.location : `${item.barangay}, ${item.location}`}
                      className={item.barangay === UNSPECIFIED_BARANGAY_LABEL ? 'progress-cell-muted' : ''}
                    >
                      {item.barangay}
                      {item.locationKey !== 'outside' && <small className="progress-location-note">{item.location}</small>}
                    </td>
                    <td>
                      <span className={`progress-account-type-badge ${item.accountType.toLowerCase().replace(/\s+/g, '-')}`}>
                        {item.accountType}
                      </span>
                    </td>
                    <td>{item.moduleProgress}</td>
                    <td>{item.overallPercent}%</td>
                    <td>{formatDate(item.lastActivityAt)}</td>
                    <td title={item.lastAccessedModule}>{item.lastAccessedModule}</td>
                    <td title={getUserMilestones(item).map((milestone) => milestone.label).join(', ') || 'No milestones yet'}>
                      <span className="progress-milestone-count">
                        <FiAward aria-hidden="true" />
                        {getUserMilestones(item).length}
                      </span>
                    </td>
                    <td>
                      <RecordActions label="Learning profile actions">
                      <button
                        className="progress-view-btn"
                        onClick={() => handleViewUser(item)}
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        className="progress-delete-btn"
                        onClick={() => openTrashDialog(item)}
                      >
                        Move to Trash
                      </button>
                      </RecordActions>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          <div className="progress-mobile-cards">

  {isLoading ? (
    <div className="progress-card-empty">
      Loading progress...
    </div>
  ) : filteredRows.length === 0 ? (
    <div className="progress-card-empty">
      No progress records found.
    </div>
  ) : (
    paginatedRows.map((item) => (
      <div className="progress-user-card" key={item.id}>

        <div className="progress-card-header">
          <div>
            <h3>{item.name}</h3>
            <p>{item.email}</p>
            <span className={`progress-account-type-badge ${item.accountType.toLowerCase().replace(/\s+/g, '-')}`}>
              {item.accountType}
            </span>
          </div>

          <span className="progress-percent">
            {item.overallPercent}%
          </span>
        </div>


        <div className="progress-card-row">
          <span>Location</span>
          <strong>{item.location}</strong>
        </div>

        {item.locationKey !== 'outside' && <div className="progress-card-row">
          <span>Barangay</span>
          <strong>{item.barangay}</strong>
        </div>}


        <div className="progress-card-row">
          <span>Last Activity</span>
          <strong>
            {formatDate(item.lastActivityAt)}
          </strong>
        </div>


        <div className="progress-card-row">
          <span>Last Module</span>
          <strong>
            {item.lastAccessedModule}
          </strong>
        </div>


        <div className="progress-card-row">
          <span>Modules</span>
          <strong>
            {item.moduleProgress}
          </strong>
        </div>

        <div className="progress-card-row">
          <span>Milestones</span>
          <strong className="progress-mobile-milestone-count">
            <FiAward aria-hidden="true" /> {getUserMilestones(item).length}
          </strong>
        </div>


        <RecordActions label="Learning profile actions"><button
          className="progress-view-btn"
          onClick={() => handleViewUser(item)}
        >
          View details
        </button>
        <button
          type="button"
          className="progress-delete-btn"
          onClick={() => openTrashDialog(item)}
        >
          Move to Trash
        </button></RecordActions>

      </div>
    ))
  )}

</div>
        </div>}

        {selectedBarangayDetails && (
          <div className="progress-modal-overlay" onClick={handleCloseBarangay}>
            <div className="progress-modal progress-barangay-modal" onClick={(event) => event.stopPropagation()}>
              <div className="progress-modal-header">
                <div className="progress-modal-heading">
                  <span className="progress-modal-eyebrow">Barangay Details</span>
                  <h2>{selectedBarangayDetails.barangay}</h2>
                  <p>Mobile user participation and learning performance</p>
                </div>
                <CloseButton
                  className="progress-modal-close"
                  onClick={handleCloseBarangay}
                  label="Close barangay details"
                />
              </div>

              <div className="progress-modal-content progress-barangay-modal-content">
                <section className="progress-barangay-detail-metrics" aria-label="Barangay summary">
                  <div>
                    <span>Registered Users</span>
                    <strong>{selectedBarangayDetails.registered}</strong>
                  </div>
                  <div>
                    <span>Active Users</span>
                    <strong>{selectedBarangayDetails.activeUsers}</strong>
                  </div>
                  <div>
                    <span>Average Progress</span>
                    <strong>{selectedBarangayDetails.averageProgress}%</strong>
                  </div>
                  <div>
                    <span>Completion Rate</span>
                    <strong>{selectedBarangayDetails.completionRate}%</strong>
                  </div>
                  <div>
                    <span>Knowledge Score</span>
                    <strong>{selectedBarangayDetails.knowledgeScore}%</strong>
                  </div>
                  <div>
                    <span>Assessment Coverage</span>
                    <strong>{selectedBarangayDetails.assessmentCoverage}%</strong>
                  </div>
                </section>

                <section className="progress-barangay-distribution">
                  <div className="progress-barangay-detail-heading">
                    <div>
                      <h3><FiPieChart aria-hidden="true" />Training Status</h3>
                      <p>Current learning status of registered mobile users.</p>
                    </div>
                    <span>Last activity: {formatLongDate(selectedBarangayDetails.latestActivityAt)}</span>
                  </div>
                  <div className="progress-barangay-status-track" aria-label="Training status distribution">
                    <span
                      className="is-completed"
                      style={{ width: `${selectedBarangayDetails.registered ? (selectedBarangayDetails.completed / selectedBarangayDetails.registered) * 100 : 0}%` }}
                    />
                    <span
                      className="is-progress"
                      style={{ width: `${selectedBarangayDetails.registered ? (selectedBarangayDetails.inProgress / selectedBarangayDetails.registered) * 100 : 0}%` }}
                    />
                    <span
                      className="is-not-started"
                      style={{ width: `${selectedBarangayDetails.registered ? (selectedBarangayDetails.notStarted / selectedBarangayDetails.registered) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="progress-barangay-status-legend">
                    <span className="is-completed"><i />Completed <strong>{selectedBarangayDetails.completed}</strong></span>
                    <span className="is-progress"><i />In Progress <strong>{selectedBarangayDetails.inProgress}</strong></span>
                    <span className="is-not-started"><i />Not Started <strong>{selectedBarangayDetails.notStarted}</strong></span>
                    <span><FiCheckCircle aria-hidden="true" />{selectedBarangayDetails.modulesCompleted} modules completed</span>
                    <span><FiPlayCircle aria-hidden="true" />{selectedBarangayDetails.simulationsCompleted} simulations completed</span>
                  </div>
                </section>

                <section className="progress-barangay-detail-section">
                  <div className="progress-barangay-detail-heading">
                    <div>
                      <h3><FiBookOpen aria-hidden="true" />Module Performance</h3>
                      <p>Progress and the latest recorded assessment score for each module.</p>
                    </div>
                  </div>
                  <div className="progress-barangay-detail-table-wrap">
                    <table className="progress-barangay-detail-table">
                      <thead>
                        <tr>
                          <th>Module</th>
                          <th>Completed</th>
                          <th>In Progress</th>
                          <th>Average Progress</th>
                          <th>Knowledge Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBarangayDetails.modulePerformance.map((module) => (
                          <tr key={module.name}>
                            <td>{module.name}</td>
                            <td>{module.completed}</td>
                            <td>{module.inProgress}</td>
                            <td>{module.averageProgress}%</td>
                            <td>{module.assessedUsers > 0 ? `${module.knowledgeScore}%` : 'No results'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="progress-barangay-detail-section">
                  <div className="progress-barangay-detail-heading">
                    <div>
                      <h3><FiUsers aria-hidden="true" />Mobile Users</h3>
                      <p>Accounts registered under {selectedBarangayDetails.barangay}.</p>
                    </div>
                    <span>{selectedBarangayDetails.registered} total</span>
                  </div>
                  {selectedBarangayDetails.users.length === 0 ? (
                    <p className="progress-barangay-detail-empty">No mobile users are registered under this barangay.</p>
                  ) : (
                    <div className="progress-barangay-members">
                      {selectedBarangayDetails.users.map((user) => (
                        <div className="progress-barangay-member" key={user.id}>
                          <span className="progress-barangay-member-avatar" aria-hidden="true">{getUserInitials(user.name)}</span>
                          <span className="progress-barangay-member-name">
                            <strong>{user.name}</strong>
                            <small>{user.email}</small>
                          </span>
                          <span className={`progress-barangay-member-status is-${user.completionStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                            {user.completionStatus}
                          </span>
                          <span className="progress-barangay-member-progress">{user.overallPercent}%</span>
                          <button
                            type="button"
                            className="progress-barangay-member-view"
                            onClick={() => {
                              handleCloseBarangay();
                              handleViewUser(user);
                            }}
                            title={`View ${user.name}'s learning profile`}
                            aria-label={`View learning profile for ${user.name}`}
                          >
                            <FiEye aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
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
