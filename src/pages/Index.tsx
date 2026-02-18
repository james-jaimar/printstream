import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/tracker/useUserRole';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import AppSelector from './AppSelector';

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { userRole, isLoading: roleLoading, isLabelsUser, isAdmin, isManager } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('🏠 Index - authLoading:', authLoading, 'roleLoading:', roleLoading, 'user:', !!user, 'userRole:', userRole);
    
    // Redirect to auth if not logged in
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }

    // If user is authenticated and role is loaded, check for operator redirect
    if (!authLoading && !roleLoading && user) {
      // Redirect DTP operators to their specialized workflow
      if (userRole === 'dtp_operator') {
        navigate('/tracker/dtp-workflow');
        return;
      }
      // Redirect packaging operators to their specialized workflow
      if (userRole === 'packaging_operator') {
        navigate('/tracker/packaging-shipping');
        return;
      }
      // Redirect regular operators to factory floor
      if (userRole === 'operator') {
        navigate('/tracker/factory-floor');
        return;
      }
      // Redirect Labels group users to Labels dashboard
      if (isLabelsUser && !isAdmin && !isManager) {
        navigate('/labels');
        return;
      }
    }
  }, [user, authLoading, userRole, roleLoading, isLabelsUser, isAdmin, isManager, navigate]);

  // Show loading while checking auth and role
  if (authLoading || roleLoading) {
    console.log('⏳ Index rendering loading state - authLoading:', authLoading, 'roleLoading:', roleLoading);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center space-y-4">
          <LoadingSpinner />
          <p className="text-gray-600">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if redirecting
  if (!user || userRole === 'operator' || userRole === 'dtp_operator' || userRole === 'packaging_operator' || (isLabelsUser && !isAdmin && !isManager)) {
    return null;
  }

  return <AppSelector />;
};

export default Index;
