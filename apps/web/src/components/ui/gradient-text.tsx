'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  gradient?: 'accent' | 'amber' | 'primary';
}

const gradientClasses = {
  accent: 'bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent',
  amber: 'bg-gradient-to-r from-secondary-400 to-secondary-600 bg-clip-text text-transparent',
  primary: 'bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent',
};

export function GradientText({
  children,
  className,
  gradient = 'accent',
}: GradientTextProps) {
  return (
    <span className={cn(gradientClasses[gradient], className)}>
      {children}
    </span>
  );
}



