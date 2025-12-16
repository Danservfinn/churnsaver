'use client';

import { useState, useTransition, useEffect } from 'react';
import { AccessibilityUtils } from '@/lib/accessibility';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  X,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Bell,
  MessageCircle,
  Clock,
  RotateCcw,
} from 'lucide-react';
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

interface RecoveryAction {
  id: string;
  type: string;
  channel: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

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
  onCaseUpdated?: () => void;
  companyId?: string;
}

const STATUS_CONFIG = {
  open: {
    label: 'Open',
    variant: 'warning' as const,
    icon: AlertCircle,
  },
  recovered: {
    label: 'Recovered',
    variant: 'success' as const,
    icon: CheckCircle2,
  },
  closed_no_recovery: {
    label: 'Closed',
    variant: 'destructive' as const,
    icon: XCircle,
  },
};

/**
 * CasesTable Component
 *
 * Displays recovery cases with expandable rows showing details and activity timeline
 */
export function CasesTable({
  cases,
  isLoading,
  total,
  page,
  limit,
  totalPages,
  onPageChange,
  onCaseUpdated,
  companyId,
}: CasesTableProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [caseActions, setCaseActions] = useState<Record<string, RecoveryAction[]>>({});
  const [loadingActions, setLoadingActions] = useState<string | null>(null);

  // Initialize accessibility features
  useEffect(() => {
    AccessibilityUtils.initialize({
      announcePageChanges: true,
      announceFormErrors: true,
      focusManagement: true,
      keyboardNavigation: true,
      screenReaderSupport: true,
      colorContrast: true,
      reducedMotion: true,
    });
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  const getActionIcon = (type: string, channel: string | null) => {
    if (channel === 'push' || type.includes('push')) return Bell;
    if (channel === 'dm' || type.includes('dm')) return MessageCircle;
    if (type.includes('recovered')) return DollarSign;
    if (type.includes('reopen')) return RotateCcw;
    return Clock;
  };

  const getActionLabel = (type: string, channel: string | null) => {
    if (type === 'push_sent' || (type === 't0_nudge_status' && channel === 'push'))
      return 'Push notification sent';
    if (type === 'dm_sent' || (type === 't0_nudge_status' && channel === 'dm'))
      return 'Direct message sent';
    if (type === 't0_nudge_status') return 'Initial nudge';
    if (type === 'case_cancelled') return 'Case cancelled';
    if (type === 'case_reopened') return 'Case reopened';
    if (type === 'membership_terminated') return 'Membership terminated';
    return type.replace(/_/g, ' ');
  };

  const fetchCaseActions = async (caseId: string) => {
    if (caseActions[caseId]) return; // Already loaded

    setLoadingActions(caseId);
    try {
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);

      const response = await fetch(`/api/cases/${caseId}/actions?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setCaseActions((prev) => ({
          ...prev,
          [caseId]: data.data?.actions || [],
        }));
      }
    } catch (error) {
      console.error('Error fetching case actions:', error);
    } finally {
      setLoadingActions(null);
    }
  };

  const toggleCaseExpand = (caseId: string) => {
    if (expandedCaseId === caseId) {
      setExpandedCaseId(null);
    } else {
      setExpandedCaseId(caseId);
      fetchCaseActions(caseId);
    }
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
          text: result.message || result.error || 'Unknown error',
        });

        if (result.success) {
          AccessibilityUtils.announceToScreenReader('Nudge sent successfully');
          onCaseUpdated?.();
        } else {
          AccessibilityUtils.announceToScreenReader('Failed to send nudge', 'assertive');
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to send nudge',
        });
        AccessibilityUtils.announceToScreenReader('Failed to send nudge', 'assertive');
      }

      setTimeout(() => setMessage(null), 3000);
    });
  };

  const handleCancel = async (caseId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this recovery case? This will stop all future reminders.'
    );

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
          text: result.message || result.error || 'Unknown error',
        });

        if (result.success) {
          AccessibilityUtils.announceToScreenReader('Recovery case cancelled successfully');
          onCaseUpdated?.();
        } else {
          AccessibilityUtils.announceToScreenReader('Failed to cancel recovery case', 'assertive');
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to cancel case',
        });
        AccessibilityUtils.announceToScreenReader('Failed to cancel recovery case', 'assertive');
      }

      setTimeout(() => setMessage(null), 3000);
    });
  };

  const handleReopen = async (caseId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to reopen this case? This will restart the recovery process.'
    );

    if (!confirmed) {
      AccessibilityUtils.announceToScreenReader('Case reopen cancelled');
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseId}/reopen`, {
          method: 'POST',
        });

        const result = await response.json();

        setMessage({
          type: result.success ? 'success' : 'error',
          text: result.message || result.error || 'Unknown error',
        });

        if (result.success) {
          AccessibilityUtils.announceToScreenReader('Recovery case reopened successfully');
          // Clear cached actions for this case
          setCaseActions((prev) => {
            const newActions = { ...prev };
            delete newActions[caseId];
            return newActions;
          });
          onCaseUpdated?.();
        } else {
          AccessibilityUtils.announceToScreenReader('Failed to reopen recovery case', 'assertive');
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to reopen case',
        });
        AccessibilityUtils.announceToScreenReader('Failed to reopen recovery case', 'assertive');
      }

      setTimeout(() => setMessage(null), 3000);
    });
  };

  const handleCancelMembership = async (caseId: string) => {
    if (
      !confirm(
        'Are you sure you want to cancel this membership at the end of the current billing period? The user will lose access when their period ends.'
      )
    ) {
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
          text: result.message || result.error || 'Unknown error',
        });

        if (result.success) {
          onCaseUpdated?.();
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to cancel membership',
        });
      }

      setTimeout(() => setMessage(null), 3000);
    });
  };

  const handleTerminate = async (caseId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to terminate this membership? This will cancel their subscription immediately.'
    );

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
          text: result.message || result.error || 'Unknown error',
        });

        if (result.success) {
          AccessibilityUtils.announceToScreenReader('Membership terminated successfully');
          onCaseUpdated?.();
        } else {
          AccessibilityUtils.announceToScreenReader('Failed to terminate membership', 'assertive');
        }
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to terminate membership',
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
          <div className="text-sm text-muted-foreground font-medium">
            {total} {total === 1 ? 'case' : 'cases'}
          </div>
        </div>
      </CardHeader>

      {/* Message display */}
      {message && (
        <div className="px-6 py-3">
          <Alert variant={message.type === 'success' ? 'default' : 'destructive'}>
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

      <CardContent className="px-0">
        <div className="space-y-2">
          {cases.map((case_) => {
            const statusConfig =
              STATUS_CONFIG[case_.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;
            const StatusIcon = statusConfig.icon;
            const isExpanded = expandedCaseId === case_.id;
            const actions = caseActions[case_.id] || [];

            return (
              <div
                key={case_.id}
                className="border-b border-border last:border-b-0"
              >
                {/* Case Row */}
                <button
                  onClick={() => toggleCaseExpand(case_.id)}
                  className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-muted/30 transition-colors"
                >
                  {/* Expand Icon */}
                  <div className="text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                  </div>

                  {/* Status Badge */}
                  <Badge variant={statusConfig.variant} className="flex items-center gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {statusConfig.label}
                  </Badge>

                  {/* Case Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {case_.membership_id.slice(-8)} / {case_.user_id.slice(-8)}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(case_.first_failure_at)}
                    </p>
                  </div>

                  {/* Attempts */}
                  <div className="text-center">
                    <Badge variant="outline" className="font-mono">
                      {case_.attempts}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">attempts</p>
                  </div>

                  {/* Amount Recovered */}
                  {case_.status === 'recovered' && case_.recovered_amount_cents > 0 && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-500 flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {formatCurrency(case_.recovered_amount_cents)}
                      </p>
                      <p className="text-xs text-muted-foreground">recovered</p>
                    </div>
                  )}

                  {/* Attribution */}
                  <div className="hidden md:block">{formatRecoveryType(case_.recovery_type)}</div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-6 py-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Membership ID</p>
                        <p className="text-sm font-mono text-foreground">
                          {case_.membership_id.slice(0, 16)}...
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">User ID</p>
                        <p className="text-sm font-mono text-foreground">
                          {case_.user_id.slice(0, 16)}...
                        </p>
                      </div>
                      {case_.failure_reason && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Failure Reason</p>
                          <p className="text-sm text-foreground">{case_.failure_reason}</p>
                        </div>
                      )}
                      {case_.recovery_type && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Recovery Type</p>
                          <p className="text-sm text-foreground capitalize">
                            {case_.recovery_type.toLowerCase().replace('_', ' ')}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Case actions">
                      {case_.status === 'open' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNudge(case_.id);
                            }}
                            disabled={isPending}
                            aria-label="Send another reminder for this case"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Send Reminder
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(case_.id);
                            }}
                            disabled={isPending}
                            aria-label="Close this recovery case"
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Close Case
                          </Button>
                        </>
                      )}
                      {case_.status === 'closed_no_recovery' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReopen(case_.id);
                          }}
                          disabled={isPending}
                          aria-label="Reopen this recovery case"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Re-open Case
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelMembership(case_.id);
                        }}
                        disabled={isPending}
                        aria-label="Cancel membership at period end"
                      >
                        Cancel at Period End
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTerminate(case_.id);
                        }}
                        disabled={isPending}
                        aria-label="Terminate membership immediately"
                      >
                        Terminate
                      </Button>
                    </div>

                    {/* Activity Timeline */}
                    <div className="mt-4 pt-4 border-t border-border">
                      <h4 className="text-sm font-medium text-foreground mb-3">Activity Timeline</h4>
                      {loadingActions === case_.id ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Loading...</span>
                        </div>
                      ) : actions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {actions.map((action) => {
                            const ActionIcon = getActionIcon(action.type, action.channel);
                            return (
                              <div key={action.id} className="flex items-start gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                                  <ActionIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="text-sm text-foreground">
                                    {getActionLabel(action.type, action.channel)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(action.created_at)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
