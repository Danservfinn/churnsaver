'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Bell,
  MessageSquare,
  Gift,
  CheckCircle,
  CreditCard,
  TrendingUp,
  DollarSign,
  ArrowRight,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Animation phases
type Phase = 'payment_failed' | 'notification_sent' | 'dm_sent' | 'incentive_added' | 'payment_updated' | 'recovered';

interface NotificationCard {
  id: string;
  type: 'alert' | 'notification' | 'message' | 'incentive' | 'success';
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}

const phaseNotifications: Record<Phase, NotificationCard> = {
  payment_failed: {
    id: 'alert',
    type: 'alert',
    title: 'Payment Failed',
    subtitle: 'Card ending in 4242 was declined',
    icon: AlertCircle,
    color: 'from-red-500/20 to-red-600/10 border-red-500/30',
  },
  notification_sent: {
    id: 'notification',
    type: 'notification',
    title: 'Push Notification Sent',
    subtitle: 'Hey! Your payment needs attention',
    icon: Bell,
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
  },
  dm_sent: {
    id: 'message',
    type: 'message',
    title: 'Direct Message Sent',
    subtitle: 'Personal outreach with payment link',
    icon: MessageSquare,
    color: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
  },
  incentive_added: {
    id: 'incentive',
    type: 'incentive',
    title: 'Incentive Applied',
    subtitle: '3 free days added to subscription',
    icon: Gift,
    color: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
  },
  payment_updated: {
    id: 'updated',
    type: 'success',
    title: 'Payment Updated',
    subtitle: 'New card ending in 8888 added',
    icon: CreditCard,
    color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
  },
  recovered: {
    id: 'recovered',
    type: 'success',
    title: 'Revenue Recovered!',
    subtitle: '$49.00 subscription saved',
    icon: CheckCircle,
    color: 'from-green-500/20 to-green-600/10 border-green-500/30',
  },
};

const phases: Phase[] = ['payment_failed', 'notification_sent', 'dm_sent', 'incentive_added', 'payment_updated', 'recovered'];

// Base revenue amount to show realistic dashboard (not $0.00)
const BASE_REVENUE = 847;

