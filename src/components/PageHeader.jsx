import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaBars } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useLayout } from '../context/LayoutContext';
import { ALREADY_FORGOTTEN_DEVICE_MESSAGE } from '../utils/authService';
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
  userName,
  userRole,
  userAvatar,
  variant = 'admin',
  compact = false,
  onNavigationRequest
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [forgetDialog, setForgetDialog] = useState({
    isOpen: false,
    status: 'confirm',
    message: ''
  });
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const {
    currentUser,
    accountUser,
    checkCurrentDeviceTrust,
    forgetThisDevice,
    logout
  } = useUser();
  const { isSidebarCollapsed, toggleMobileSidebar } = useLayout();

  const resolvedUserName = userName ?? getDisplayName(currentUser);
  const resolvedUserRole = userRole ?? (variant === 'personnel'
    ? 'Personnel'
    : formatRoleLabel(currentUser?.role));
  const resolvedUserAvatar = userAvatar ?? currentUser?.avatar_url ?? '/user-avatar.svg';
  const isAdminAccount = String(accountUser?.role || currentUser?.role || '').toLowerCase() === 'admin';
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

  const requestNavigation = (navigation) => {
    setIsDropdownOpen(false);

    if (onNavigationRequest) {
      onNavigationRequest(navigation);
      return;
    }

    navigation.action();
  };

  const handleLogout = () => {
    requestNavigation({
      to: '/',
      action: async () => {
        await logout();
        navigate('/');
      }
    });
  };

  const handleForgetThisDevice = async () => {
    setIsDropdownOpen(false);
    setForgetDialog({ isOpen: true, status: 'loading', message: 'Checking device status...' });

    const { trusted, error } = await checkCurrentDeviceTrust();
    if (error) {
      setForgetDialog({ isOpen: true, status: 'error', message: error });
      return;
    }

    if (!trusted) {
      setForgetDialog({
        isOpen: true,
        status: 'already-forgotten',
        message: ALREADY_FORGOTTEN_DEVICE_MESSAGE
      });
      return;
    }

    setForgetDialog({ isOpen: true, status: 'confirm', message: '' });
  };

  const closeForgetDialog = () => {
    if (forgetDialog.status === 'loading') return;
    setForgetDialog({ isOpen: false, status: 'confirm', message: '' });
  };

  const confirmForgetThisDevice = async () => {
    setForgetDialog({ isOpen: true, status: 'loading', message: '' });

    const { error, alreadyForgotten } = await forgetThisDevice();
    if (error) {
      setForgetDialog({
        isOpen: true,
        status: 'error',
        message: error
      });
      return;
    }

    if (alreadyForgotten) {
      setForgetDialog({
        isOpen: true,
        status: 'already-forgotten',
        message: ALREADY_FORGOTTEN_DEVICE_MESSAGE
      });
      return;
    }

    setForgetDialog({ isOpen: true, status: 'success', message: '' });
  };

  const profilePath = variant === 'personnel' ? '/personnel/profile' : '/dashboard/profile';

  const handleOpenProfile = () => {
    if (variant === 'personnel' || variant === 'admin') {
      requestNavigation({
        to: profilePath,
        action: () => navigate(profilePath)
      });
    }
  };

  const handleWorkspaceSwitch = () => {
    requestNavigation({
      to: workspaceSwitchPath,
      action: () => navigate(workspaceSwitchPath)
    });
  };

  const variantClass = variant ? `page-header--${variant}` : '';
  const compactClass = compact ? 'page-header--compact' : '';

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
          <button
            type="button"
            className="page-user"
            aria-haspopup="menu"
            aria-expanded={isDropdownOpen}
            aria-label={`Account menu for ${resolvedUserName}, ${resolvedUserRole}`}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <img
              src={resolvedUserAvatar}
              alt=""
              width="32"
              height="32"
              decoding="async"
              className="page-user-avatar"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/user-avatar.svg';
              }}
            />
            <div className="page-user-info">
              <span className="page-user-name">{resolvedUserName}</span>
              <span className="page-user-role">{resolvedUserRole}</span>
            </div>
            <span className="page-user-arrow" aria-hidden="true">▼</span>
          </button>
          {isDropdownOpen && (
            <div className="page-user-dropdown">
              {isAdminAccount && (
                <button className="dropdown-item" onClick={handleWorkspaceSwitch}>
                  {workspaceSwitchLabel}
                </button>
              )}
              {(variant === 'personnel' || variant === 'admin') && (
                <button className="dropdown-item" onClick={handleOpenProfile}>
                  Profile
                </button>
              )}
              <button className="dropdown-item dropdown-item--security" onClick={handleForgetThisDevice}>
                Forget this device
              </button>
              <button className="dropdown-item dropdown-item--logout" onClick={handleLogout}>

                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {forgetDialog.isOpen && createPortal(
        <div className="device-dialog-backdrop" role="presentation" onMouseDown={closeForgetDialog}>
          <section
            className={`device-dialog device-dialog--${forgetDialog.status}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="device-dialog-icon" aria-hidden="true">
              {forgetDialog.status === 'success' ? '✓' : forgetDialog.status === 'error' ? '!' : '?'}
            </div>

            <h2 id="device-dialog-title">
              {forgetDialog.status === 'success'
                ? 'Device forgotten'
                : forgetDialog.status === 'already-forgotten'
                  ? 'Device already forgotten'
                : forgetDialog.status === 'error'
                  ? 'Unable to forget device'
                  : 'Forget this device?'}
            </h2>

            <p>
              {forgetDialog.status === 'success'
                ? 'You will need an email OTP the next time you log in on this browser. Your current session remains active.'
                : forgetDialog.status === 'already-forgotten'
                  ? forgetDialog.message
                : forgetDialog.status === 'error'
                  ? forgetDialog.message || 'Please try again.'
                  : 'This browser will no longer skip email OTP on your next login.'}
            </p>

            {forgetDialog.status === 'loading' ? (
              <div className="device-dialog-loading" role="status">
                <span className="device-dialog-spinner" aria-hidden="true" />
                {forgetDialog.message || 'Forgetting device...'}
              </div>
            ) : (
              <div className="device-dialog-actions">
                {forgetDialog.status === 'confirm' && (
                  <button type="button" className="device-dialog-button device-dialog-button--secondary" onClick={closeForgetDialog}>
                    Cancel
                  </button>
                )}
                {forgetDialog.status === 'confirm' && (
                  <button type="button" className="device-dialog-button device-dialog-button--danger" onClick={confirmForgetThisDevice}>
                    Forget Device
                  </button>
                )}
                {forgetDialog.status === 'error' && (
                  <button type="button" className="device-dialog-button device-dialog-button--danger" onClick={confirmForgetThisDevice}>
                    Try Again
                  </button>
                )}
                {(forgetDialog.status === 'success'
                  || forgetDialog.status === 'already-forgotten'
                  || forgetDialog.status === 'error') && (
                  <button type="button" className="device-dialog-button device-dialog-button--secondary" onClick={closeForgetDialog}>
                    {forgetDialog.status === 'success' ? 'Done' : 'Close'}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PageHeader;
