'use client';

import { useEffect, useState, useRef } from 'react';
import { shouldReduceMotion, getAnimationDuration } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  'aria-label'?: string;
  'aria-live'?: 'polite' | 'assertive' | 'off';
}

export function AnimatedCounter({
  value,
  duration = 800,
  className,
  prefix = '',
  suffix = '',
  decimals = 0,
  'aria-label': ariaLabel,
  'aria-live': ariaLive = 'polite',
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(value);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (shouldReduceMotion()) {
      setDisplayValue(value);
      return;
    }

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentValue =
        startValueRef.current +
        (value - startValueRef.current) * easeOut;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        startTimeRef.current = null;
      }
    };

    if (value !== displayValue) {
      setIsAnimating(true);
      startValueRef.current = displayValue;
      startTimeRef.current = null;
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration, displayValue]);

  const formattedValue = displayValue.toFixed(decimals);

  return (
    <span
      className={cn('tabular-nums', className)}
      aria-label={ariaLabel || `${prefix}${formattedValue}${suffix}`}
      aria-live={ariaLive}
      aria-atomic="true"
    >
      {prefix}
      {formattedValue}
      {suffix}
    </span>
  );
}