export function RecoveryFlowAnimation() {
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(-1);
  const [isAnimating, setIsAnimating] = useState(true);
  const [recoveredAmount, setRecoveredAmount] = useState(0);
  const [showParticles, setShowParticles] = useState(false);

  const resetAnimation = useCallback(() => {
    setCurrentPhaseIndex(-1);
    setRecoveredAmount(0);
    setShowParticles(false);
    setIsAnimating(true);
  }, []);

  useEffect(() => {
    if (!isAnimating) return;

    const timer = setTimeout(() => {
      if (currentPhaseIndex < phases.length - 1) {
        setCurrentPhaseIndex((prev) => prev + 1);

        // Trigger celebration on recovery
        if (currentPhaseIndex === phases.length - 2) {
          setShowParticles(true);
          // Animate recovered amount
          let amount = 0;
          const interval = setInterval(() => {
            amount += 4.9;
            if (amount >= 49) {
              setRecoveredAmount(49);
              clearInterval(interval);
            } else {
              setRecoveredAmount(Math.round(amount * 100) / 100);
            }
          }, 50);
        }
      } else {
        // Wait then restart
        setTimeout(() => {
          resetAnimation();
        }, 3000);
      }
    }, currentPhaseIndex === -1 ? 800 : 2000);

    return () => clearTimeout(timer);
  }, [currentPhaseIndex, isAnimating, resetAnimation]);

  const currentPhase = currentPhaseIndex >= 0 ? phases[currentPhaseIndex] : null;
  const visibleNotifications = phases.slice(0, currentPhaseIndex + 1);

  return (
    <section className="py-16 md:py-24 px-4 overflow-hidden">
      <div className="container mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="text-center mb-12 md:mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted mb-4"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">See It In Action</span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
          >
            Watch the <span className="text-gradient">Magic Happen</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            From failed payment to recovered revenue in seconds—fully automated
          </motion.p>
        </div>

        {/* Main Animation Container */}
        <div className="relative">
          {/* Background Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="relative mx-auto max-w-4xl"
          >
            {/* Dashboard Frame */}
            <div className="card-premium rounded-2xl overflow-hidden">
              {/* Dashboard Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">ChurnSaver Dashboard</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    Live
                  </div>
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="p-6 md:p-8 min-h-[400px] md:min-h-[450px]">
                <div className="grid md:grid-cols-2 gap-6 h-full">
                  {/* Left: Stats */}
                  <div className="space-y-6">
                    {/* Recovery Rate Card */}
                    <div className="glass rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground">Recovery Rate</span>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <motion.span
                          className="text-4xl font-bold text-foreground"
                          animate={{ opacity: currentPhase === 'recovered' ? 1 : 0.7 }}
                        >
                          97%
                        </motion.span>
                        <span className="text-sm text-green-500">+2.3%</span>
                      </div>
                      <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-primary to-orange-400 rounded-full"
                          initial={{ width: '85%' }}
                          animate={{ width: currentPhase === 'recovered' ? '97%' : '85%' }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    {/* Revenue Recovered Card */}
                    <div className="glass rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground">Session Revenue</span>
                        <DollarSign className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-foreground">
                          ${(BASE_REVENUE + recoveredAmount).toFixed(2)}
                        </span>
                        {currentPhase === 'recovered' && (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-sm text-green-500 font-medium"
                          >
                            +$49 recovered!
                          </motion.span>
                        )}
                      </div>
                    </div>

                    {/* Status Indicator */}
                    <div className="glass rounded-xl p-5">
                      <div className="flex items-center gap-3">
                        <motion.div
                          className={cn(
                            'w-3 h-3 rounded-full',
                            currentPhase === 'recovered' ? 'bg-green-500' : 'bg-primary'
                          )}
                          animate={{
                            scale: [1, 1.2, 1],
                            opacity: [1, 0.7, 1],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                        />
                        <span className="text-sm font-medium text-foreground">
                          {currentPhase === 'recovered'
                            ? 'Recovery Complete'
                            : currentPhase
                              ? 'Recovery In Progress...'
                              : 'Monitoring Payments...'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Notification Feed */}
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-semibold text-foreground">Activity Feed</span>
                      <span className="text-xs text-muted-foreground">Live updates</span>
                    </div>

                    {/* Notification Stack */}
                    <div className="space-y-3 relative">
                      <AnimatePresence mode="popLayout">
                        {visibleNotifications.map((phase, index) => {
                          const notification = phaseNotifications[phase];
                          const Icon = notification.icon;
                          const isLatest = index === visibleNotifications.length - 1;

                          return (
                            <motion.div
                              key={notification.id}
                              layout
                              initial={{ opacity: 0, x: 50, scale: 0.8 }}
                              animate={{
                                opacity: isLatest ? 1 : 0.6,
                                x: 0,
                                scale: 1,
                              }}
                              exit={{ opacity: 0, x: -50, scale: 0.8 }}
                              transition={{
                                type: 'spring',
                                stiffness: 500,
                                damping: 40,
                                opacity: { duration: 0.2 }
                              }}
                              className={cn(
                                'relative p-4 rounded-xl border bg-gradient-to-br backdrop-blur-sm',
                                notification.color,
                                isLatest && 'ring-1 ring-white/10'
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                                  notification.type === 'alert' && 'bg-red-500/20',
                                  notification.type === 'notification' && 'bg-blue-500/20',
                                  notification.type === 'message' && 'bg-purple-500/20',
                                  notification.type === 'incentive' && 'bg-orange-500/20',
                                  notification.type === 'success' && 'bg-green-500/20',
                                )}>
                                  <Icon className={cn(
                                    'h-5 w-5',
                                    notification.type === 'alert' && 'text-red-400',
                                    notification.type === 'notification' && 'text-blue-400',
                                    notification.type === 'message' && 'text-purple-400',
                                    notification.type === 'incentive' && 'text-orange-400',
                                    notification.type === 'success' && 'text-green-400',
                                  )} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {notification.subtitle}
                                  </p>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  Just now
                                </span>
                              </div>

                              {/* Pulse effect on latest */}
                              {isLatest && (
                                <motion.div
                                  className="absolute inset-0 rounded-xl border-2 border-white/20"
                                  initial={{ opacity: 0.5 }}
                                  animate={{ opacity: 0, scale: 1.05 }}
                                  transition={{ duration: 1, repeat: 2 }}
                                />
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>

                      {/* Empty state */}
                      {visibleNotifications.length === 0 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center py-12 text-muted-foreground"
                        >
                          <Bell className="h-8 w-8 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">Waiting for activity...</p>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Celebration Particles */}
            <AnimatePresence>
              {showParticles && (
                <>
                  {[...Array(12)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-2 h-2 rounded-full bg-primary"
                      initial={{
                        opacity: 1,
                        x: '50%',
                        y: '50%',
                      }}
                      animate={{
                        opacity: [1, 1, 0],
                        x: `${50 + (Math.random() - 0.5) * 100}%`,
                        y: `${50 + (Math.random() - 0.5) * 100}%`,
                        scale: [0, 1.5, 0],
                      }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 1.5,
                        delay: i * 0.05,
                        ease: 'easeOut',
                      }}
                    />
                  ))}
                </>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Progress Indicator */}
          <div className="flex justify-center mt-8 gap-2">
            {phases.map((phase, index) => (
              <motion.div
                key={phase}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  index <= currentPhaseIndex ? 'bg-primary' : 'bg-muted'
                )}
                animate={{
                  scale: index === currentPhaseIndex ? 1.3 : 1,
                }}
              />
            ))}
          </div>

          {/* Replay Button */}
          <div className="flex justify-center mt-6">
            <button
              onClick={resetAnimation}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
            >
              <RotateCcw className="h-4 w-4" />
              Replay Animation
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
