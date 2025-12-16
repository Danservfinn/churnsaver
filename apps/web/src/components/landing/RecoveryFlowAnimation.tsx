'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Bell, MessageSquare, Gift, CheckCircle, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  icon: React.ElementType;
  iconBg: string;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    id: 1,
    icon: AlertCircle,
    iconBg: 'bg-red-500',
    title: 'Payment Fails',
    description: 'A customer\'s payment is declined',
  },
  {
    id: 2,
    icon: Bell,
    iconBg: 'bg-blue-500',
    title: 'Instant Notification',
    description: 'Push notification sent immediately',
  },
  {
    id: 3,
    icon: MessageSquare,
    iconBg: 'bg-purple-500',
    title: 'Personal Outreach',
    description: 'Friendly DM with payment link',
  },
  {
    id: 4,
    icon: Gift,
    iconBg: 'bg-orange-500',
    title: 'Smart Incentive',
    description: 'Free days added automatically',
  },
  {
    id: 5,
    icon: CreditCard,
    iconBg: 'bg-cyan-500',
    title: 'Customer Updates',
    description: 'Payment method updated',
  },
  {
    id: 6,
    icon: CheckCircle,
    iconBg: 'bg-green-500',
    title: 'Revenue Recovered',
    description: 'Payment successful!',
  },
];

function NotificationPopup({ step, isVisible, position }: { step: Step; isVisible: boolean; position: 'left' | 'right' }) {
  const Icon = step.icon;

  return (
    <div
      className={cn(
        'absolute w-64 bg-card border border-border rounded-xl p-3 shadow-2xl transition-all duration-500',
        position === 'left' ? '-left-4 md:-left-20' : '-right-4 md:-right-20',
        'top-1/2 -translate-y-1/2',
        isVisible
          ? 'opacity-100 scale-100'
          : 'opacity-0 scale-95 pointer-events-none',
        position === 'left' ? 'origin-right' : 'origin-left'
      )}
    >
      <div className="flex gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', step.iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-foreground">{step.title}</h4>
          <p className="text-xs text-muted-foreground">{step.description}</p>
        </div>
      </div>
    </div>
  );
}

export function RecoveryFlowAnimation() {
  const [activeStep, setActiveStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    if (!isAnimating) return;

    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= steps.length) {
          // Pause at end, then restart
          setTimeout(() => setActiveStep(0), 1500);
          return prev;
        }
        return prev + 1;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [isAnimating]);

  // Calculate progress for the connecting line
  const progressPercentage = Math.min((activeStep / steps.length) * 100, 100);

  return (
    <section className="py-12 md:py-16 px-4 overflow-hidden">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            How It Works
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Watch how ChurnSaver automatically recovers failed payments
          </p>
        </div>

        {/* Desktop Timeline */}
        <div className="hidden md:block relative">
          {/* Background line */}
          <div className="absolute top-12 left-0 right-0 h-1 bg-muted rounded-full" />

          {/* Animated progress line */}
          <div
            className="absolute top-12 left-0 h-1 bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />

          {/* Steps */}
          <div className="relative flex justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index < activeStep;
              const isCurrent = index === activeStep - 1;

              return (
                <div
                  key={step.id}
                  className="flex flex-col items-center relative"
                  style={{ width: `${100 / steps.length}%` }}
                >
                  {/* Popup notification for current step */}
                  {isCurrent && index > 0 && index < steps.length - 1 && (
                    <NotificationPopup
                      step={step}
                      isVisible={isCurrent}
                      position={index % 2 === 0 ? 'left' : 'right'}
                    />
                  )}

                  {/* Icon circle */}
                  <div
                    className={cn(
                      'w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 relative z-10',
                      isActive ? step.iconBg : 'bg-muted',
                      isCurrent && 'ring-4 ring-primary/30 scale-110'
                    )}
                  >
                    <Icon className={cn(
                      'h-10 w-10 transition-colors duration-500',
                      isActive ? 'text-white' : 'text-muted-foreground'
                    )} />
                  </div>

                  {/* Label */}
                  <div className="mt-4 text-center">
                    <h3 className={cn(
                      'font-semibold text-sm transition-colors duration-300',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {step.title}
                    </h3>
                    <p className={cn(
                      'text-xs mt-1 transition-colors duration-300',
                      isActive ? 'text-muted-foreground' : 'text-muted-foreground/50'
                    )}>
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile Timeline (Vertical) */}
        <div className="md:hidden relative pl-12">
          {/* Background line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-muted" />

          {/* Animated progress line */}
          <div
            className="absolute left-5 top-0 w-0.5 bg-primary transition-all duration-500 ease-out"
            style={{ height: `${progressPercentage}%` }}
          />

          {/* Steps */}
          <div className="space-y-8">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index < activeStep;
              const isCurrent = index === activeStep - 1;

              return (
                <div key={step.id} className="relative flex items-start gap-4">
                  {/* Icon circle */}
                  <div
                    className={cn(
                      'absolute -left-12 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 z-10',
                      isActive ? step.iconBg : 'bg-muted',
                      isCurrent && 'ring-2 ring-primary/30 scale-110'
                    )}
                  >
                    <Icon className={cn(
                      'h-5 w-5 transition-colors duration-500',
                      isActive ? 'text-white' : 'text-muted-foreground'
                    )} />
                  </div>

                  {/* Content */}
                  <div className={cn(
                    'pt-1 transition-all duration-300',
                    isCurrent && 'translate-x-1'
                  )}>
                    <h3 className={cn(
                      'font-semibold text-sm transition-colors duration-300',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {step.title}
                    </h3>
                    <p className={cn(
                      'text-xs mt-0.5 transition-colors duration-300',
                      isActive ? 'text-muted-foreground' : 'text-muted-foreground/50'
                    )}>
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Replay button */}
        <div className="flex justify-center mt-8">
          <button
            onClick={() => {
              setActiveStep(0);
              setIsAnimating(true);
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Replay animation
          </button>
        </div>
      </div>
    </section>
  );
}
