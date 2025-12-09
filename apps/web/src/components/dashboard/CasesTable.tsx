'use client';

import { useState, useTransition, useEffect } from 'react';
import { AccessibilityUtils } from '@/lib/accessibility';
import { AccessibleTable, AccessibleTableCell, AccessibleTableRow } from '@/components/ui/AccessibleTable';
import { AccessibleButton } from '@/components/ui/AccessibleButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, X, Calendar, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';

/**
 * Represents a recovery case in the system
 */
interface RecoveryCase {
  id: string;
  membership_id: string;
  user_id: string;
  company_id: string;
  status: string;
  attempts: number;
  incentive_days: number;
  recovered_amount_cents: number;
  failure_reason: string | null;
  recovery_type: string | null;
  first_failure_at: string;
  last_nudge_at: string | null;
  created_at: string;
}

/**
 * Props for the CasesTable component
 * @param cases - Array of recovery cases to display
 * @param isLoading - Optional loading state indicator
 * @param total - Total number of recovery cases
 * @param page - Current page number
 * @param limit - Number of cases per page
 * @param totalPages - Total number of pages
 * @param onPageChange - Optional callback for page changes
 */
/**
 * Props for the CasesTable component
 */
interface CasesTableProps {
  cases: RecoveryCase[];
  isLoading?: boolean;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
}

/**
 * CasesTable Component
 *
 * Displays recovery cases in a tabular format with filtering and pagination
 * @param props - Component props
 * @returns JSX element
 */

