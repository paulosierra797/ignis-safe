import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, onAuthStateChange, signOut } from '../utils/authService';

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
        // ONLY react to real Supabase sessions
        if (session?.user) {
          refreshCurrentUser();
        }

        // IMPORTANT: DO NOT clear OTP users here
        if (event === 'SIGNED_OUT' && session) {
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
    await signOut();
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    setCurrentUser,
    refreshCurrentUser,
    switchRole,
    hasPermission,
    logout,
    loading
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
