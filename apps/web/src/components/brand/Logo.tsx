'use client';

import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  variant?: 'default' | 'compact' | 'icon';
  animated?: boolean;
}

/**
 * ChurnSaver Unified Logo
 *
 * A stylized wordmark that combines the brand name with visual identity.
 * Features gradient text, integrated recovery arrow symbol, and premium styling.
 *
 * Variants:
 * - default: Full wordmark with recovery arrow in the "S"
 * - compact: Shorter version for mobile
 * - icon: Just the stylized CS monogram
 */
export function Logo({ className, variant = 'default', animated = false }: LogoProps) {
  if (variant === 'icon') {
    return <LogoIcon className={className} animated={animated} />;
  }

  if (variant === 'compact') {
    return <LogoCompact className={className} animated={animated} />;
  }

  return <LogoFull className={className} animated={animated} />;
}

/**
 * Full wordmark logo
 * "Churn" in subtle gray → "Saver" in vibrant gradient
 * The "S" in Saver incorporates a circular recovery arrow
 */
function LogoFull({ className, animated }: { className?: string; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 180 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-8 w-auto', className)}
      aria-label="ChurnSaver logo"
      role="img"
    >
      <defs>
        {/* Primary gradient for "Saver" */}
        <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="50%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>

        {/* Animated gradient */}
        <linearGradient id="logo-gradient-animated" x1="0%" y1="0%" x2="200%" y2="0%">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="25%" stopColor="#fb923c" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="75%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
          {animated && (
            <animate
              attributeName="x1"
              values="0%;-100%"
              dur="3s"
              repeatCount="indefinite"
            />
          )}
          {animated && (
            <animate
              attributeName="x2"
              values="200%;100%"
              dur="3s"
              repeatCount="indefinite"
            />
          )}
        </linearGradient>

        {/* Glow filter */}
        <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* "Churn" - muted, represents the problem */}
      <text
        x="0"
        y="24"
        fontFamily="var(--font-space-grotesk), system-ui, sans-serif"
        fontSize="22"
        fontWeight="600"
        letterSpacing="-0.5"
        fill="#71717a"
      >
        Churn
      </text>

      {/* "Saver" - gradient, represents the solution */}
      <text
        x="68"
        y="24"
        fontFamily="var(--font-space-grotesk), system-ui, sans-serif"
        fontSize="22"
        fontWeight="700"
        letterSpacing="-0.5"
        fill={animated ? "url(#logo-gradient-animated)" : "url(#logo-gradient)"}
        filter="url(#logo-glow)"
      >
        Saver
      </text>

      {/* Recovery arrow integrated with the design */}
      <g transform="translate(156, 8)">
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="url(#logo-gradient)"
          strokeWidth="2"
          strokeDasharray="38 12"
          strokeLinecap="round"
        >
          {animated && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 10 10"
              to="360 10 10"
              dur="4s"
              repeatCount="indefinite"
            />
          )}
        </circle>
        <path
          d="M14 5 L18 8 L14 11"
          fill="none"
          stroke="url(#logo-gradient)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * Compact version for mobile/tight spaces
 */
function LogoCompact({ className, animated }: { className?: string; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 120 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-7 w-auto', className)}
      aria-label="ChurnSaver logo"
      role="img"
    >
      <defs>
        <linearGradient id="logo-compact-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="50%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>

      {/* CS Monogram with gradient */}
      <g transform="translate(0, 4)">
        <rect
          x="0"
          y="0"
          width="24"
          height="24"
          rx="6"
          fill="url(#logo-compact-gradient)"
        />
        <text
          x="12"
          y="17"
          fontFamily="var(--font-space-grotesk), system-ui, sans-serif"
          fontSize="12"
          fontWeight="700"
          fill="white"
          textAnchor="middle"
        >
          CS
        </text>
      </g>

      {/* Abbreviated text */}
      <text
        x="32"
        y="22"
        fontFamily="var(--font-space-grotesk), system-ui, sans-serif"
        fontSize="18"
        fontWeight="600"
        letterSpacing="-0.5"
        fill="#71717a"
      >
        Churn
      </text>
      <text
        x="78"
        y="22"
        fontFamily="var(--font-space-grotesk), system-ui, sans-serif"
        fontSize="18"
        fontWeight="700"
        letterSpacing="-0.5"
        fill="url(#logo-compact-gradient)"
      >
        S
      </text>
    </svg>
  );
}

/**
 * Icon-only version (stylized CS with recovery arrow)
 */
function LogoIcon({ className, animated }: { className?: string; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-8 w-8', className)}
      aria-label="ChurnSaver"
      role="img"
    >
      <defs>
        <linearGradient id="logo-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fb923c" />
        </linearGradient>
        <filter id="icon-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background rounded square */}
      <rect
        x="2"
        y="2"
        width="36"
        height="36"
        rx="10"
        fill="url(#logo-icon-gradient)"
        filter="url(#icon-glow)"
      />

      {/* CS Text */}
      <text
        x="20"
        y="26"
        fontFamily="var(--font-space-grotesk), system-ui, sans-serif"
        fontSize="16"
        fontWeight="700"
        fill="white"
        textAnchor="middle"
      >
        CS
      </text>

      {/* Subtle recovery arrow arc at top */}
      <path
        d="M12 8 A12 12 0 0 1 28 8"
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="2"
        strokeLinecap="round"
      >
        {animated && (
          <animate
            attributeName="stroke-opacity"
            values="0.2;0.6;0.2"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </path>
      <path
        d="M26 5 L28 8 L25 10"
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Logo;
