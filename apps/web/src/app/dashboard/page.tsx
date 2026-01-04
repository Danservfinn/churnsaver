'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWhop, useWhopAuth, useWhopCompany } from '@/lib/context/whop';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';

/**
 * Root dashboard route that redirects to company-scoped dashboard
 * 
 * This route preserves backward compatibility while ensuring all
 * dashboard access goes through the PRD-specified `/dashboard/[companyId]` route.
 */
export default function Dashboard() {
  const { isAuthenticated } = useWhopAuth();
  const { companyId, isLoading: companyLoading } = useWhopCompany();
  const { isLoading: contextLoading, refreshContext } = useWhop();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  // Track client-side mount to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Wait for company context to load and component to mount
    if (isMounted && !contextLoading && companyId && companyId !== 'anonymous' && companyId !== 'dev_app_id_placeholder') {
      // Redirect to company-scoped dashboard route
      router.replace(`/dashboard/${companyId}`);
    }
  }, [companyId, router, isMounted, contextLoading]);

  // Show loading state while context is being established or component is mounting
  // This ensures consistent server/client rendering
  if (!isMounted || contextLoading || companyLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Check if companyId is valid (not placeholder or anonymous)
  // Allow dev-company in development mode, or any non-placeholder companyId
  const hasValidCompanyId = companyId && 
    companyId !== 'anonymous' && 
    companyId !== 'dev_app_id_placeholder' &&
    companyId !== '';

  // Show authentication required message if not authenticated or no valid company ID
  if (!isAuthenticated || !hasValidCompanyId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              You need to be authenticated to access the dashboard. Please access this app through Whop.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={refreshContext}>
              Retry Authentication
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // This should not render as redirect happens in useEffect
  // But keeping as fallback in case redirect doesn't work
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}
