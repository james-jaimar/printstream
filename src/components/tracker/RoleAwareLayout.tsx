
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useUserRole } from "@/hooks/tracker/useUserRole";
import TrackerLayout from "@/components/TrackerLayout";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Layout component that manages access based on user roles
 * 
 * This component handles role-based access control and default routing:
 * - DTP operators are directed to the DTP workflow dashboard
 * - Regular operators are directed to factory floor
 * - Admins, managers see the full tracker layout
 */
const RoleAwareLayout: React.FC = () => {
  const { userRole, isLoading, isOperator, isAdmin, isManager, isDtpOperator, isPackagingOperator, isViewer } = useUserRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    // Don't proceed with routing logic until role detection is complete
    if (isLoading) return;

    console.log('🔄 RoleAwareLayout access check:', {
      userRole,
      isOperator,
      isAdmin,
      isManager,
      isDtpOperator,
      isPackagingOperator,
      isViewer,
      currentPath: location.pathname,
      hasInitialized
    });

    // Only handle default routing on first load to /tracker
    if (!hasInitialized && location.pathname === '/tracker') {
      setHasInitialized(true);
      
      // Route to appropriate default based on role
      if (isDtpOperator && !isAdmin && !isManager) {
        console.log('🔄 Redirecting DTP operator to DTP workflow');
        navigate('/tracker/dtp-workflow', { replace: true });
        return;
      }

      if (isPackagingOperator && !isAdmin && !isManager) {
        console.log('🔄 Redirecting Packaging operator to Packaging & Shipping workflow');
        navigate('/tracker/packaging-shipping', { replace: true });
        return;
      }
      
      if (isOperator && !isDtpOperator && !isPackagingOperator && !isAdmin && !isManager) {
        console.log('🔄 Redirecting regular operator to factory floor');
        navigate('/tracker/factory-floor', { replace: true });
        return;
      }
      
      // Viewers (sales) go to dashboard
      if (isViewer) {
        console.log('🔄 Redirecting viewer to dashboard');
        navigate('/tracker/dashboard', { replace: true });
        return;
      }

      // Admins and managers go to dashboard
      console.log('🔄 Redirecting to dashboard');
      navigate('/tracker/dashboard', { replace: true });
      return;
    }

    setHasInitialized(true);
  }, [userRole, isLoading, isOperator, isAdmin, isManager, isDtpOperator, isPackagingOperator, isViewer, navigate, location.pathname, hasInitialized]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center space-y-4">
          <LoadingSpinner />
          <p className="text-gray-600">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // Show error state if role detection failed
  if (!userRole) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center space-y-4 p-6 max-w-md text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <h2 className="text-xl font-semibold">Unable to load workspace</h2>
          <p className="text-gray-600">
            We're having trouble determining your access level. You can try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  // Use TrackerLayout for all users - let it handle role-based features internally
  return <TrackerLayout />;
};

export default RoleAwareLayout;
