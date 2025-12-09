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
import { useWhop } from '@/lib/context/whop';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';

interface CreatorSettings {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
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
  { value: 0, label: 'T+0 (Immediate)' },
  { value: 1, label: 'T+1' },
  { value: 2, label: 'T+2' },
  { value: 3, label: 'T+3' },
  { value: 4, label: 'T+4' },
  { value: 7, label: 'T+7' },
  { value: 14, label: 'T+14' }
];

export default function Settings() {
  const { addToast } = useToast();
  const { getAuthHeaders } = useWhop();
  const [settings, setSettings] = useState<CreatorSettings | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const [settingsRes, subscriptionRes] = await Promise.all([
        fetch('/api/settings', { headers: getAuthHeaders() }),
        fetch('/api/subscription', { headers: getAuthHeaders() }),
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
        headers: getAuthHeaders(),
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationErrors({});

    if (!settings) return;

    const formData = new FormData(e.currentTarget);

    const enable_push = formData.get('enable_push') === 'on';
    const enable_dm = formData.get('enable_dm') === 'on';
    const incentive_days = parseInt(formData.get('incentive_days') as string, 10);

    const reminder_offsets_days: number[] = [];
    formData.forEach((value, key) => {
      if (key.startsWith('reminder_') && value === 'on') {
        const offset = parseInt(key.replace('reminder_', ''), 10);
        reminder_offsets_days.push(offset);
      }
    });

    const errors: Record<string, string> = {};
    
    if (!enable_push && !enable_dm) {
      errors.channels = 'At least one communication channel must be enabled';
    }

    if (isNaN(incentive_days) || incentive_days < 0) {
      errors.incentive_days = 'Incentive days must be a valid number';
    }

    if (reminder_offsets_days.length === 0) {
      errors.reminder_offsets = 'At least one reminder timing must be selected';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      addToast({
        type: 'error',
        title: 'Validation error',
        message: 'Please fix the errors in the form before saving.',
      });
      return;
    }

    await saveSettings({
      enable_push,
      enable_dm,
      incentive_days,
      reminder_offsets_days
    });
  };

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset to default settings?')) {
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

        <form onSubmit={handleSubmit} className="space-y-6">
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
                    defaultChecked={settings?.enable_push ?? DEFAULT_SETTINGS.enable_push}
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
                    defaultChecked={settings?.enable_dm ?? DEFAULT_SETTINGS.enable_dm}
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
                    className={cn(
                      "w-full px-4 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent transition-colors",
                      validationErrors.incentive_days 
                        ? "border-destructive" 
                        : "border-input"
                    )}
                    defaultValue={settings?.incentive_days ?? DEFAULT_SETTINGS.incentive_days}
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
              <div className="space-y-4">
                {validationErrors.reminder_offsets && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{validationErrors.reminder_offsets}</AlertDescription>
                  </Alert>
                )}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-4">
                    Reminder Timing (days after first failure)
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {REMINDER_OFFSETS.map(offset => {
                      const isChecked = settings?.reminder_offsets_days?.includes(offset.value) ?? DEFAULT_SETTINGS.reminder_offsets_days.includes(offset.value);
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
                            defaultChecked={isChecked}
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
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    Select when to send reminder notifications after a payment failure
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button
              type="submit"
              disabled={saving}
              loading={saving}
              success={saveSuccess}
              className="flex-1"
              size="lg"
            >
              {saveSuccess ? 'Saved!' : 'Save Settings'}
            </Button>
            <Button
              type="button"
              onClick={handleReset}
              disabled={saving}
              variant="outline"
              className="flex-1 gap-2"
              size="lg"
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
