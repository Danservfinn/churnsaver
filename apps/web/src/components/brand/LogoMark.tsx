'use client';

import { cn } from '@/lib/utils';

interface LogoMarkProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

/**
 * ChurnSaver Unified Logo Mark
 *
 * A premium wordmark design that combines:
 * - "Churn" in muted color (the problem)
 * - "Saver" in vibrant gradient (the solution)
 * - Optional recovery icon
 *
 * Uses CSS for proper font rendering with Space Grotesk
 */
export function LogoMark({ className, size = 'md', showIcon = true }: LogoMarkProps) {
  const sizeClasses = {
    sm: 'text-base gap-0.5',
    md: 'text-lg gap-1',
    lg: 'text-2xl gap-1.5',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
  };

  return (
    <div className={cn('flex items-center', sizeClasses[size], className)}>
      {/* Recovery Icon */}
      {showIcon && (
        <div className={cn(
          'flex items-center justify-center rounded-lg bg-gradient-to-br from-orange-600 to-orange-500',
          'shadow-lg shadow-orange-600/20',
          size === 'sm' ? 'h-6 w-6 rounded-md' : '',
          size === 'md' ? 'h-7 w-7' : '',
          size === 'lg' ? 'h-9 w-9 rounded-xl' : '',
        )}>
          <RecoveryArrow className={cn(
            'text-white',
            size === 'sm' ? 'h-3.5 w-3.5' : '',
            size === 'md' ? 'h-4 w-4' : '',
            size === 'lg' ? 'h-5 w-5' : '',
          )} />
        </div>
      )}

      {/* Wordmark */}
      <span className="font-heading font-semibold tracking-tight select-none">
        <span className="text-zinc-500">Churn</span>
        <span className="bg-gradient-to-r from-orange-600 via-orange-500 to-orange-600 bg-clip-text text-transparent font-bold">
          Saver
        </span>
      </span>
    </div>
  );
}

/**
 * Alternative: Pure text wordmark without icon
 * More dramatic gradient effect
 */
export function LogoWordmark({ className, size = 'md' }: Omit<LogoMarkProps, 'showIcon'>) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl',
  };

  return (
    <span
      className={cn(
        'font-heading font-bold tracking-tight select-none inline-flex items-baseline',
        sizeClasses[size],
        className
      )}
    >
      {/* Churn - muted, crossed out feel */}
      <span className="text-zinc-600 relative">
        Churn
        {/* Subtle strikethrough effect */}
        <span className="absolute left-0 right-0 top-1/2 h-[2px] bg-gradient-to-r from-transparent via-zinc-700 to-transparent opacity-30" />
      </span>

      {/* Saver - vibrant, solution */}
      <span className="relative ml-0.5">
        <span className="bg-gradient-to-r from-orange-600 via-orange-400 to-orange-600 bg-clip-text text-transparent">
          Saver
        </span>
        {/* Subtle glow effect */}
        <span className="absolute inset-0 bg-gradient-to-r from-orange-600 via-orange-400 to-orange-600 bg-clip-text text-transparent blur-sm opacity-50 -z-10">
          Saver
        </span>
      </span>
    </span>
  );
}

/**
 * Stylized recovery arrow icon
 */
function RecoveryArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Circular arrow */}
      <path
        d="M12 4C7.58 4 4 7.58 4 12s3.58 8 8 8 8-3.58 8-8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Arrow head */}
      <path
        d="M16 4h4v4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 4l-4 4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Icon-only version for favicons/small spaces
 */
export function LogoIcon({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl bg-gradient-to-br from-orange-600 to-orange-500',
        'shadow-lg shadow-orange-600/25',
        sizeClasses[size],
        className
      )}
    >
      <RecoveryArrow className="h-1/2 w-1/2 text-white" />
    </div>
  );
}

export default LogoMark;
