'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Bell,
  MessageSquare,
  Gift,
  ArrowRight,
  ArrowLeft,
  SkipForward,
  Check,
  Loader2,
} from 'lucide-react';
import { useWhop } from '@/lib/context/whop';
import { useToast } from '@/components/ui/toast';

interface ConfigureStepProps {
  companyId: string;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

const INCENTIVE_OPTIONS = [
  { value: 0, label: 'None', description: 'No incentive' },
  { value: 3, label: '3 days', description: 'Recommended' },
  { value: 7, label: '7 days', description: 'Strong' },
];

export function ConfigureStep({
  companyId,
  onNext,
  onSkip,
  onBack,
}: ConfigureStepProps) {
  const [enablePush, setEnablePush] = useState(true);
  const [enableDm, setEnableDm] = useState(true);
  const [incentiveDays, setIncentiveDays] = useState(3);
  const [isSaving, setIsSaving] = useState(false);
  const { getAuthHeaders } = useWhop();
  const { addToast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: getAuthHeaders({ companyId }),
        body: JSON.stringify({
          enable_push: enablePush,
          enable_dm: enableDm,
          incentive_days: incentiveDays,
          reminder_offsets_days: [0, 2, 4],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      addToast({
        type: 'success',
        title: 'Settings saved',
        message: 'Your recovery preferences have been saved.',
      });

      onNext();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: 'Unable to save settings. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card-premium rounded-2xl p-8 md:p-12">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Quick Setup</h2>
        <p className="text-muted-foreground">
          Configure your basic recovery preferences
        </p>
      </div>

      <div className="space-y-6 max-w-md mx-auto">
        {/* Communication Channels */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Notification Channels
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setEnablePush(!enablePush)}
              className={cn(
                'p-4 rounded-xl border text-left transition-all',
                enablePush
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-white/5 bg-zinc-900/50 hover:border-white/10'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <Bell className={cn('h-5 w-5', enablePush ? 'text-primary' : 'text-zinc-500')} />
                {enablePush && <Check className="h-4 w-4 text-primary" />}
              </div>
              <span className={cn('text-sm font-medium', enablePush ? 'text-foreground' : 'text-muted-foreground')}>
                Push Notifications
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEnableDm(!enableDm)}
              className={cn(
                'p-4 rounded-xl border text-left transition-all',
                enableDm
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-white/5 bg-zinc-900/50 hover:border-white/10'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <MessageSquare className={cn('h-5 w-5', enableDm ? 'text-primary' : 'text-zinc-500')} />
                {enableDm && <Check className="h-4 w-4 text-primary" />}
              </div>
              <span className={cn('text-sm font-medium', enableDm ? 'text-foreground' : 'text-muted-foreground')}>
                Direct Messages
              </span>
            </button>
          </div>
        </div>

        {/* Incentive Days */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" />
            Free Days Incentive
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {INCENTIVE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setIncentiveDays(option.value)}
                className={cn(
                  'p-3 rounded-xl border text-center transition-all',
                  incentiveDays === option.value
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-white/5 bg-zinc-900/50 hover:border-white/10'
                )}
              >
                <div className="text-lg font-bold text-foreground">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
        <Button onClick={onBack} variant="ghost" size="lg" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving || (!enablePush && !enableDm)}
          size="lg"
          className="gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Save & Continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
        <Button onClick={onSkip} variant="ghost" size="lg" className="gap-2">
          <SkipForward className="h-4 w-4" />
          Skip
        </Button>
      </div>

      {!enablePush && !enableDm && (
        <p className="text-sm text-red-400 text-center mt-4">
          At least one channel must be enabled
        </p>
      )}
    </div>
  );
}
