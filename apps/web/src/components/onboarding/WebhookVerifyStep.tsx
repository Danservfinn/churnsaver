'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, Loader2, ArrowRight, SkipForward, RefreshCw } from 'lucide-react';
import { useWhop } from '@/lib/context/whop';

interface WebhookVerifyStepProps {
  companyId: string;
  onNext: () => void;
  onSkip: () => void;
  onVerified: (verified: boolean) => void;
}

type VerificationStatus = 'checking' | 'connected' | 'waiting' | 'error';

export function WebhookVerifyStep({
  companyId,
  onNext,
  onSkip,
  onVerified,
}: WebhookVerifyStepProps) {
  const [status, setStatus] = useState<VerificationStatus>('checking');
  const [eventCount, setEventCount] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const { getAuthHeaders } = useWhop();

  const checkWebhookStatus = async () => {
    try {
      const response = await fetch(`/api/dashboard/kpis?window=30&companyId=${encodeURIComponent(companyId)}`, {
        headers: getAuthHeaders({ companyId }),
      });

      if (response.ok) {
        const data = await response.json();
        const totalEvents = (data.activeCases || 0) + (data.recoveries || 0) + (data.totalCases || 0);

        if (totalEvents > 0) {
          setStatus('connected');
          setEventCount(totalEvents);
          onVerified(true);
          setIsPolling(false);
        } else {
          setStatus('waiting');
        }
      } else {
        setStatus('waiting');
      }
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    // Initial check
    checkWebhookStatus();

    // Poll every 5 seconds while waiting
    const interval = setInterval(() => {
      if (isPolling && status !== 'connected') {
        checkWebhookStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [companyId, isPolling, status]);

  const handleRetry = () => {
    setStatus('checking');
    checkWebhookStatus();
  };

  return (
    <div className="card-premium rounded-2xl p-8 md:p-12">
      <div className="text-center">
        {/* Status Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{
            background:
              status === 'connected'
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.05))'
                : status === 'error'
                  ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.05))'
                  : 'linear-gradient(135deg, rgba(234, 88, 12, 0.2), rgba(234, 88, 12, 0.05))',
          }}
        >
          {status === 'checking' && (
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          )}
          {status === 'connected' && (
            <CheckCircle className="h-10 w-10 text-green-400" />
          )}
          {status === 'waiting' && (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <RefreshCw className="h-10 w-10 text-primary" />
            </motion.div>
          )}
          {status === 'error' && (
            <AlertCircle className="h-10 w-10 text-red-400" />
          )}
        </motion.div>

        {/* Title & Description */}
        <h2 className="text-2xl font-bold mb-2">
          {status === 'checking' && 'Checking Connection...'}
          {status === 'connected' && 'Webhook Connected!'}
          {status === 'waiting' && 'Waiting for Events'}
          {status === 'error' && 'Connection Error'}
        </h2>

        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          {status === 'checking' && 'Verifying your Whop webhook connection...'}
          {status === 'connected' &&
            `Great! We've received ${eventCount} event${eventCount !== 1 ? 's' : ''} from your Whop account.`}
          {status === 'waiting' && (
            <>
              We haven&apos;t received any webhook events yet.
              <br />
              <span className="text-sm">
                Events will appear when payments fail or memberships change.
              </span>
            </>
          )}
          {status === 'error' && 'Unable to verify webhook connection. Please try again.'}
        </p>

        {/* Instructions for waiting state */}
        {status === 'waiting' && (
          <div className="bg-zinc-900/50 rounded-xl p-4 mb-6 text-left max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Webhook Setup Instructions:
            </h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Go to your Whop Developer Dashboard</li>
              <li>Navigate to Webhooks settings</li>
              <li>Ensure webhook URL points to ChurnSaver</li>
              <li>Subscribe to payment and membership events</li>
            </ol>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {status === 'connected' && (
            <Button onClick={onNext} size="lg" className="gap-2">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {status === 'waiting' && (
            <>
              <Button onClick={handleRetry} variant="outline" size="lg" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Check Again
              </Button>
              <Button onClick={onSkip} variant="ghost" size="lg" className="gap-2">
                <SkipForward className="h-4 w-4" />
                Skip for Now
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <Button onClick={handleRetry} variant="outline" size="lg" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button onClick={onSkip} variant="ghost" size="lg" className="gap-2">
                <SkipForward className="h-4 w-4" />
                Skip for Now
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
