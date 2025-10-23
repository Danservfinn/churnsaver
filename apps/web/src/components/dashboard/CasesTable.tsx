'use client';

import { useState, useTransition } from 'react';

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

interface CasesTableProps {
  cases: RecoveryCase[];
  isLoading?: boolean;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to send nudge'
        });
      }

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    });
  };

  const handleCancel = async (caseId: string) => {
    if (!confirm('Are you sure you want to cancel this recovery case? This will stop all future reminders.')) {
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
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to cancel case'
        });
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
    if (!confirm('Are you sure you want to terminate this membership? This will cancel their subscription immediately.')) {
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
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to terminate membership'
        });
      }

      setTimeout(() => setMessage(null), 3000);
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="animate-pulse">
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
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No recovery cases yet. Cases will appear here when payment failures occur.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recovery Cases
          </h2>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {total} total cases
          </div>
        </div>
      </div>

      {/* Message display */}
      {message && (
        <div className={`px-6 py-3 border-b ${
          message.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200'
            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900 dark:border-red-700 dark:text-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Membership
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                First Failure
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Attempts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Recovered
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {cases.map((case_) => (
              <tr key={case_.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
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
                  <div className="flex flex-wrap gap-2">
                    {case_.status === 'open' && (
                      <>
                        <button
                          onClick={() => handleNudge(case_.id)}
                          disabled={isPending}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          title="Send another reminder"
                        >
                          Nudge
                        </button>
                        <button
                          onClick={() => handleCancel(case_.id)}
                          disabled={isPending}
                          className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          title="Cancel recovery case"
                        >
                          Cancel Case
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleCancelMembership(case_.id)}
                      disabled={isPending}
                      className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      title="Cancel membership at period end"
                    >
                      Cancel at Period End
                    </button>
                    <button
                      onClick={() => handleTerminate(case_.id)}
                      disabled={isPending}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      title="Terminate membership immediately"
                    >
                      Terminate Now
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} results
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => onPageChange?.(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => onPageChange?.(page + 1)}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
