'use client';

import { useState, useTransition, useEffect } from 'react';
import { AccessibilityUtils } from '@/lib/accessibility';
import { AccessibleTable, AccessibleTableCell, AccessibleTableRow } from '@/components/ui/AccessibleTable';
import { AccessibleButton } from '@/components/ui/AccessibleButton';

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
/**
/**
 * CasesTable Component
 *
 * Displays recovery cases in a tabular format with filtering and pagination
 * @param props - Component props
 * @returns JSX element
 */
 * CasesTable Component
 *
 * Displays recovery cases in a tabular format with filtering and pagination
 * @param cases - Array of recovery cases to display
 * @param onCaseAction - Callback for case actions (cancel, terminate)
 * @param loading - Loading state indicator
 */
  onPageChange?: (page: number) => void;
}

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
      open: { label: 'Open', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
      recovered: { label: 'Recovered', class: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
      closed_no_recovery: { label: 'Closed', class: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] ||
                  { label: status, class: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' };

    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${config.class}`}>
        {config.label}
      </span>
    );
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="animate-pulse" role="status" aria-live="polite">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div
            className="text-gray-500 dark:text-gray-400 text-center py-8"
            role="status"
            aria-live="polite"
          >
            <p>No recovery cases yet. Cases will appear here when payment failures occur.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <header className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recovery Cases
          </h2>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {total} total cases
          </div>
        </div>
      </header>

      {/* Message display */}
      {message && (
        <div
          role="alert"
          aria-live="assertive"
          className={`px-6 py-3 border-b ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900 dark:border-red-700 dark:text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <main>
        <AccessibleTable
          caption="Recovery Cases"
          description="List of all recovery cases with their status and available actions"
          pagination={{
            currentPage: page,
            totalPages,
            onPageChange: onPageChange
          }}
        >
          <thead>
            <tr>
              <AccessibleTableCell scope="col">Status</AccessibleTableCell>
              <AccessibleTableCell scope="col">Membership</AccessibleTableCell>
              <AccessibleTableCell scope="col">First Failure</AccessibleTableCell>
              <AccessibleTableCell scope="col">Attempts</AccessibleTableCell>
              <AccessibleTableCell scope="col">Recovered</AccessibleTableCell>
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
                  {formatDate(case_.first_failure_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {case_.attempts}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {case_.recovered_amount_cents > 0 ? formatCurrency(case_.recovered_amount_cents) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {case_.failure_reason || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Case actions">
                    {case_.status === 'open' && (
                      <>
                        <AccessibleButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleNudge(case_.id)}
                          disabled={isPending}
                          aria-label="Send another reminder for this case"
                        >
                          Nudge
                        </AccessibleButton>
                        <AccessibleButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(case_.id)}
                          disabled={isPending}
                          aria-label="Cancel this recovery case"
                        >
                          Cancel Case
                        </AccessibleButton>
                      </>
                    )}
                    <AccessibleButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelMembership(case_.id)}
                      disabled={isPending}
                      aria-label="Cancel membership at period end"
                    >
                      Cancel at Period End
                    </AccessibleButton>
                    <AccessibleButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTerminate(case_.id)}
                      disabled={isPending}
                      aria-label="Terminate membership immediately"
                    >
                      Terminate Now
                    </AccessibleButton>
                  </div>
                </td>
              </AccessibleTableRow>
            ))}
          </tbody>
        </AccessibleTable>
      </main>
    </div>
  );
}
