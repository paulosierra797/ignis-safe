import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  forgetCurrentDevice,
  getCurrentUser,
  onAuthStateChange,
  signOut
} from '../utils/authService';
import { isAuthFlowGated } from '../utils/authFlowGate';
import { logPersonnelActivity } from '../utils/activityLogService';

const DATA_CHANGED_EVENT = 'ignis-safe:data-changed';

const UserContext = createContext();

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
      setCurrentUser(user);
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    }

    setCurrentUser(null);
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
      setCurrentUser(user);
      return user;
    }

    return syncCurrentUser(null);

  } catch (error) {
    console.error("refreshCurrentUser error:", error);

    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
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
        setCurrentUser(JSON.parse(storedUser));
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
}, []);

  useEffect(() => {
    const handleDataChanged = () => {
      if (currentUser?.admin_id) {
        void refreshCurrentUser();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
      return () => window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    }

    return undefined;
  }, [currentUser?.admin_id]);

  

  const switchRole = (role) => {
    if (!currentUser) return;

    const rolePermissions = {
      admin: ['view_dashboard', 'view_charts', 'view_attendance', 'view_accounts', 'manage_users', 'view_analytics', 'view_progress', 'view_audit_logs', 'view_reports', 'manage_reports'],
      personnel: ['create_reports'], // Only report creation
      'fire-marshal': ['view_dashboard', 'view_reports', 'create_reports', 'view_attendance', 'view_analytics'],
      'intel-unit': ['view_reports', 'manage_reports'] // Report review and management
    };

    const updatedUser = {
      ...currentUser,
      role: role,
      permissions: rolePermissions[role] || []
    };

    setCurrentUser(updatedUser);
  };

  const hasPermission = (permission) => {
    if (!currentUser || !currentUser.permissions) return false;
    return currentUser.permissions.includes(permission);
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
    setCurrentUser(null);
  };

  const forgetThisDevice = async () => {
    return forgetCurrentDevice();
  };

  const value = {
    currentUser,
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
