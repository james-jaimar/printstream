import React from 'react';
import { Navigate } from 'react-router-dom';
import { useClientAuth } from '@/hooks/labels/useClientAuth';
import { Loader2 } from 'lucide-react';

interface ClientPortalGuardProps {
  children: React.ReactNode;
}

export default function ClientPortalGuard({ children }: ClientPortalGuardProps) {
  const { isAuthenticated, isLoading } = useClientAuth();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/labels/portal/login" replace />;
  }

  return <>{children}</>;
}
