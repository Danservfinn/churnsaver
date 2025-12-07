'use client';

import { cn } from '@/lib/utils';

interface LoadingIllustrationProps {
  variant?: 'spinner' | 'progress';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 24,
  md: 40,
  lg: 64,
};

export function LoadingIllustration({
  variant = 'spinner',
  className,
  size = 'md',
}: LoadingIllustrationProps) {
  const dimension = sizeMap[size];

  return (
    <div
      className={cn('flex items-center justify-center', className)}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {variant === 'spinner' ? (
        <div
          className="animate-spin rounded-full border-2 border-muted border-t-primary"
          style={{ width: dimension, height: dimension }}
        />
      ) : (
        <div className="w-full max-w-md">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full animate-pulse"
              style={{ width: '60%' }}
            />
          </div>
        </div>
      )}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
