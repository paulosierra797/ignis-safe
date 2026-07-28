import { useEffect, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { endAppSession, startAppSession } from '../utils/appSessionService';
import { touchBackofficeActivity } from '../utils/authService';

export default function AppSessionTracker() {
  const { currentUser } = useUser();
  const activeSessionRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;
    const adminId = currentUser?.admin_id || null;
    const userRole = String(currentUser?.role || '').toLowerCase();
    const isMobilePersonnel = userRole === 'personnel' || userRole === 'mobile-user';
    const tracksBackofficeActivity = userRole === 'admin' || userRole === 'personnel';

    const closeSession = async (reason) => {
      const activeSession = activeSessionRef.current;
      if (!activeSession?.sessionId) return;

      activeSessionRef.current = null;
      await endAppSession({ ...activeSession, reason });
    };

    const openSession = async () => {
      if (!adminId || !isMobilePersonnel) return;

      const { data } = await startAppSession(adminId);
      if (!isCancelled && data) {
        activeSessionRef.current = data;
      }
    };

    if (activeSessionRef.current?.adminId && activeSessionRef.current.adminId !== adminId) {
      void closeSession('user_changed');
    }

    if (adminId && isMobilePersonnel) {
      void openSession();
    } else if (activeSessionRef.current?.sessionId) {
      void closeSession('non_mobile_user');
    }

    const updateActivity = () => {
      if (adminId && tracksBackofficeActivity && document.visibilityState !== 'hidden') {
        void touchBackofficeActivity();
      }
    };
    updateActivity();
    const activityInterval = window.setInterval(updateActivity, 5 * 60 * 1000);

    const handlePageHide = () => {
      void closeSession('pagehide');
    };

    const handleBeforeUnload = () => {
      void closeSession('beforeunload');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      isCancelled = true;

      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      window.clearInterval(activityInterval);

      void closeSession(adminId && isMobilePersonnel ? 'cleanup' : 'logout');
    };
  }, [currentUser?.admin_id, currentUser?.role]);

  return null;
}
