import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { getPendingAcknowledgementCount } from '../utils/announcementsService';
import { signOut } from '../utils/authService';
import { supabase } from '../utils/supabaseClient';

export default function ProtectedRoute({ children, requiredPermission, allowedRoles = [] }) {
  const { currentUser, loading } = useUser();
  const location = useLocation();
  const role = String(currentUser?.role || '').toLowerCase();
  const shouldCheckAcknowledgements = !loading
    && Boolean(currentUser?.admin_id)
    && role === 'personnel'
    && location.pathname !== '/personnel/announcements';
  const acknowledgementKey = shouldCheckAcknowledgements
    ? `${currentUser.admin_id}:${location.pathname}`
    : '';
  const [acknowledgementResult, setAcknowledgementResult] = useState({
    key: '',
    hasPending: false
  });

  useEffect(() => {
    if (!acknowledgementKey) return undefined;
    let isCancelled = false;

    const timeoutId = window.setTimeout(async () => {
      const { data, error } = await getPendingAcknowledgementCount(currentUser);
      if (!isCancelled) {
        setAcknowledgementResult({
          key: acknowledgementKey,
          hasPending: !error && (data?.pendingCount || 0) > 0
        });
      }
    }, 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [acknowledgementKey, currentUser]);

  const checkingAcknowledgement = Boolean(
    acknowledgementKey && acknowledgementResult.key !== acknowledgementKey
  );
  const hasPendingAcknowledgement = acknowledgementResult.key === acknowledgementKey
    && acknowledgementResult.hasPending;

  const normalizedStatus = String(currentUser?.status || '').trim().toLowerCase();
  const isDeactivated = normalizedStatus === 'inactive' || normalizedStatus === 'suspended';

  useEffect(() => {
    if (!isDeactivated) return;

    const revokeAndSignOut = async () => {
      try {
        await supabase.rpc('revoke_all_devices');
      } catch (revokeError) {
        console.warn('Could not revoke trusted devices for deactivated account:', revokeError);
      }
      await signOut();
    };

    void revokeAndSignOut();
  }, [isDeactivated]);

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

  if (isDeactivated) {
    return <Navigate to="/login" replace />;
  }

  const normalizedRole = String(currentUser.role || '').trim().toLowerCase();
  if (allowedRoles.length > 0 && !allowedRoles.includes(normalizedRole)) {
    const fallbackPath = normalizedRole === 'admin'
      ? '/dashboard'
      : normalizedRole === 'personnel'
        ? '/personnel/operations'
        : '/login';
    return <Navigate to={fallbackPath} replace />;
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
    return <Navigate to={normalizedRole === 'personnel' ? '/personnel/operations' : '/dashboard'} replace />;
  }

  if (hasPendingAcknowledgement) {
    return <Navigate to="/personnel/announcements" replace />;
  }

  return children;
}
