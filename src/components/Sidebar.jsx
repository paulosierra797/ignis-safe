import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import inlogo from '../assets/inLOGO.png';
import './Dashboard.css';
import { useUser } from '../context/UserContext';
import { useLayout } from '../context/LayoutContext';

export default function Sidebar({ variant = 'admin' }) {
  const location = useLocation();
  const { hasPermission } = useUser();
  const { isSidebarCollapsed, isMobileSidebarOpen, closeMobileSidebar } = useLayout();

  const menuItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', path: '/dashboard', permission: 'view_dashboard' },
    { id: 'chart', icon: '📈', label: 'Chart', path: '/dashboard/chart', permission: 'view_charts' },
    { id: 'reports', icon: '📋', label: 'Reports', path: '/dashboard/reports', permission: 'view_dashboard' },
    { id: 'attendance-admin', icon: '📅', label: 'Attendance', path: '/attendance-admin', permission: 'view_attendance' },
    { id: 'accounts', icon: '👥', label: 'Personnel', path: '/dashboard/accounts', permission: 'view_accounts' },
  ];

 

  const appManagementItems = [
    { id: 'users', icon: '👤', label: 'User', path: '/dashboard/users', permission: 'manage_users' },
    { id: 'assessment-questions', icon: '❓', label: 'Questions', path: '/dashboard/assessment-questions', permission: 'manage_users' },
    { id: 'learning-materials', icon: '📚', label: 'Learning Materials', path: '/dashboard/learning-materials', permission: 'manage_users'},

    { id: 'announcements', icon: '🔔', label: 'Content Management', path: '/dashboard/announcements', permission: 'manage_users' },
    { id: 'analytics', icon: '📊', label: 'Analytics', path: '/dashboard/analytics', permission: 'view_analytics' },
    { id: 'progress', icon: '📈', label: 'Progress', path: '/dashboard/progress', permission: 'view_analytics' },
    { id: 'audit-logs', icon: '📋', label: 'Audit Logs', path: '/dashboard/audit-logs', permission: 'view_audit_logs' },
  ];

  const personnelMenuItems = [
    { id: 'operations', icon: '🗂️', label: 'Operations', path: '/personnel/operations' },
    { id: 'announcements', icon: '🔔', label: 'Announcements', path: '/personnel/announcements' },
    { id: 'attendance-personnel', icon: '🕐', label: 'Attendance', path: '/attendance-personnel' },
    { id: 'reports', icon: '📋', label: 'Reports', path: '/reports' },
    { id: 'history', icon: '📊', label: 'History', path: '/personnel/history' }
  ];

  // Filter menu items based on user permissions
  const visibleMenuItems = variant === 'personnel'
    ? personnelMenuItems
    : variant === 'intel-unit'
    ? intelUnitMenuItems
    : menuItems.filter(item => hasPermission(item.permission));
  const visibleAppManagementItems = variant === 'personnel' || variant === 'intel-unit'
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

      <aside className={`sidebar ${variantClass} ${collapsedClass} ${mobileOpenClass}`.trim()} aria-hidden={!isMobileSidebarOpen && undefined}>
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
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
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
                    <span className="nav-icon">{item.icon}</span>
                    <span className="nav-label">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
      </aside>
    </>
  );
}
