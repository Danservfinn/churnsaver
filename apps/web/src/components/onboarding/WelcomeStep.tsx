'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sparkles, TrendingUp, Bell, Gift, ArrowRight } from 'lucide-react';

interface WelcomeStepProps {
  companyName?: string;
  onNext: () => void;
}

export function WelcomeStep({ companyName, onNext }: WelcomeStepProps) {
  const features = [
    {
      icon: Bell,
      title: 'Smart Notifications',
      description: 'Automated push and DM reminders',
    },
    {
      icon: Gift,
      title: 'Strategic Incentives',
      description: 'Offer free days to encourage payment',
    },
    {
      icon: TrendingUp,
      title: 'Recovery Analytics',
      description: 'Track your recovery performance',
    },
  ];

  return (
    <div className="card-premium rounded-2xl p-8 md:p-12 text-center">
      {/* Hero */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/30"
      >
        <Sparkles className="h-10 w-10 text-white" />
      </motion.div>

      <h1 className="text-3xl md:text-4xl font-bold mb-4">
        Welcome to <span className="text-gradient">ChurnSaver</span>
        {companyName && (
          <span className="block text-xl text-muted-foreground mt-2">
            {companyName}
          </span>
        )}
      </h1>

      <p className="text-lg text-muted-foreground max-w-md mx-auto mb-8">
        Let&apos;s get you set up to recover failed payments automatically.
        This will only take a minute.
      </p>

      {/* Features */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              className="p-4 rounded-xl bg-zinc-900/50 border border-white/5"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {feature.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* CTA */}
      <Button
        onClick={onNext}
        size="lg"
        className="gap-2 px-8"
      >
        Get Started
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
