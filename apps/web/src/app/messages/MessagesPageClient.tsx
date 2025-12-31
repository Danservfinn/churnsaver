'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  MessageCircle,
  Lock,
  Zap,
  Clock,
  Send,
  CheckCircle,
  ArrowRight,
  Smartphone,
  Sparkles,
  Edit3,
  Eye,
  ChevronDown,
  Save,
  X,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UpgradeModal } from '@/components/messages/UpgradeModal';
import { useWhop, useWhopCompany } from '@/lib/context/whop';
import { useToast } from '@/components/ui/toast';

interface DefaultTemplates {
  push: Record<TriggerType, { title: string; body: string }>;
  dm: Record<TriggerType, { message: string }>;
}

interface MessagesPageClientProps {
  defaultTemplates: DefaultTemplates;
  maxCheckoutUrl: string | null;
}

type TabType = 'push' | 'dm';
type TriggerType = 'immediate' | 'day_2' | 'day_4' | 'manual';

interface TimelineStep {
  id: TriggerType;
  label: string;
  timing: string;
  description: string;
  icon: typeof Zap;
  color: string;
  gradientFrom: string;
  gradientTo: string;
}

const TIMELINE_STEPS: TimelineStep[] = [
  {
    id: 'immediate',
    label: 'Instant Alert',
    timing: '0 min',
    description: 'Triggered immediately when payment fails',
    icon: Zap,
    color: 'text-red-400',
    gradientFrom: 'from-red-500/20',
    gradientTo: 'to-red-600/5',
  },
  {
    id: 'day_2',
    label: 'First Follow-up',
    timing: '48 hours',
    description: 'Gentle reminder after 2 days',
    icon: Clock,
    color: 'text-orange-400',
    gradientFrom: 'from-orange-500/20',
    gradientTo: 'to-orange-600/5',
  },
  {
    id: 'day_4',
    label: 'Final Notice',
    timing: '96 hours',
    description: 'Last chance before access expires',
    icon: Send,
    color: 'text-amber-400',
    gradientFrom: 'from-amber-500/20',
    gradientTo: 'to-amber-600/5',
  },
  {
    id: 'manual',
    label: 'Manual Trigger',
    timing: 'On demand',
    description: 'Send anytime via dashboard',
    icon: CheckCircle,
    color: 'text-green-400',
    gradientFrom: 'from-green-500/20',
    gradientTo: 'to-green-600/5',
  },
];

// Phone mockup component
function PhoneMockup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      {/* Phone frame */}
      <div className="relative w-[280px] h-[560px] bg-zinc-900 rounded-[3rem] p-3 shadow-2xl shadow-black/50 border border-zinc-700/50">
        {/* Dynamic Island */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-10" />

        {/* Screen */}
        <div className="w-full h-full bg-zinc-950 rounded-[2.25rem] overflow-hidden relative">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-12 pb-2 text-white text-xs">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-2 border border-white rounded-sm relative">
                <div className="absolute inset-0.5 bg-white rounded-sm" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 pt-2 pb-8 h-[calc(100%-60px)] overflow-hidden">
            {children}
          </div>
        </div>
      </div>

      {/* Reflection */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-[3rem] pointer-events-none" />
    </div>
  );
}

// Notification card inside phone
function NotificationPreview({
  title,
  body,
  appName = 'ChurnSaver',
  animate = false,
}: {
  title: string;
  body: string;
  appName?: string;
  animate?: boolean;
}) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: -20, scale: 0.95 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="bg-zinc-800/90 backdrop-blur-xl rounded-2xl p-3.5 shadow-lg border border-zinc-700/50"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-medium text-zinc-400">{appName}</span>
            <span className="text-[10px] text-zinc-500">now</span>
          </div>
          <p className="text-sm font-semibold text-white truncate">{title}</p>
          <p className="text-xs text-zinc-400 line-clamp-2">{body}</p>
        </div>
      </div>
    </motion.div>
  );
}

