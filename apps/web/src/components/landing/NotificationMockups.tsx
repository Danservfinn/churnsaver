'use client';

import { Bell, MessageSquare, Gift, CreditCard, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationProps {
  type: 'push' | 'dm' | 'incentive' | 'success';
  className?: string;
}

function NotificationCard({ type, className }: NotificationProps) {
  const configs = {
    push: {
      icon: Bell,
      iconBg: 'bg-blue-500',
      title: 'Payment Issue',
      message: 'Your payment for Premium Membership failed. Tap to update your payment method.',
      time: 'Just now',
      app: 'ChurnSaver',
    },
    dm: {
      icon: MessageSquare,
      iconBg: 'bg-purple-500',
      title: 'Hey! Quick heads up',
      message: "We noticed your payment didn't go through. No worries - you can update your card and keep your access.",
      time: '2 min ago',
      app: 'Direct Message',
    },
    incentive: {
      icon: Gift,
      iconBg: 'bg-orange-500',
      title: 'Free Days Added!',
      message: "We've added 3 free days to your account while you update your payment. Take your time!",
      time: '5 min ago',
      app: 'ChurnSaver',
    },
    success: {
      icon: CheckCircle,
      iconBg: 'bg-green-500',
      title: 'Payment Recovered!',
      message: 'Great news! Your payment has been successfully processed. Thank you for staying with us!',
      time: '1 hour ago',
      app: 'ChurnSaver',
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-4 shadow-lg max-w-sm',
        className
      )}
    >
      <div className="flex gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', config.iconBg)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {config.app}
            </span>
            <span className="text-xs text-muted-foreground">{config.time}</span>
          </div>
          <h4 className="font-semibold text-sm text-foreground mb-1">{config.title}</h4>
          <p className="text-sm text-muted-foreground line-clamp-2">{config.message}</p>
        </div>
      </div>
    </div>
  );
}

export function NotificationMockups() {
  return (
    <section className="py-16 px-4 overflow-hidden">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            See It In Action
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Here's how ChurnSaver automatically reaches out to customers when payments fail
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left side - Phone mockup */}
          <div className="relative">
            {/* Phone frame */}
            <div className="relative mx-auto w-72 h-[580px] bg-zinc-900 rounded-[3rem] border-4 border-zinc-800 shadow-2xl overflow-hidden">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-zinc-900 rounded-b-2xl z-10" />

              {/* Screen content */}
              <div className="h-full w-full bg-zinc-950 pt-10 px-3 pb-3 overflow-hidden">
                {/* Status bar */}
                <div className="flex justify-between items-center text-white text-xs px-2 mb-4">
                  <span>9:41</span>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-2 border border-white rounded-sm">
                      <div className="w-2/3 h-full bg-white rounded-sm" />
                    </div>
                  </div>
                </div>

                {/* Notifications stack */}
                <div className="space-y-3">
                  <NotificationCard type="push" className="transform scale-95 origin-top" />
                  <NotificationCard type="incentive" className="transform scale-95 origin-top opacity-90" />
                  <NotificationCard type="success" className="transform scale-95 origin-top opacity-80" />
                </div>
              </div>
            </div>

            {/* Decorative glow */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 blur-3xl" />
          </div>

          {/* Right side - Description cards */}
          <div className="space-y-6">
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Bell className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Instant Push Notifications</h3>
                <p className="text-muted-foreground text-sm">
                  Immediately alert customers when a payment fails, prompting them to take action while the issue is fresh.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <MessageSquare className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Personalized Direct Messages</h3>
                <p className="text-muted-foreground text-sm">
                  Follow up with friendly, personalized messages that don't feel automated or aggressive.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <Gift className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Smart Incentives</h3>
                <p className="text-muted-foreground text-sm">
                  Automatically offer free days to reduce pressure and increase the chances of recovery.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Recovery Confirmation</h3>
                <p className="text-muted-foreground text-sm">
                  Celebrate successful recoveries with confirmation messages that reinforce customer loyalty.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