export function CasesTable({
  cases,
  isLoading,
  total,
  page,
  limit,
  totalPages,
  onPageChange
}: CasesTableProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initialize accessibility features
  useEffect(() => {
    AccessibilityUtils.initialize({
      announcePageChanges: true,
      announceFormErrors: true,
      focusManagement: true,
      keyboardNavigation: true,
      screenReaderSupport: true,
      colorContrast: true,
      reducedMotion: true
    });
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatStatus = (status: string) => {
    const statusConfig = {
      open: { 
        label: 'Open', 
        variant: 'warning' as const,
        icon: <AlertCircle className="h-3 w-3" />
      },
      recovered: { 
        label: 'Recovered', 
        variant: 'success' as const,
        icon: <CheckCircle2 className="h-3 w-3" />
      },
      closed_no_recovery: { 
        label: 'Closed', 
        variant: 'destructive' as const,
        icon: <XCircle className="h-3 w-3" />
      }
    };

    const config = statusConfig[status as keyof typeof statusConfig] ||
                  { label: status, variant: 'default' as const, icon: null };

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatRecoveryType = (recoveryType: string | null) => {
    if (!recoveryType) return <Badge variant="outline">Unattributed</Badge>;
    if (recoveryType === 'CLICK_THROUGH') {
      return <Badge variant="success">Click-through</Badge>;
    }
    if (recoveryType === 'ORGANIC') {
      return <Badge variant="secondary">Organic</Badge>;
    }
    if (recoveryType === 'LEGACY_UNKNOWN') {
      return <Badge variant="outline">Legacy</Badge>;
    }
    return <Badge variant="outline">{recoveryType}</Badge>;
  };

  const handleNudge = async (caseId: string) => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseId}/nudge`, {
          method: 'POST',
        });

        const result = await response.json();

        setMessage({
          type: result.success ? 'success' : 'error',
          text: result.message || result.error || 'Unknown error'
        });

        // Announce to screen readers
        if (result.success) {
          AccessibilityUtils.announceToScreenReader('Nudge sent successfully');
        } else {
          AccessibilityUtils.announceToScreenReader('Failed to send nudge', 'assertive');
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to send nudge'
        });
        
        AccessibilityUtils.announceToScreenReader('Failed to send nudge', 'assertive');
      }

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    });
  };

  const handleCancel = async (caseId: string) => {
    // Use accessible confirmation dialog instead of browser confirm
    const confirmed = window.confirm('Are you sure you want to cancel this recovery case? This will stop all future reminders.');
    
    if (!confirmed) {
      AccessibilityUtils.announceToScreenReader('Case cancellation cancelled');
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseId}/cancel`, {
          method: 'POST',
        });

        const result = await response.json();

        setMessage({
          type: result.success ? 'success' : 'error',
          text: result.message || result.error || 'Unknown error'
        });

        // Announce to screen readers
        if (result.success) {
          AccessibilityUtils.announceToScreenReader('Recovery case cancelled successfully');
        } else {
          AccessibilityUtils.announceToScreenReader('Failed to cancel recovery case', 'assertive');
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to cancel case'
        });
        
        AccessibilityUtils.announceToScreenReader('Failed to cancel recovery case', 'assertive');
      }

      setTimeout(() => setMessage(null), 3000);
    });
  };

  const handleCancelMembership = async (caseId: string) => {
    if (!confirm('Are you sure you want to cancel this membership at the end of the current billing period? The user will lose access when their period ends.')) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseId}/cancel-membership`, {
          method: 'POST',
        });

        const result = await response.json();

        setMessage({
          type: result.success ? 'success' : 'error',
          text: result.message || result.error || 'Unknown error'
        });
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to cancel membership'
        });
      }

      setTimeout(() => setMessage(null), 3000);
    });
  };

  const handleTerminate = async (caseId: string) => {
    const confirmed = window.confirm('Are you sure you want to terminate this membership? This will cancel their subscription immediately.');
    
    if (!confirmed) {
      AccessibilityUtils.announceToScreenReader('Membership termination cancelled');
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseId}/terminate`, {
          method: 'POST',
        });

        const result = await response.json();

        setMessage({
          type: result.success ? 'success' : 'error',
          text: result.message || result.error || 'Unknown error'
        });

        // Announce to screen readers
        if (result.success) {
          AccessibilityUtils.announceToScreenReader('Membership terminated successfully');
        } else {
          AccessibilityUtils.announceToScreenReader('Failed to terminate membership', 'assertive');
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to terminate membership'
        });
        
        AccessibilityUtils.announceToScreenReader('Failed to terminate membership', 'assertive');
      }

      setTimeout(() => setMessage(null), 3000);
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4" role="status" aria-live="polite">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 flex-1" />
                <Skeleton className="h-12 w-32" />
                <Skeleton className="h-12 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (cases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recovery Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            illustration={
              <div className="w-64 h-64 relative">
                <Image
                  src="/illustrations/empty-cases.svg"
                  alt=""
                  fill
                  className="object-contain"
                  aria-hidden="true"
                />
              </div>
            }
            title="No recovery cases yet"
            description="Cases will appear here automatically when payment failures occur. We'll track recovery progress and show metrics as cases are created."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recovery Cases</CardTitle>
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            {total} {total === 1 ? 'case' : 'cases'}
          </div>
        </div>
      </CardHeader>

      {/* Message display */}
      {message && (
        <div className="px-6 py-3">
          <Alert variant={message.type === 'success' ? 'success' : 'destructive'}>
            <AlertDescription className="flex items-center justify-between">
              <span>{message.text}</span>
              <button
                onClick={() => setMessage(null)}
                className="ml-4 text-current opacity-70 hover:opacity-100"
                aria-label="Dismiss message"
              >
                <X className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <main>
        <AccessibleTable
          caption="Recovery Cases"
          description="List of all recovery cases with their status and available actions"
          pagination={{
            currentPage: page,
            totalPages,
            onPageChange: onPageChange || (() => {})
          }}
        >
          <thead>
            <tr>
              <AccessibleTableCell scope="col">Status</AccessibleTableCell>
              <AccessibleTableCell scope="col">Membership</AccessibleTableCell>
              <AccessibleTableCell scope="col">First Failure</AccessibleTableCell>
              <AccessibleTableCell scope="col">Attempts</AccessibleTableCell>
              <AccessibleTableCell scope="col">Recovered</AccessibleTableCell>
              <AccessibleTableCell scope="col">Attribution</AccessibleTableCell>
              <AccessibleTableCell scope="col">Reason</AccessibleTableCell>
              <AccessibleTableCell scope="col">Actions</AccessibleTableCell>
            </tr>
          </thead>
          <tbody>
            {cases.map((case_) => (
              <AccessibleTableRow key={case_.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {formatStatus(case_.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {case_.membership_id.slice(-8)}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {case_.user_id.slice(-8)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    {formatDate(case_.first_failure_at)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant="outline" className="font-mono">
                    {case_.attempts}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                  {case_.recovered_amount_cents > 0 ? (
                    <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                      <DollarSign className="h-4 w-4" />
                      {formatCurrency(case_.recovered_amount_cents)}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {formatRecoveryType(case_.recovery_type)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {case_.failure_reason || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Case actions">
                    {case_.status === 'open' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleNudge(case_.id)}
                          disabled={isPending}
                          aria-label="Send another reminder for this case"
                          className="h-8"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Nudge
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(case_.id)}
                          disabled={isPending}
                          aria-label="Cancel this recovery case"
                          className="h-8"
                        >
                          Cancel Case
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelMembership(case_.id)}
                      disabled={isPending}
                      aria-label="Cancel membership at period end"
                      className="h-8 text-xs"
                    >
                      Cancel Period End
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleTerminate(case_.id)}
                      disabled={isPending}
                      aria-label="Terminate membership immediately"
                      className="h-8 text-xs"
                    >
                      Terminate
                    </Button>
                  </div>
                </td>
              </AccessibleTableRow>
            ))}
          </tbody>
        </AccessibleTable>
      </main>
    </Card>
  );
}
