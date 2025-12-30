'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, MessageSquare, Users, Sparkles, Crown, Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutUrl: string | null;
}

const features = [
  {
    icon: MessageSquare,
    title: 'Custom Templates',
    description: 'Personalize all message templates with your brand voice',
  },
  {
    icon: Zap,
    title: 'Unlimited Recoveries',
    description: 'No limits on the number of payments you can recover',
  },
  {
    icon: Users,
    title: 'Priority Support',
    description: 'Get help from our team within 24 hours',
  },
];

export function UpgradeModal({ isOpen, onClose, checkoutUrl }: UpgradeModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
            aria-label="Close modal"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative z-10 w-full max-w-lg overflow-hidden"
          >
            {/* Outer glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary via-orange-500 to-primary rounded-3xl blur-lg opacity-30 animate-pulse" />

            <div className="relative card-premium rounded-2xl border border-white/10 overflow-hidden">
              {/* Gradient top accent */}
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/20 to-transparent pointer-events-none" />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 z-20 p-2 rounded-full glass hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>

              {/* Content */}
              <div className="relative p-8">
                {/* Header */}
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-orange-600 mb-4 shadow-lg shadow-primary/30"
                  >
                    <Crown className="h-8 w-8 text-white" />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
                      <Sparkles className="h-3 w-3" />
                      UNLOCK PREMIUM
                    </div>
                  </motion.div>

                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-2xl font-bold text-foreground mb-2"
                  >
                    Upgrade to <span className="text-gradient">Max</span>
                  </motion.h2>

                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="text-muted-foreground"
                  >
                    Take full control of your recovery messages
                  </motion.p>
                </div>

                {/* Features */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-3 mb-8"
                >
                  {features.map((feature, index) => (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 + index * 0.05 }}
                      className="flex items-start gap-4 p-4 rounded-xl glass border border-white/5"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
                        <feature.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground text-sm">
                          {feature.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {feature.description}
                        </p>
                      </div>
                      <Check className="h-5 w-5 text-green-500 flex-shrink-0 ml-auto" />
                    </motion.div>
                  ))}
                </motion.div>

                {/* Price */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-center mb-6"
                >
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-gradient">$99</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cancel anytime. 14-day money-back guarantee.
                  </p>
                </motion.div>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  className="flex gap-3"
                >
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onClose}
                  >
                    Maybe Later
                  </Button>
                  {checkoutUrl ? (
                    <Button
                      className="flex-1 gap-2 glow-primary-sm"
                      onClick={() => window.open(checkoutUrl, '_blank')}
                    >
                      Upgrade Now
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button className="flex-1" disabled>
                      Coming Soon
                    </Button>
                  )}
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
