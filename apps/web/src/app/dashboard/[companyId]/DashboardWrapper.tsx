'use client';

import { useWhop } from '@/lib/context/whop';
import { DashboardClient } from './DashboardClient';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface DashboardWrapperProps {
  companyId: string;
}

export function DashboardWrapper({ companyId }: DashboardWrapperProps) {
  const { userId, isLoading, error, isAuthenticated } = useWhop();

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((key) => (
            <Card key={key} className="p-4">
              <Skeleton className="h-5 w-24 mb-3" />
              <Skeleton className="h-10 w-20 mb-2" />
              <Skeleton className="h-4 w-32" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load authentication context: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <DashboardClient
      companyId={companyId}
      userId={userId}
      companyName={companyId}
      userName={isAuthenticated ? 'User' : 'Guest'}
    />
  );
}
