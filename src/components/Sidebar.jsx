import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaBell,
  FaBookOpen,
  FaBullhorn,
  FaCalendarCheck,
  FaChartLine,
  FaClipboardList,
  FaFileAlt,
  FaHistory,
  FaQuestionCircle,
  FaSitemap,
  FaTachometerAlt,
  FaUserCog,
  FaUsers
} from 'react-icons/fa';
import inlogo from '../assets/inLOGO.png';
import './Dashboard.css';
import { useUser } from '../context/UserContext';
import { useLayout } from '../context/LayoutContext';
import { getPendingProfileChangeRequestsCount } from '../utils/profileChangeRequestsService';
import { getPendingAcknowledgementCount } from '../utils/announcementsService';

const PERSONNEL_ANNOUNCEMENTS_PATH = '/personnel/announcements';

// Every admin page mounts its own <Sidebar/> rather than sharing one via a
// layout, so the scroll container is destroyed and recreated on each nav.
// Persisting the scroll offset here (module scope survives the remount)
// lets us restore it before paint instead of snapping back to the top.
const sidebarScrollPositions = {};

export default function Sidebar({ variant = 'admin' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useUser();
  const sidebarRef = useRef(null);
  const { isSidebarCollapsed, isMobileSidebarOpen, closeMobileSidebar } = useLayout();
  const [pendingProfileChangeRequests, setPendingProfileChangeRequests] = useState(0);
  const [hasPendingAnnouncementAck, setHasPendingAnnouncementAck] = useState(false);
  const [showAckRequiredModal, setShowAckRequiredModal] = useState(false);

  const menuItems = [
    { id: 'dashboard', icon: FaTachometerAlt, label: 'Dashboard', path: '/dashboard', permission: 'view_dashboard' },
    { id: 'reports', icon: FaFileAlt, label: 'Reports', path: '/dashboard/reports', permission: 'view_dashboard' },
    { id: 'accounts', icon: FaUsers, label: 'Personnel', path: '/dashboard/accounts', permission: 'view_accounts', badge: pendingProfileChangeRequests },
    { id: 'announcements', icon: FaBullhorn, label: 'Content Management', path: '/dashboard/announcements', permission: 'manage_users' },
    { id: 'attendance-admin', icon: FaCalendarCheck, label: 'Attendance', path: '/attendance-admin', permission: 'view_attendance' },
    { id: 'chart', icon: FaSitemap, label: 'Organizational Chart', path: '/dashboard/chart', permission: 'view_charts' },
  ];

  useEffect(() => {
    if (variant !== 'admin' || !hasPermission('manage_users')) {
      setPendingProfileChangeRequests(0);
      return undefined;
    }

    let isMounted = true;

    const loadPendingCount = async () => {
      const { count } = await getPendingProfileChangeRequestsCount();
      if (isMounted) {
        setPendingProfileChangeRequests(count || 0);
      }
    };

    loadPendingCount();

    const handleDataChanged = (event) => {
      const scope = event?.detail?.scope || '';
      if (!scope || scope === 'profile_change_requests') {
        loadPendingCount();
      }
    };

    window.addEventListener('ignis-safe:data-changed', handleDataChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
    };
  }, [variant, hasPermission]);

  useEffect(() => {
    const role = String(currentUser?.role || '').toLowerCase();

    if (variant !== 'personnel' || role !== 'personnel' || !currentUser?.admin_id) {
      setHasPendingAnnouncementAck(false);
      return undefined;
    }

    let isMounted = true;

    const loadPendingAck = async () => {
      const { data } = await getPendingAcknowledgementCount(currentUser);
      if (isMounted) {
        setHasPendingAnnouncementAck((data?.pendingCount || 0) > 0);
      }
    };

    loadPendingAck();

    const handleDataChanged = (event) => {
      const scope = event?.detail?.scope || '';
      if (!scope || scope === 'announcements') {
        loadPendingAck();
      }
    };

    window.addEventListener('ignis-safe:data-changed', handleDataChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
    };
  }, [variant, currentUser]);

  useEffect(() => {
    if (isMobileSidebarOpen) {
      closeMobileSidebar();
    }
    // Only re-run when the route actually changes so this closes the
    // drawer on navigation without fighting the open/toggle handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useLayoutEffect(() => {
    const el = sidebarRef.current;
    if (el) {
      el.scrollTop = sidebarScrollPositions[variant] || 0;
    }
  }, [variant]);

  const handleSidebarScroll = (event) => {
    sidebarScrollPositions[variant] = event.currentTarget.scrollTop;
  };

  const handleNavItemClick = (event, item) => {
    if (variant !== 'personnel' || !hasPendingAnnouncementAck) return;
    if (item.path === PERSONNEL_ANNOUNCEMENTS_PATH) return;

    event.preventDefault();
    setShowAckRequiredModal(true);
  };

  const handleReturnToAnnouncement = () => {
    setShowAckRequiredModal(false);
    closeMobileSidebar();
    if (location.pathname !== PERSONNEL_ANNOUNCEMENTS_PATH) {
      navigate(PERSONNEL_ANNOUNCEMENTS_PATH);
    }
  };

  const appManagementItems = [
    { id: 'analytics', icon: FaChartLine, label: 'Analytics', path: '/dashboard/analytics', permission: 'view_analytics' },
    { id: 'users', icon: FaUserCog, label: 'Users', path: '/dashboard/users', permission: 'manage_users' },
    { id: 'learning-materials', icon: FaBookOpen, label: 'Learning Materials', path: '/dashboard/learning-materials', permission: 'manage_users' },
    { id: 'assessment-questions', icon: FaQuestionCircle, label: 'Assessment Questions', path: '/dashboard/assessment-questions', permission: 'manage_users' },
    { id: 'audit-logs', icon: FaClipboardList, label: 'Audit Logs', path: '/dashboard/audit-logs', permission: 'view_audit_logs' },
  ];

  const personnelMenuItems = [
    { id: 'operations', icon: FaCalendarCheck, label: 'Shift Schedule', path: '/personnel/operations' },
    { id: 'announcements', icon: FaBell, label: 'Announcements', path: '/personnel/announcements' },
    { id: 'attendance-personnel', icon: FaCalendarCheck, label: 'Attendance', path: '/attendance-personnel' },
    { id: 'reports', icon: FaFileAlt, label: 'Reports', path: '/reports' },
    { id: 'history', icon: FaHistory, label: 'Audit Logs', path: '/personnel/history' }
  ];

  // Filter menu items based on user permissions
  const visibleMenuItems = variant === 'personnel'
    ? personnelMenuItems
    : menuItems.filter(item => hasPermission(item.permission));
  const visibleAppManagementItems = variant === 'personnel'
    ? []
    : appManagementItems.filter(item => hasPermission(item.permission));

  const variantClass = variant ? `sidebar--${variant}` : '';
  const collapsedClass = isSidebarCollapsed ? 'sidebar--collapsed' : '';
  const mobileOpenClass = isMobileSidebarOpen ? 'sidebar--mobile-open' : '';

  return (
    <>
      {/* Backdrop for mobile menu */}
      {isMobileSidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeMobileSidebar}
        />
      )}

      <aside
        ref={sidebarRef}
        className={`sidebar ${variantClass} ${collapsedClass} ${mobileOpenClass}`.trim()}
        aria-hidden={!isMobileSidebarOpen && undefined}
        onScroll={handleSidebarScroll}
      >
        <div className="sidebar-header">
          <img src={inlogo} alt="Ignis Safe" className="sidebar-logo" />
          <span className="sidebar-title">IGNIS SAFE</span>
        </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">
          {visibleMenuItems.map((item) => (
            <li key={item.id}>
              <Link
                to={item.path}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                onClick={(event) => handleNavItemClick(event, item)}
              >
                <span className="nav-icon">{React.createElement(item.icon, { 'aria-hidden': true })}</span>
                <span className="nav-label">{item.label}</span>
                {Boolean(item.badge) && (
                  <span className="nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        {visibleAppManagementItems.length > 0 && (
          <div className="nav-section">
            <h4 className="section-title">App Management</h4>
            <ul className="nav-list">
              {visibleAppManagementItems.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                  >
                    <span className="nav-icon">{React.createElement(item.icon, { 'aria-hidden': true })}</span>
                    <span className="nav-label">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
      </aside>

      {showAckRequiredModal && (
        <div className="ack-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ackModalTitle">
          <div className="ack-modal">
            <div className="ack-modal-icon">!</div>
            <h3 id="ackModalTitle" className="ack-modal-title">Acknowledgement Required</h3>
            <p className="ack-modal-message">
              Please read and acknowledge the specific announcement or memorandum assigned to your account before accessing other sections.
            </p>
            <p className="ack-modal-message">
              Click the Acknowledge button on the announcement after reviewing its content. Once acknowledged, sidebar navigation will be available.
            </p>
            <div className="ack-modal-actions">
              <button
                type="button"
                className="ack-modal-btn ack-modal-btn-primary"
                onClick={handleReturnToAnnouncement}
              >
                Return to Announcement
              </button>
              <button
                type="button"
                className="ack-modal-btn ack-modal-btn-secondary"
                onClick={() => setShowAckRequiredModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
