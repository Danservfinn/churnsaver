'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, Settings, BarChart3, MessageSquare } from 'lucide-react';
import Link from 'next/link';

interface CompleteStepProps {
  companyId: string;
  onComplete: () => void;
}

export function CompleteStep({ companyId, onComplete }: CompleteStepProps) {
  const quickLinks = [
    {
      icon: BarChart3,
      title: 'View Dashboard',
      description: 'Monitor recovery cases',
      href: `/dashboard/${companyId}`,
    },
    {
      icon: MessageSquare,
      title: 'Message Templates',
      description: 'Customize notifications',
      href: '/messages',
    },
    {
      icon: Settings,
      title: 'Settings',
      description: 'Fine-tune your setup',
      href: '/settings',
    },
  ];

  return (
    <div className="card-premium rounded-2xl p-8 md:p-12 text-center">
      {/* Success Animation */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500/20 to-green-600/5 flex items-center justify-center mx-auto mb-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}
        >
          <CheckCircle className="h-12 w-12 text-green-400" />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-3xl font-bold mb-2">You&apos;re All Set!</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          ChurnSaver is ready to help you recover failed payments.
          When a payment fails, we&apos;ll automatically start the recovery process.
        </p>
      </motion.div>

      {/* Quick Links */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid sm:grid-cols-3 gap-4 mb-8"
      >
        {quickLinks.map((link, index) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.title}
              href={link.href}
              className="group p-4 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {link.title}
              </h3>
              <p className="text-xs text-muted-foreground">
                {link.description}
              </p>
            </Link>
          );
        })}
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Button
          onClick={onComplete}
          size="lg"
          className="gap-2 px-8"
        >
          Go to Dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.div>
    </div>
  );
}
