'use client';

import { Calendar } from 'lucide-react';

export interface TimePeriodOption {
  label: string;
  value: number;
  description: string;
}

export const TIME_PERIOD_OPTIONS: TimePeriodOption[] = [
  { label: 'This Billing Period', value: 30, description: 'Current monthly cycle' },
  { label: 'Daily', value: 1, description: 'Last 24 hours' },
  { label: 'Weekly', value: 7, description: 'Last 7 days' },
  { label: 'Monthly', value: 30, description: 'Last 30 days' },
  { label: 'Quarterly', value: 90, description: 'Last 90 days' },
  { label: 'Annually', value: 365, description: 'Last 365 days' },
  { label: 'All Time', value: 9999, description: 'All historical data' },
];

interface TimePeriodSelectorProps {
  value: number;
  onChange: (windowDays: number) => void;
  disabled?: boolean;
}

export function TimePeriodSelector({ value, onChange, disabled }: TimePeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <select
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="flex h-10 w-[200px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-muted dark:bg-muted"
      >
        {TIME_PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
