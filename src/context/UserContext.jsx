import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  forgetCurrentDevice,
  getCurrentUser,
  onAuthStateChange,
  signOut
} from '../utils/authService';
import { isAuthFlowGated } from '../utils/authFlowGate';
import { logPersonnelActivity } from '../utils/activityLogService';
import { getPersonnelWorkspaceProfile } from '../utils/usersService';

const DATA_CHANGED_EVENT = 'ignis-safe:data-changed';

const UserContext = createContext();
const PERSONNEL_WORKSPACE_PATHS = [
  '/personnel',
  '/attendance-personnel',
  '/attendance-login',
  '/attendance-scan',
  '/attendance-confirm',
  '/reports'
];

const isPersonnelWorkspacePath = (pathname) =>
  PERSONNEL_WORKSPACE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

// eslint-disable-next-line react-refresh/only-export-components
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const location = useLocation();
  const [accountUser, setAccountUser] = useState(null);
  const [personnelWorkspaceUser, setPersonnelWorkspaceUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const isPersonnelWorkspace = isPersonnelWorkspacePath(location.pathname);
  const isAdminAccount = String(accountUser?.role || '').toLowerCase() === 'admin';
  const currentUser = isPersonnelWorkspace && isAdminAccount
    ? (personnelWorkspaceUser || {
      ...accountUser,
      role: 'personnel',
      permissions: [],
      account_role: 'admin',
      is_personnel_workspace_profile: true
    })
    : accountUser;

  const setCurrentUser = (nextValue) => {
    const nextUser = typeof nextValue === 'function' ? nextValue(currentUser) : nextValue;
    if (isPersonnelWorkspace && isAdminAccount && nextUser?.is_personnel_workspace_profile) {
      setPersonnelWorkspaceUser(nextUser);
      return;
    }
    setAccountUser(nextUser);
  };

  const syncCurrentUser = (user) => {
    if (user) {
      // Guard against a partial/failed profile fetch (RLS hiccup, network
      // blip, or a caller accidentally passing a bare auth-user object)
      // blanking out an already-loaded valid profile — only accept a fetch
      // that actually resolved a full admin/personnel record.
      if (!user.admin_id) {
        console.warn('Ignoring incomplete user profile sync (missing admin_id); keeping existing profile.');
        return null;
      }
      setAccountUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    }

    setAccountUser(null);
    setPersonnelWorkspaceUser(null);
    localStorage.removeItem('user');
    return null;
  };

  
  const refreshCurrentUser = async () => {
  try {
    const { data } = await getCurrentUser();

    if (data) {
      return syncCurrentUser(data);
    }

    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      const user = JSON.parse(storedUser);
      setAccountUser(user);
      return user;
    }

    return syncCurrentUser(null);

  } catch (error) {
    console.error("refreshCurrentUser error:", error);

    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      const user = JSON.parse(storedUser);
      setAccountUser(user);
      return user;
    }

    return syncCurrentUser(null);
  }
};

 useEffect(() => {
  let unsubscribe;

  const initializeAuth = async () => {
    try {
      const storedUser = localStorage.getItem('user');

      if (storedUser) {
        setAccountUser(JSON.parse(storedUser));
      }

      await refreshCurrentUser();

      // ONLY listen to Supabase IF session exists (optional safe sync)
      const { data: authListener } = onAuthStateChange((event, session) => {
        // While LoginPage is mid-decision (password verified, still
        // determining trusted-device vs OTP-required), ignore auth events
        // so a password-only session can't prematurely mark the app as
        // logged in before OTP/trust is actually resolved.
        if (isAuthFlowGated()) {
          return;
        }

        // ONLY react to real Supabase sessions
        if (session?.user) {
          refreshCurrentUser();
        }

        if (event === 'SIGNED_OUT') {
          syncCurrentUser(null);
        }
      });

      unsubscribe = authListener?.subscription?.unsubscribe;
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      setLoading(false);
    }
  };

  initializeAuth();

  return () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
// Authentication initialization intentionally runs once per provider mount.
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  useEffect(() => {
    let isCancelled = false;

    const loadPersonnelWorkspaceUser = async () => {
      if (!isPersonnelWorkspace || !isAdminAccount || !accountUser?.admin_id) {
        setPersonnelWorkspaceUser(null);
        return;
      }

      const { data, error } = await getPersonnelWorkspaceProfile(accountUser);
      if (!isCancelled && data && !error) {
        setPersonnelWorkspaceUser(data);
      }
    };

    void loadPersonnelWorkspaceUser();
    return () => {
      isCancelled = true;
    };
  }, [accountUser, isAdminAccount, isPersonnelWorkspace]);

  useEffect(() => {
    const handleDataChanged = () => {
      if (accountUser?.admin_id) {
        void refreshCurrentUser();
        if (isPersonnelWorkspace && isAdminAccount) {
          void getPersonnelWorkspaceProfile(accountUser).then(({ data }) => {
            if (data) setPersonnelWorkspaceUser(data);
          });
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
      return () => window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    }

    return undefined;
  // The listener is keyed to identity and workspace; refreshCurrentUser is intentionally not reactive.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUser?.admin_id, isAdminAccount, isPersonnelWorkspace]);

  

  const switchRole = (role) => {
    if (!accountUser) return;

    const rolePermissions = {
      admin: ['view_dashboard', 'view_charts', 'view_attendance', 'view_accounts', 'manage_users', 'view_analytics', 'view_progress', 'view_audit_logs', 'view_reports', 'manage_reports'],
      personnel: ['create_reports']
    };

    if (!Object.hasOwn(rolePermissions, role)) return;

    const updatedUser = {
      ...accountUser,
      role: role,
      permissions: rolePermissions[role] || []
    };

    setAccountUser(updatedUser);
  };

  const hasPermission = (permission) => {
    if (!accountUser || !accountUser.permissions) return false;
    return accountUser.permissions.includes(permission);
  };

  const logout = async () => {
    if (String(currentUser?.role || '').toLowerCase() === 'personnel' && currentUser?.admin_id) {
      await logPersonnelActivity({
        personnelId: currentUser.admin_id,
        activityType: 'logout',
        action: 'Logout',
        details: 'Logged out successfully.'
      });
    }

    await signOut();
    setAccountUser(null);
    setPersonnelWorkspaceUser(null);
  };

  const forgetThisDevice = async () => {
    return forgetCurrentDevice();
  };

  const value = {
    currentUser,
    accountUser,
    setCurrentUser,
    refreshCurrentUser,
    switchRole,
    hasPermission,
    logout,
    forgetThisDevice,
    loading
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
