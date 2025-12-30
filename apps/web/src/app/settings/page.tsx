'use client';

import { cn } from '@/lib/utils';
import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  Settings as SettingsIcon,
  Bell,
  MessageSquare,
  Gift,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  Calendar,
  Globe,
  ChevronRight,
  Check,
  X,
  Crown,
} from 'lucide-react';
import { useWhop, useWhopCompany } from '@/lib/context/whop';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';

interface CreatorSettings {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
  reminder_time: string;
  reminder_timezone: string;
  updated_at: string;
}

interface SubscriptionInfo {
  subscription: {
    company_id: string;
    tier: 'free' | 'starter' | 'growth' | 'scale';
    total_recoveries_used: number;
    monthly_recovered_revenue_cents: number;
    month_start_date: string;
  };
  limits: {
    tier: string;
    max_monthly_recovered_revenue_cents: number | null;
    max_total_recoveries: number | null;
    price_cents: number;
    name: string;
  };
}

const DEFAULT_SETTINGS: CreatorSettings = {
  company_id: 'demo-company',
  enable_push: true,
  enable_dm: true,
  incentive_days: 3,
  reminder_offsets_days: [0, 2, 4],
  reminder_time: '10:00',
  reminder_timezone: 'America/New_York',
  updated_at: new Date().toISOString(),
};

const INCENTIVE_OPTIONS = [
  { value: 0, label: 'No incentive', description: 'Standard recovery flow' },
  { value: 1, label: '1 day free', description: 'Light incentive' },
  { value: 3, label: '3 days free', description: 'Recommended' },
  { value: 7, label: '7 days free', description: 'Strong incentive' },
  { value: 14, label: '14 days free', description: 'Premium incentive' },
  { value: 30, label: '30 days free', description: 'Maximum incentive' },
];

