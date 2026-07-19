import React, { useState, useRef, useEffect } from 'react';
import { FaBars, FaSearch } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useLayout } from '../context/LayoutContext';
import './PageHeader.css';

const formatRoleLabel = (role) => {
  if (!role) {
    return 'User';
  }

  return role
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getDisplayName = (currentUser) => {
  if (!currentUser) {
    return 'User';
  }

  const fullName = [currentUser.first_name, currentUser.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const baseName = fullName || currentUser.name || currentUser.email || 'User';

  return `${currentUser.rank || ''} ${baseName}`.trim();
};

const PageHeader = ({
  title,
  searchQuery = '',
  onSearchChange = () => {},
  userName,
  userRole,
  userAvatar,
  variant = 'admin',
  showSearch = true,
  compact = false
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { currentUser, logout } = useUser();
  const { isSidebarCollapsed, toggleSidebar, toggleMobileSidebar } = useLayout();

  const resolvedUserName = userName ?? getDisplayName(currentUser);
  const resolvedUserRole = userRole ?? (variant === 'personnel'
    ? 'Personnel'
    : formatRoleLabel(currentUser?.role));
  const resolvedUserAvatar = userAvatar ?? currentUser?.avatar_url ?? '/user-avatar.png';
  const isAdminAccount = String(currentUser?.role || '').toLowerCase() === 'admin';
  const workspaceSwitchPath = variant === 'personnel' ? '/dashboard' : '/personnel/operations';
  const workspaceSwitchLabel = variant === 'personnel'
    ? 'Switch to Admin Workspace'
    : 'Switch to Personnel Workspace';

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleOpenProfile = () => {
    if (variant === 'personnel') {
      navigate('/personnel/profile');
      setIsDropdownOpen(false);
    }
  };

  const handleWorkspaceSwitch = () => {
    navigate(workspaceSwitchPath);
    setIsDropdownOpen(false);
  };

  const variantClass = variant ? `page-header--${variant}` : '';
  const compactClass = compact ? 'page-header--compact' : '';
  const showAvatar = variant !== 'admin';

  return (
    <div className={`page-header ${variantClass} ${compactClass}`.trim()}>
      <div className="page-header-left">
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={toggleMobileSidebar}
          aria-label={isSidebarCollapsed ? 'Expand side bar' : 'Toggle navigation menu'}
          title={isSidebarCollapsed ? 'Expand side bar' : 'Toggle navigation menu'}
        >
          <FaBars />
        </button>
        <h1 className="page-title">{title}</h1>
      </div>
      <div className="page-header-right">
        
        <div className="page-user-container" ref={dropdownRef}>
          <div 
            className={`page-user ${showAvatar ? '' : 'page-user--no-avatar'}`.trim()} 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {showAvatar && (
              <img
                src={resolvedUserAvatar}
                alt="User"
                className="page-user-avatar"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '/user-avatar.png';
                }}
              />
            )}
            <div className="page-user-info">
              <span className="page-user-name">{resolvedUserName}</span>
              <span className="page-user-role">{resolvedUserRole}</span>
            </div>
            <span className="page-user-arrow">▼</span>
          </div>
          {isDropdownOpen && (
            <div className="page-user-dropdown">
              {isAdminAccount && (
                <button className="dropdown-item" onClick={handleWorkspaceSwitch}>
                  {workspaceSwitchLabel}
                </button>
              )}
              {variant === 'personnel' && (
                <button className="dropdown-item" onClick={handleOpenProfile}>
                  Profile
                </button>
              )}
              <button className="dropdown-item dropdown-item--logout" onClick={handleLogout}>

                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
