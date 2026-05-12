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
      return syncCurrentUser(data);
    } catch (error) {
      console.error('Error refreshing current user:', error);
      return syncCurrentUser(null);
    }
  };

  useEffect(() => {
    let unsubscribe;

    const initializeAuth = async () => {
      try {
        // Check if user is logged in on mount
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            setCurrentUser(JSON.parse(storedUser));
          } catch (e) {
            console.error('Error parsing stored user:', e);
            localStorage.removeItem('user');
          }
        }

        // Get current user from Supabase
        await refreshCurrentUser();
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }

      // Listen for auth changes (only set up once)
      const { data: authListener } = onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          try {
            await refreshCurrentUser();
          } catch (error) {
            console.error('Error on sign in:', error);
          }
        } else if (event === 'SIGNED_OUT') {
          syncCurrentUser(null);
        }
      });

      unsubscribe = authListener?.subscription?.unsubscribe;
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

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('user', JSON.stringify(currentUser));
      return;
    }

    localStorage.removeItem('user');
  }, [currentUser]);

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
