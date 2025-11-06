'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWhop, useWhopAuth, useWhopCompany } from '@/lib/context/whop';

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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Check if companyId is valid (not placeholder or anonymous)
  // Allow dev-company in development mode
  const hasValidCompanyId = companyId && 
    companyId !== 'anonymous' && 
    companyId !== 'dev_app_id_placeholder' &&
    companyId !== '' &&
    (companyId === 'dev-company' || companyId !== 'dev_app_id_placeholder');

  // Show authentication required message if not authenticated or no valid company ID
  if (!isAuthenticated || !hasValidCompanyId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          <div className="text-red-500 text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Authentication Required
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            You need to be authenticated to access the dashboard. Please access this app through Whop.
          </p>
          <button
            onClick={refreshContext}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry Authentication
          </button>
        </div>
      </div>
    );
  }

  // This should not render as redirect happens in useEffect
  // But keeping as fallback in case redirect doesn't work
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-300">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}
