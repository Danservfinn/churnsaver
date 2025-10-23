'use client';

import { useState, useEffect, FormEvent } from 'react';

interface CreatorSettings {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
  updated_at: string;
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
  const [settings, setSettings] = useState<CreatorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error(`Failed to load settings: ${response.status}`);
      }

      const data = await response.json();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updatedSettings: Partial<CreatorSettings>) => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSettings),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save settings: ${response.status}`);
      }

      const data = await response.json();
      setSettings(data);
      setMessage('Settings saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
      console.error('Error saving settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!settings) return;

    // Build the settings object from form data
    const formData = new FormData(e.currentTarget);

    const enable_push = formData.get('enable_push') === 'on';
    const enable_dm = formData.get('enable_dm') === 'on';
    const incentive_days = parseInt(formData.get('incentive_days') as string, 10);

    // Get selected reminder offsets
    const reminder_offsets_days: number[] = [];
    formData.forEach((value, key) => {
      if (key.startsWith('reminder_') && value === 'on') {
        const offset = parseInt(key.replace('reminder_', ''), 10);
        reminder_offsets_days.push(offset);
      }
    });

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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 mb-4">Error: {error}</div>
          <button
            onClick={loadSettings}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Configure your recovery strategy and communication preferences
          </p>
          {settings && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Last updated: {formatLastUpdated(settings.updated_at)}
            </p>
          )}
        </header>

        <div className="max-w-2xl">
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
              <p className="text-green-600 dark:text-green-400">{message}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Communication Channels
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="enable_push" className="text-sm font-medium text-gray-900 dark:text-white">
                      Push Notifications
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Send push notifications to users when payments fail
                    </p>
                  </div>
                  <input
                    id="enable_push"
                    name="enable_push"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    defaultChecked={settings?.enable_push ?? DEFAULT_SETTINGS.enable_push}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="enable_dm" className="text-sm font-medium text-gray-900 dark:text-white">
                      Direct Messages
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Send direct messages via the platform when payments fail
                    </p>
                  </div>
                  <input
                    id="enable_dm"
                    name="enable_dm"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    defaultChecked={settings?.enable_dm ?? DEFAULT_SETTINGS.enable_dm}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Incentive Strategy
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="incentive_days" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Free Days Incentive
                  </label>
                  <select
                    id="incentive_days"
                    name="incentive_days"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    defaultValue={settings?.incentive_days ?? DEFAULT_SETTINGS.incentive_days}
                  >
                    {INCENTIVE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Number of free days to add on first payment failure to encourage recovery
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Reminder Schedule
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Reminder Timing (days after first failure)
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {REMINDER_OFFSETS.map(offset => (
                      <div key={offset.value} className="text-center">
                        <input
                          id={`reminder_${offset.value}`}
                          name={`reminder_${offset.value}`}
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mx-auto"
                          defaultChecked={settings?.reminder_offsets_days?.includes(offset.value) ?? DEFAULT_SETTINGS.reminder_offsets_days.includes(offset.value)}
                        />
                        <label htmlFor={`reminder_${offset.value}`} className="block text-sm text-gray-600 dark:text-gray-400 mt-1 cursor-pointer">
                          {offset.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Select when to send reminder notifications after a payment failure
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="px-6 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