// DM bubble inside phone
function DMPreview({ message, animate = false }: { message: string; animate?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
          <span className="text-sm font-bold text-white">CS</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">ChurnSaver</p>
          <p className="text-xs text-zinc-500">Business</p>
        </div>
      </div>

      {/* Message bubble */}
      <motion.div
        initial={animate ? { opacity: 0, x: -20, scale: 0.95 } : false}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.1 }}
        className="flex items-end gap-2"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center flex-shrink-0">
          <span className="text-[8px] font-bold text-white">CS</span>
        </div>
        <div className="bg-zinc-800 rounded-2xl rounded-bl-md p-3 max-w-[85%]">
          <p className="text-sm text-white leading-relaxed">{message}</p>
          <p className="text-[10px] text-zinc-500 mt-1 text-right">9:41 AM</p>
        </div>
      </motion.div>
    </div>
  );
}

interface SubscriptionStatus {
  tier: string;
  features: {
    customTemplates: boolean;
    maxTemplatesPerChannel: number;
    basicAnalytics: boolean;
    csvExport: boolean;
    prioritySupport: boolean;
  };
}

export function MessagesPageClient({
  defaultTemplates,
  maxCheckoutUrl,
}: MessagesPageClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('push');
  const [activeStep, setActiveStep] = useState<TriggerType>('immediate');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [customTemplates, setCustomTemplates] = useState(defaultTemplates);
  const [editingTemplate, setEditingTemplate] = useState<{
    title?: string;
    body?: string;
    message?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);

  const { getAuthHeaders } = useWhop();
  const { companyId, isLoading: isAuthLoading } = useWhopCompany();
  const { addToast } = useToast();

  // Fetch subscription status to check if user can customize templates
  useEffect(() => {
    if (!isAuthLoading && companyId && companyId !== 'unknown') {
      fetch('/api/subscription', {
        headers: getAuthHeaders({ companyId }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.status) {
            setSubscriptionStatus(data.status);
          }
        })
        .catch(() => {
          // Silently fail - user will see upgrade prompt
        });
    }
  }, [companyId, isAuthLoading, getAuthHeaders]);

  const canCustomize = subscriptionStatus?.features?.customTemplates ?? false;

  const handleCustomize = () => {
    if (!canCustomize) {
      setShowUpgradeModal(true);
    } else {
      // Enter edit mode and populate form with current template
      const current = activeTab === 'push'
        ? customTemplates.push[activeStep]
        : customTemplates.dm[activeStep];

      if (activeTab === 'push') {
        setEditingTemplate({
          title: (current as { title: string; body: string }).title,
          body: (current as { title: string; body: string }).body,
        });
      } else {
        setEditingTemplate({
          message: (current as { message: string }).message,
        });
      }
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingTemplate({});
  };

  const handleSaveTemplate = async () => {
    setIsSaving(true);

    // Update local state immediately for optimistic UI
    if (activeTab === 'push') {
      setCustomTemplates((prev) => ({
        ...prev,
        push: {
          ...prev.push,
          [activeStep]: {
            title: editingTemplate.title || '',
            body: editingTemplate.body || '',
          },
        },
      }));
    } else {
      setCustomTemplates((prev) => ({
        ...prev,
        dm: {
          ...prev.dm,
          [activeStep]: {
            message: editingTemplate.message || '',
          },
        },
      }));
    }

    // TODO: Save to backend when templates API is implemented
    // For now, just show success and exit edit mode
    setTimeout(() => {
      setIsSaving(false);
      setIsEditing(false);
      setEditingTemplate({});
      addToast({
        type: 'success',
        title: 'Template updated',
        message: 'Your custom template has been saved.',
      });
    }, 500);
  };

  const currentTemplate = activeTab === 'push'
    ? customTemplates.push[activeStep]
    : customTemplates.dm[activeStep];

  const currentStepData = TIMELINE_STEPS.find((s) => s.id === activeStep)!;

  // Auto-cycle through steps for demo effect
  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 100);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-gradient opacity-50" />
        <div className="absolute inset-0 bg-mesh-gradient opacity-30" />

        <div className="relative container mx-auto px-4 py-12 md:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-primary/20 mb-6">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Message Templates</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Craft Your <span className="text-gradient">Recovery Flow</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl">
              Design the perfect sequence of messages to recover failed payments.
              Each touchpoint is optimized for maximum conversion.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Tab Selection - Premium Style */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex p-1.5 rounded-2xl glass border border-white/10">
            <button
              onClick={() => setActiveTab('push')}
              className={cn(
                'flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300',
                activeTab === 'push'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <Bell className="h-4 w-4" />
              Push Notifications
            </button>
            <button
              onClick={() => setActiveTab('dm')}
              className={cn(
                'flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300',
                activeTab === 'dm'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <MessageCircle className="h-4 w-4" />
              Direct Messages
            </button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start max-w-6xl mx-auto">
          {/* Left: Timeline */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6"
          >
            {/* Info Banner */}
            {!canCustomize ? (
              <div className="card-premium rounded-xl p-5 border border-primary/20 bg-primary/5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 flex-shrink-0">
                    <Lock className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground mb-1">
                      Unlock Custom Templates
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      Personalize these messages with your brand voice to increase conversions.
                    </p>
                    <Button
                      size="sm"
                      onClick={handleCustomize}
                      className="gap-2"
                    >
                      Upgrade to Max
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card-premium rounded-xl p-5 border border-green-500/20 bg-green-500/5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/20 flex-shrink-0">
                    <Crown className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-foreground">
                        Max Tier Active
                      </p>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Custom Templates
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Click any template in the preview to customize it with your brand voice.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-primary/20 to-transparent" />

              <div className="space-y-4">
                {TIMELINE_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = step.id === activeStep;

                  return (
                    <motion.button
                      key={step.id}
                      onClick={() => {
                        setActiveStep(step.id);
                        setIsAnimating(true);
                        setTimeout(() => setIsAnimating(false), 100);
                      }}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'relative w-full text-left p-4 pl-16 rounded-xl border transition-all duration-300',
                        isActive
                          ? `card-featured border-primary/30 bg-gradient-to-r ${step.gradientFrom} ${step.gradientTo}`
                          : 'card-premium border-white/5 hover:border-white/10'
                      )}
                    >
                      {/* Timeline node */}
                      <div
                        className={cn(
                          'absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300',
                          isActive
                            ? 'bg-primary ring-4 ring-primary/20 scale-110'
                            : 'bg-zinc-800 border border-zinc-700'
                        )}
                      >
                        {isActive && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-2 h-2 rounded-full bg-white"
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'p-2 rounded-lg transition-colors',
                            isActive ? 'bg-primary/20' : 'bg-zinc-800/50'
                          )}>
                            <Icon className={cn('h-4 w-4', isActive ? step.color : 'text-zinc-500')} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className={cn(
                                'font-semibold',
                                isActive ? 'text-foreground' : 'text-muted-foreground'
                              )}>
                                {step.label}
                              </h3>
                              <Badge variant="secondary" className={cn(
                                'text-[10px] px-1.5',
                                isActive ? 'bg-primary/20 text-primary' : 'bg-zinc-800 text-zinc-500'
                              )}>
                                {step.timing}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {step.description}
                            </p>
                          </div>
                        </div>

                        <ChevronDown className={cn(
                          'h-4 w-4 transition-transform',
                          isActive ? 'text-primary rotate-180' : 'text-zinc-600'
                        )} />
                      </div>

                      {/* Active indicator */}
                      {isActive && (
                        <motion.div
                          layoutId="activeIndicator"
                          className="absolute inset-0 rounded-xl border-2 border-primary/50 pointer-events-none"
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Variables Section */}
            <div className="card-premium rounded-xl p-5">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="text-primary">{'{ }'}</span>
                Available Variables
              </h4>
              <div className="flex flex-wrap gap-2">
                {['{{billing_url}}', '{{membership_name}}', '{{first_name}}'].map((variable) => (
                  <code
                    key={variable}
                    className="px-2.5 py-1 rounded-md bg-zinc-800/50 text-xs font-mono text-primary border border-zinc-700/50"
                  >
                    {variable}
                  </code>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right: Phone Preview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center sticky top-8"
          >
            {/* Preview Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className={cn(
                'p-2.5 rounded-xl',
                `bg-gradient-to-br ${currentStepData.gradientFrom} ${currentStepData.gradientTo}`
              )}>
                <Eye className={cn('h-5 w-5', currentStepData.color)} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Live Preview</h3>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'push' ? 'Push notification' : 'Direct message'}
                </p>
              </div>
            </div>

            {/* Phone Mockup */}
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full transform scale-75 opacity-50" />

              <PhoneMockup>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeTab}-${activeStep}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === 'push' ? (
                      <div className="space-y-3">
                        <NotificationPreview
                          title={(currentTemplate as { title: string; body: string }).title}
                          body={(currentTemplate as { title: string; body: string }).body}
                          animate={!isAnimating}
                        />
                        {/* Dimmed older notifications for context */}
                        <div className="opacity-40 scale-95 origin-top">
                          <NotificationPreview
                            title="Previous notification..."
                            body="This is how stacked notifications appear"
                          />
                        </div>
                      </div>
                    ) : (
                      <DMPreview
                        message={(currentTemplate as { message: string }).message}
                        animate={!isAnimating}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </PhoneMockup>
            </div>

            {/* Edit Section */}
            {isEditing ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 w-full max-w-sm card-premium rounded-xl p-5 border border-primary/30"
              >
                <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-primary" />
                  Edit {activeTab === 'push' ? 'Push Notification' : 'Direct Message'}
                </h4>

                <div className="space-y-4">
                  {activeTab === 'push' ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          Title (max 100 characters)
                        </label>
                        <input
                          type="text"
                          maxLength={100}
                          value={editingTemplate.title || ''}
                          onChange={(e) => setEditingTemplate((prev) => ({ ...prev, title: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-foreground text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                          placeholder="Notification title..."
                        />
                        <span className="text-xs text-muted-foreground">
                          {editingTemplate.title?.length || 0}/100
                        </span>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          Body (max 500 characters)
                        </label>
                        <textarea
                          maxLength={500}
                          rows={3}
                          value={editingTemplate.body || ''}
                          onChange={(e) => setEditingTemplate((prev) => ({ ...prev, body: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-foreground text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                          placeholder="Notification body..."
                        />
                        <span className="text-xs text-muted-foreground">
                          {editingTemplate.body?.length || 0}/500
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Message (max 2000 characters)
                      </label>
                      <textarea
                        maxLength={2000}
                        rows={5}
                        value={editingTemplate.message || ''}
                        onChange={(e) => setEditingTemplate((prev) => ({ ...prev, message: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-foreground text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                        placeholder="DM message..."
                      />
                      <span className="text-xs text-muted-foreground">
                        {editingTemplate.message?.length || 0}/2000
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={handleSaveTemplate}
                      disabled={isSaving}
                      size="sm"
                      className="flex-1 gap-2"
                    >
                      {isSaving ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          >
                            <Save className="h-4 w-4" />
                          </motion.div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save Template
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleCancelEdit}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <Button
                onClick={handleCustomize}
                variant="outline"
                className="mt-8 gap-2"
              >
                <Edit3 className="h-4 w-4" />
                {canCustomize ? 'Edit Template' : 'Customize Template'}
              </Button>
            )}
          </motion.div>
        </div>
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        checkoutUrl={maxCheckoutUrl}
      />
    </div>
  );
}
