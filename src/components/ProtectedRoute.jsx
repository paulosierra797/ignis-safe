import React from 'react';
import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { getPendingAcknowledgementCount } from '../utils/announcementsService';

export default function ProtectedRoute({ children, requiredPermission }) {
  const { currentUser, loading } = useUser();
  const location = useLocation();
  const [checkingAcknowledgement, setCheckingAcknowledgement] = useState(true);
  const [hasPendingAcknowledgement, setHasPendingAcknowledgement] = useState(false);

  useEffect(() => {
    const checkPendingAcknowledgements = async () => {
      const role = String(currentUser?.role || '').toLowerCase();
      const isPersonnel = role === 'personnel';

      if (!isPersonnel) {
        setHasPendingAcknowledgement(false);
        setCheckingAcknowledgement(false);
        return;
      }

      const isAnnouncementsPage = location.pathname === '/personnel/announcements';
      if (isAnnouncementsPage) {
        setHasPendingAcknowledgement(false);
        setCheckingAcknowledgement(false);
        return;
      }

      setCheckingAcknowledgement(true);
      const { data, error } = await getPendingAcknowledgementCount(currentUser);
      if (error) {
        setHasPendingAcknowledgement(false);
      } else {
        setHasPendingAcknowledgement((data?.pendingCount || 0) > 0);
      }
      setCheckingAcknowledgement(false);
    };

    if (!loading && currentUser) {
      checkPendingAcknowledgements();
    } else if (!loading) {
      setCheckingAcknowledgement(false);
    }
  }, [currentUser, loading, location.pathname]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (checkingAcknowledgement) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <p>Checking announcements...</p>
      </div>
    );
  }

  if (requiredPermission && !currentUser.permissions?.includes(requiredPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (hasPendingAcknowledgement) {
    return <Navigate to="/personnel/announcements" replace />;
  }

  return children;
}
