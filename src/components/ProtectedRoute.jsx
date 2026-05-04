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
    // render the protected children immediately and show a small non-blocking
    // indicator while the pending-acknowledgement check runs. This avoids
    // a full-page blocking overlay (which interrupts flows such as saving
    // profile/password) while still informing the user that a background
    // check is in progress.
    return (
      <>
        {children}
        <div style={{
          position: 'fixed',
          top: 16,
          right: 16,
          background: 'rgba(255,255,255,0.95)',
          padding: '8px 12px',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
          zIndex: 9999,
          fontSize: '0.95rem',
          color: '#374151'
        }}>
          Checking announcements...
        </div>
      </>
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