const REMINDER_DAYS = [
  { value: 0, label: 'Day 0', timing: 'Immediate', color: 'text-red-400', bg: 'bg-red-500/20' },
  { value: 1, label: 'Day 1', timing: '24 hours', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  { value: 2, label: 'Day 2', timing: '48 hours', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { value: 3, label: 'Day 3', timing: '72 hours', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { value: 4, label: 'Day 4', timing: '96 hours', color: 'text-lime-400', bg: 'bg-lime-500/20' },
  { value: 7, label: 'Day 7', timing: '1 week', color: 'text-green-400', bg: 'bg-green-500/20' },
  { value: 14, label: 'Day 14', timing: '2 weeks', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
];

const TIME_OPTIONS = [
  { value: '06:00', label: '6:00 AM' },
  { value: '07:00', label: '7:00 AM' },
  { value: '08:00', label: '8:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '13:00', label: '1:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '16:00', label: '4:00 PM' },
  { value: '17:00', label: '5:00 PM' },
  { value: '18:00', label: '6:00 PM' },
  { value: '19:00', label: '7:00 PM' },
  { value: '20:00', label: '8:00 PM' },
];

const TIMEZONE_GROUPS = [
  {
    label: 'Americas',
    options: [
      { value: 'America/New_York', label: 'Eastern (ET)' },
      { value: 'America/Chicago', label: 'Central (CT)' },
      { value: 'America/Denver', label: 'Mountain (MT)' },
      { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
    ],
  },
  {
    label: 'Europe',
    options: [
      { value: 'Europe/London', label: 'London (GMT)' },
      { value: 'Europe/Paris', label: 'Paris (CET)' },
      { value: 'Europe/Berlin', label: 'Berlin (CET)' },
    ],
  },
  {
    label: 'Asia-Pacific',
    options: [
      { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
      { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
      { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
    ],
  },
  {
    label: 'Other',
    options: [{ value: 'UTC', label: 'UTC' }],
  },
];

// Premium toggle switch component
function ToggleSwitch({
  enabled,
  onChange,
  id,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  id: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      id={id}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background',
        enabled ? 'bg-primary' : 'bg-zinc-700'
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
        className={cn(
          'pointer-events-none inline-block h-6 w-6 transform rounded-full shadow-lg ring-0 transition duration-200 ease-in-out',
          enabled ? 'bg-white' : 'bg-zinc-400'
        )}
        style={{ x: enabled ? 20 : 0 }}
      />
    </button>
  );
}

// Step indicator component
function StepIndicator({
  steps,
  currentStep,
}: {
  steps: { id: number; label: string; icon: typeof Bell }[];
  currentStep: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.id <= currentStep;
        const isCurrent = step.id === currentStep;

        return (
          <div key={step.id} className="flex items-center">
            <motion.div
              initial={false}
              animate={{
                scale: isCurrent ? 1.1 : 1,
                opacity: isActive ? 1 : 0.5,
              }}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300',
                isCurrent
                  ? 'bg-primary/20 border border-primary/30'
                  : isActive
                    ? 'bg-zinc-800/50'
                    : 'bg-zinc-900/50'
              )}
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  isCurrent
                    ? 'bg-primary text-white'
                    : isActive
                      ? 'bg-green-500 text-white'
                      : 'bg-zinc-700 text-zinc-400'
                )}
              >
                {isActive && !isCurrent ? <Check className="w-3 h-3" /> : step.id}
              </div>
              <span
                className={cn(
                  'text-sm font-medium hidden sm:inline',
                  isCurrent ? 'text-primary' : isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </motion.div>
            {index < steps.length - 1 && (
              <div className="w-8 sm:w-12 h-px bg-zinc-700 mx-2 hidden sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Settings() {
  const { addToast } = useToast();
  const { getAuthHeaders } = useWhop();
  const { companyId, isLoading: isAuthLoading } = useWhopCompany();
  const [settings, setSettings] = useState<CreatorSettings | null>(null);
  const [enablePush, setEnablePush] = useState<boolean>(true);
  const [enableDm, setEnableDm] = useState<boolean>(true);
  const [incentiveDays, setIncentiveDays] = useState<number>(DEFAULT_SETTINGS.incentive_days);
  const [reminderOffsets, setReminderOffsets] = useState<number[]>(DEFAULT_SETTINGS.reminder_offsets_days);
  const [reminderTime, setReminderTime] = useState<string>(DEFAULT_SETTINGS.reminder_time);
  const [reminderTimezone, setReminderTimezone] = useState<string>(DEFAULT_SETTINGS.reminder_timezone);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState(1);

  useEffect(() => {
    setValidationErrors(computeErrors());
  }, [enablePush, enableDm, incentiveDays, reminderOffsets]);

  useEffect(() => {
    if (!isAuthLoading && companyId && companyId !== 'unknown') {
      loadSettings();
    }
  }, [isAuthLoading, companyId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const [settingsRes, subscriptionRes] = await Promise.all([
        fetch('/api/settings', { headers: getAuthHeaders({ companyId: companyId || undefined }) }),
        fetch('/api/subscription', { headers: getAuthHeaders({ companyId: companyId || undefined }) }),
      ]);

      if (!settingsRes.ok) {
        let errorMessage = `Failed to load settings: ${settingsRes.status}`;
        try {
          const errorData = await settingsRes.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = settingsRes.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const settingsData = await settingsRes.json();
      setSettings(settingsData);
      setEnablePush(settingsData.enable_push);
      setEnableDm(settingsData.enable_dm);
      setIncentiveDays(settingsData.incentive_days);
      setReminderOffsets(settingsData.reminder_offsets_days);
      setReminderTime(settingsData.reminder_time || DEFAULT_SETTINGS.reminder_time);
      setReminderTimezone(settingsData.reminder_timezone || DEFAULT_SETTINGS.reminder_timezone);

      if (subscriptionRes.ok) {
        const subscriptionData = await subscriptionRes.json();
        setSubscription(subscriptionData);
      } else {
        logger.warn?.('Failed to load subscription info', { status: subscriptionRes.status });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load settings';
      setError(errorMessage);
      logger.error('Error loading settings', {
        error: err instanceof Error ? err.message : String(err),
      });

      addToast({
        type: 'error',
        title: 'Failed to load settings',
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updatedSettings: Partial<CreatorSettings>) => {
    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: getAuthHeaders({ companyId: companyId || undefined }),
        body: JSON.stringify(updatedSettings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save settings: ${response.status}`);
      }

      const data = await response.json();
      setSettings(data);
      setSaveSuccess(true);
      addToast({
        type: 'success',
        title: 'Settings saved',
        message: 'Your settings have been saved successfully.',
      });

      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save settings';
      setError(errorMessage);
      addToast({
        type: 'error',
        title: 'Failed to save',
        message: errorMessage,
      });
      logger.error('Error saving settings', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const computeErrors = () => {
    const errors: Record<string, string> = {};
    if (!enablePush && !enableDm) {
      errors.channels = 'At least one communication channel must be enabled';
    }
    if (Number.isNaN(incentiveDays) || incentiveDays < 0) {
      errors.incentive_days = 'Incentive days must be a valid non-negative number';
    }
    if (!reminderOffsets.length) {
      errors.reminder_offsets = 'Select at least one reminder timing';
    }
    return errors;
  };

  const validateForm = () => {
    const errors = computeErrors();
    setValidationErrors(errors);
    return errors;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      addToast({
        type: 'error',
        title: 'Validation error',
        message: 'Please fix the errors in the form before saving.',
      });
      return;
    }

    await saveSettings({
      enable_push: enablePush,
      enable_dm: enableDm,
      incentive_days: incentiveDays,
      reminder_offsets_days: reminderOffsets,
      reminder_time: reminderTime,
      reminder_timezone: reminderTimezone,
    });
  };

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset to default settings?')) {
      setEnablePush(DEFAULT_SETTINGS.enable_push);
      setEnableDm(DEFAULT_SETTINGS.enable_dm);
      setIncentiveDays(DEFAULT_SETTINGS.incentive_days);
      setReminderOffsets(DEFAULT_SETTINGS.reminder_offsets_days);
      setReminderTime(DEFAULT_SETTINGS.reminder_time);
      setReminderTimezone(DEFAULT_SETTINGS.reminder_timezone);
      await saveSettings(DEFAULT_SETTINGS);
    }
  };

  const formatLastUpdated = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  const steps = [
    { id: 1, label: 'Channels', icon: Bell },
    { id: 2, label: 'Incentives', icon: Gift },
    { id: 3, label: 'Schedule', icon: Clock },
  ];

  if (loading || isAuthLoading) {
    return (
      <div className="min-h-screen">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-hero-gradient opacity-50" />
          <div className="relative container mx-auto px-4 py-12">
            <Skeleton className="h-12 w-64 mb-4" />
            <Skeleton className="h-6 w-96" />
          </div>
        </div>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-premium rounded-2xl p-6">
                <Skeleton className="h-8 w-48 mb-4" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card-premium rounded-2xl p-8 max-w-md text-center"
        >
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Error Loading Settings</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={loadSettings} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Try Again
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-gradient opacity-50" />
        <div className="absolute inset-0 bg-mesh-gradient opacity-30" />

        <div className="relative container mx-auto px-4 py-12 md:py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-primary/20 mb-6">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Configuration</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Recovery <span className="text-gradient">Configuration</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl">
              Fine-tune your payment recovery strategy. Configure channels, incentives, and timing for maximum
              conversion.
            </p>

            {/* Subscription Status */}
            {subscription && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-6 inline-flex items-center gap-4 px-4 py-3 rounded-xl glass border border-white/10"
              >
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  <Badge className="bg-primary/20 text-primary border-primary/30">
                    {subscription.limits.name}
                  </Badge>
                </div>
                {subscription.limits.max_total_recoveries !== null && (
                  <div className="text-sm text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {subscription.subscription.total_recoveries_used}
                    </span>
                    /{subscription.limits.max_total_recoveries} recoveries
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  <span className="text-green-400 font-medium">
                    ${(subscription.subscription.monthly_recovered_revenue_cents / 100).toFixed(0)}
                  </span>{' '}
                  recovered
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Step Progress */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <StepIndicator steps={steps} currentStep={activeSection} />
        </motion.div>

        {/* Error Alert */}
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Alert variant="destructive" className="border-red-500/30 bg-red-500/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" data-testid="settings-form">
          {/* Section 1: Communication Channels */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            onClick={() => setActiveSection(1)}
            className={cn(
              'card-premium rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer',
              activeSection === 1 ? 'ring-2 ring-primary/50' : 'hover:ring-1 hover:ring-white/10'
            )}
          >
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center">
                  <Bell className="h-6 w-6 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    Communication Channels
                    <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                      Step 1
                    </Badge>
                  </h2>
                  <p className="text-sm text-muted-foreground">Choose how to notify users about payment failures</p>
                </div>
              </div>

              {validationErrors.channels && (
                <Alert variant="destructive" className="mb-6 border-red-500/30 bg-red-500/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{validationErrors.channels}</AlertDescription>
                </Alert>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {/* Push Notifications */}
                <div
                  className={cn(
                    'p-5 rounded-xl border transition-all duration-300',
                    enablePush
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-white/5 bg-zinc-900/50 hover:border-white/10'
                  )}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', enablePush ? 'bg-primary/20' : 'bg-zinc-800')}>
                        <Bell className={cn('h-5 w-5', enablePush ? 'text-primary' : 'text-zinc-500')} />
                      </div>
                      <div>
                        <label htmlFor="enable_push" className="text-sm font-semibold text-foreground cursor-pointer">
                          Push Notifications
                        </label>
                        <p className="text-xs text-muted-foreground">Mobile & web push alerts</p>
                      </div>
                    </div>
                    <ToggleSwitch
                      id="enable_push"
                      enabled={enablePush}
                      onChange={setEnablePush}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {enablePush ? (
                      <>
                        <Check className="h-3 w-3 text-green-400" />
                        <span className="text-green-400">Active</span>
                      </>
                    ) : (
                      <>
                        <X className="h-3 w-3 text-zinc-500" />
                        <span>Disabled</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Direct Messages */}
                <div
                  className={cn(
                    'p-5 rounded-xl border transition-all duration-300',
                    enableDm
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-white/5 bg-zinc-900/50 hover:border-white/10'
                  )}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', enableDm ? 'bg-primary/20' : 'bg-zinc-800')}>
                        <MessageSquare className={cn('h-5 w-5', enableDm ? 'text-primary' : 'text-zinc-500')} />
                      </div>
                      <div>
                        <label htmlFor="enable_dm" className="text-sm font-semibold text-foreground cursor-pointer">
                          Direct Messages
                        </label>
                        <p className="text-xs text-muted-foreground">Platform DM outreach</p>
                      </div>
                    </div>
                    <ToggleSwitch
                      id="enable_dm"
                      enabled={enableDm}
                      onChange={setEnableDm}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {enableDm ? (
                      <>
                        <Check className="h-3 w-3 text-green-400" />
                        <span className="text-green-400">Active</span>
                      </>
                    ) : (
                      <>
                        <X className="h-3 w-3 text-zinc-500" />
                        <span>Disabled</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Section 2: Incentive Strategy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => setActiveSection(2)}
            className={cn(
              'card-premium rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer',
              activeSection === 2 ? 'ring-2 ring-primary/50' : 'hover:ring-1 hover:ring-white/10'
            )}
          >
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center">
                  <Gift className="h-6 w-6 text-orange-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    Incentive Strategy
                    <Badge variant="secondary" className="text-xs bg-orange-500/20 text-orange-400 border-orange-500/30">
                      Step 2
                    </Badge>
                  </h2>
                  <p className="text-sm text-muted-foreground">Encourage recovery with free days</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {INCENTIVE_OPTIONS.map((option) => {
                  const isSelected = incentiveDays === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setIncentiveDays(option.value)}
                      className={cn(
                        'p-4 rounded-xl border text-left transition-all duration-300',
                        isSelected
                          ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/30'
                          : 'border-white/5 bg-zinc-900/50 hover:border-white/10 hover:bg-zinc-800/50'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-lg font-bold', isSelected ? 'text-primary' : 'text-foreground')}>
                          {option.value === 0 ? 'None' : `+${option.value}`}
                        </span>
                        {option.value > 0 && (
                          <span className="text-xs text-muted-foreground">days</span>
                        )}
                      </div>
                      <p className={cn('text-xs', isSelected ? 'text-primary/80' : 'text-muted-foreground')}>
                        {option.description}
                      </p>
                      {isSelected && (
                        <div className="mt-2">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Section 3: Reminder Schedule */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            onClick={() => setActiveSection(3)}
            className={cn(
              'card-premium rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer',
              activeSection === 3 ? 'ring-2 ring-primary/50' : 'hover:ring-1 hover:ring-white/10'
            )}
          >
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-green-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    Reminder Schedule
                    <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                      Step 3
                    </Badge>
                  </h2>
                  <p className="text-sm text-muted-foreground">Configure when to send reminders</p>
                </div>
              </div>

              {validationErrors.reminder_offsets && (
                <Alert variant="destructive" className="mb-6 border-red-500/30 bg-red-500/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{validationErrors.reminder_offsets}</AlertDescription>
                </Alert>
              )}

              {/* Time & Timezone */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Time of Day
                  </label>
                  <select
                    id="reminder_time"
                    name="reminder_time"
                    data-testid="reminder-time-input"
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                  >
                    {TIME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    Timezone
                  </label>
                  <select
                    id="reminder_timezone"
                    name="reminder_timezone"
                    data-testid="reminder-timezone-input"
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    value={reminderTimezone}
                    onChange={(e) => setReminderTimezone(e.target.value)}
                  >
                    {TIMEZONE_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Day Selector - Visual Timeline */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Reminder Days
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {REMINDER_DAYS.map((day) => {
                    const isSelected = reminderOffsets.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setReminderOffsets((prev) => prev.filter((v) => v !== day.value));
                          } else {
                            setReminderOffsets((prev) => [...prev, day.value].sort((a, b) => a - b));
                          }
                        }}
                        className={cn(
                          'p-3 rounded-xl border text-center transition-all duration-300',
                          isSelected
                            ? `border-primary/50 ${day.bg} ring-1 ring-primary/30`
                            : 'border-white/5 bg-zinc-900/50 hover:border-white/10'
                        )}
                      >
                        <span className={cn('text-sm font-bold block', isSelected ? day.color : 'text-foreground')}>
                          {day.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">{day.timing}</span>
                        {isSelected && <Check className="h-3 w-3 text-primary mx-auto mt-1" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selected: {reminderOffsets.length} reminder{reminderOffsets.length !== 1 ? 's' : ''} configured
                </p>
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 pt-4"
          >
            <Button
              type="submit"
              disabled={saving || loading}
              className={cn(
                'flex-1 h-14 text-base gap-2 transition-all duration-300',
                saveSuccess && 'bg-green-600 hover:bg-green-600'
              )}
              size="lg"
              data-testid="save-settings-button"
            >
              {saving ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <RotateCcw className="h-5 w-5" />
                  </motion.div>
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="h-5 w-5" />
                  Saved Successfully!
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  Save Settings
                </>
              )}
            </Button>
            {saveSuccess && (
              <span data-testid="settings-saved-message" className="sr-only">
                Settings saved successfully
              </span>
            )}
            <Button
              type="button"
              onClick={handleReset}
              disabled={saving}
              variant="outline"
              className="flex-1 sm:flex-none h-14 gap-2 border-white/10"
              size="lg"
              data-testid="reset-settings-button"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </Button>
          </motion.div>

          {/* Last Updated */}
          {settings && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="text-center text-xs text-muted-foreground"
            >
              Last updated: {formatLastUpdated(settings.updated_at)}
            </motion.p>
          )}
        </form>
      </div>
    </div>
  );
}
