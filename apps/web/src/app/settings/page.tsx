'use client';

import { cn } from '@/lib/utils';
import { useState, useEffect, FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Settings as SettingsIcon, Bell, MessageSquare, Gift, Clock, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
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
  updated_at: new Date().toISOString()
};

const INCENTIVE_OPTIONS = [
  { value: 0, label: 'No incentive' },
  { value: 1, label: '1 day free' },
  { value: 3, label: '3 days free' },
  { value: 7, label: '7 days free' },
  { value: 14, label: '14 days free' },
  { value: 30, label: '30 days free' }
];

const REMINDER_OFFSETS = [
  { value: 0, label: 'Day 0', description: 'Same day as failure' },
  { value: 1, label: 'Day 1', description: '1 day after' },
  { value: 2, label: 'Day 2', description: '2 days after' },
  { value: 3, label: 'Day 3', description: '3 days after' },
  { value: 4, label: 'Day 4', description: '4 days after' },
  { value: 7, label: 'Day 7', description: '1 week after' },
  { value: 14, label: 'Day 14', description: '2 weeks after' }
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

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
];

export default function Settings() {
  const { addToast } = useToast();
  const { getAuthHeaders } = useWhop();
  const { companyId } = useWhopCompany();
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
  useEffect(() => {
    setValidationErrors(computeErrors());
  }, [enablePush, enableDm, incentiveDays, reminderOffsets]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

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
      reminder_timezone: reminderTimezone
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button onClick={loadSettings} className="w-full">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                <SettingsIcon className="h-6 w-6 text-primary" />
                Settings
              </h1>
              <p className="text-muted-foreground mt-1">
                Configure your recovery strategy and communication preferences
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Back to Dashboard
              </Button>
            </Link>
          </div>
          {subscription && (
            <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
              <Badge variant="outline">Tier: {subscription.subscription.tier}</Badge>
              {subscription.limits.max_total_recoveries !== null && (
                <span>
                  Recoveries used: {subscription.subscription.total_recoveries_used}/{subscription.limits.max_total_recoveries}
                </span>
              )}
              {subscription.limits.max_monthly_recovered_revenue_cents !== null && (
                <span>
                  Monthly recovered: ${(subscription.subscription.monthly_recovered_revenue_cents / 100).toFixed(2)} / ${(subscription.limits.max_monthly_recovered_revenue_cents / 100).toFixed(2)}
                </span>
              )}
              {subscription.limits.max_monthly_recovered_revenue_cents === null && (
                <span>Recovered revenue: ${(subscription.subscription.monthly_recovered_revenue_cents / 100).toFixed(2)}</span>
              )}
            </div>
          )}
          {settings && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Last updated: {formatLastUpdated(settings.updated_at)}</span>
            </div>
          )}
        </header>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" data-testid="settings-form">
          {/* Communication Channels */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Communication Channels
              </CardTitle>
              <CardDescription>
                Choose how to notify users about payment failures
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {validationErrors.channels && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{validationErrors.channels}</AlertDescription>
                </Alert>
              )}
              <div className="flex items-start justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <label htmlFor="enable_push" className="text-sm font-medium text-foreground cursor-pointer">
                      Push Notifications
                    </label>
                  </div>
                  <p className="text-sm text-muted-foreground ml-8">
                    Send push notifications to users when payments fail
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="enable_push"
                    name="enable_push"
                    type="checkbox"
                    className="sr-only peer"
                    checked={enablePush}
                    onChange={(e) => setEnablePush(e.target.checked)}
                    data-testid="enable-push-toggle"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>

              <div className="flex items-start justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    <label htmlFor="enable_dm" className="text-sm font-medium text-foreground cursor-pointer">
                      Direct Messages
                    </label>
                  </div>
                  <p className="text-sm text-muted-foreground ml-8">
                    Send direct messages via the platform when payments fail
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="enable_dm"
                    name="enable_dm"
                    type="checkbox"
                    className="sr-only peer"
                    checked={enableDm}
                    onChange={(e) => setEnableDm(e.target.checked)}
                    data-testid="enable-dm-toggle"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Incentive Strategy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Incentive Strategy
              </CardTitle>
              <CardDescription>
                Configure automatic incentives to encourage recovery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label htmlFor="incentive_days" className="block text-sm font-medium text-foreground mb-2">
                    Free Days Incentive
                  </label>
                  <select
                    id="incentive_days"
                    name="incentive_days"
                    data-testid="incentive-days-input"
                    className={cn(
                      "w-full px-4 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent transition-colors",
                      validationErrors.incentive_days 
                        ? "border-destructive" 
                        : "border-input"
                    )}
                    value={incentiveDays}
                    onChange={(e) => setIncentiveDays(parseInt(e.target.value, 10))}
                  >
                    {INCENTIVE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {validationErrors.incentive_days && (
                    <p className="text-sm text-destructive mt-1">
                      {validationErrors.incentive_days}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">
                    Number of free days to add on first payment failure to encourage recovery
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reminder Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Reminder Schedule
              </CardTitle>
              <CardDescription>
                Configure when to send reminder notifications after payment failures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {validationErrors.reminder_offsets && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{validationErrors.reminder_offsets}</AlertDescription>
                  </Alert>
                )}
                
                {/* Time and Timezone Selectors */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Time of Day
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <select
                        id="reminder_time"
                        name="reminder_time"
                        data-testid="reminder-time-input"
                        className="w-full px-4 py-2 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                        value={reminderTime}
                        onChange={(e) => setReminderTime(e.target.value)}
                      >
                        {TIME_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <select
                        id="reminder_timezone"
                        name="reminder_timezone"
                        data-testid="reminder-timezone-input"
                        className="w-full px-4 py-2 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                        value={reminderTimezone}
                        onChange={(e) => setReminderTimezone(e.target.value)}
                      >
                        {TIMEZONE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Reminders will be sent at this time in the selected timezone
                  </p>
                </div>

                {/* Day Selector */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Days to Send Reminders
                  </label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select which days after the payment failure to send reminders
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {REMINDER_OFFSETS.map(offset => {
                      const isChecked = reminderOffsets.includes(offset.value);
                      return (
                        <label
                          key={offset.value}
                          htmlFor={`reminder_${offset.value}`}
                          className={cn(
                            "relative flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-all",
                            isChecked
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground'
                          )}
                        >
                          <input
                            id={`reminder_${offset.value}`}
                            name={`reminder_${offset.value}`}
                            type="checkbox"
                            className="sr-only"
                            checked={reminderOffsets.includes(offset.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setReminderOffsets((prev) => Array.from(new Set([...prev, offset.value])));
                              } else {
                                setReminderOffsets((prev) => prev.filter((v) => v !== offset.value));
                              }
                            }}
                          />
                          <div className={cn(
                            "w-5 h-5 rounded border mb-2 flex items-center justify-center",
                            isChecked
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground'
                          )}>
                            {isChecked && (
                              <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                            )}
                          </div>
                          <span className={cn(
                            "text-sm font-medium",
                            isChecked
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          )}>
                            {offset.label}
                          </span>
                          <span className={cn(
                            "text-xs mt-1 text-center",
                            isChecked
                              ? 'text-muted-foreground'
                              : 'text-muted-foreground/70'
                          )}>
                            {offset.description}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button
              type="submit"
              disabled={saving || loading}
              loading={saving}
              success={saveSuccess}
              className="flex-1"
              size="lg"
              data-testid="save-settings-button"
            >
              {saveSuccess ? 'Saved!' : 'Save Settings'}
            </Button>
            {saveSuccess && <span data-testid="settings-saved-message" className="sr-only">Settings saved successfully</span>}
            <Button
              type="button"
              onClick={handleReset}
              disabled={saving}
              variant="outline"
              className="flex-1 gap-2"
              size="lg"
              data-testid="reset-settings-button"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
