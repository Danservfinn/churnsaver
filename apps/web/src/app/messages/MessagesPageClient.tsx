'use client';

import { useState } from 'react';
import { Bell, MessageCircle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TemplateCard, TriggerType } from '@/components/messages/TemplateCard';
import { UpgradeModal } from '@/components/messages/UpgradeModal';

interface DefaultTemplates {
  push: Record<TriggerType, { title: string; body: string }>;
  dm: Record<TriggerType, { message: string }>;
}

interface MessagesPageClientProps {
  defaultTemplates: DefaultTemplates;
  maxCheckoutUrl: string | null;
}

type TabType = 'push' | 'dm';

const TRIGGER_ORDER: TriggerType[] = ['immediate', 'day_2', 'day_4', 'manual'];

export function MessagesPageClient({
  defaultTemplates,
  maxCheckoutUrl,
}: MessagesPageClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('push');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // For now, user cannot customize (would need to check tier from API)
  const canCustomize = false;

  const handleCustomize = () => {
    if (!canCustomize) {
      setShowUpgradeModal(true);
    }
    // If can customize, would open editor - future feature
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Message Templates
        </h1>
        <p className="text-muted-foreground">
          View and customize the messages sent to customers with failed payments.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab('push')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors',
            activeTab === 'push'
              ? 'bg-primary/10 text-primary border-b-2 border-primary -mb-[2px]'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <Bell className="h-4 w-4" />
          Push Notifications
        </button>
        <button
          onClick={() => setActiveTab('dm')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors',
            activeTab === 'dm'
              ? 'bg-primary/10 text-primary border-b-2 border-primary -mb-[2px]'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <MessageCircle className="h-4 w-4" />
          Direct Messages
        </button>
      </div>

      {/* Info banner */}
      {!canCustomize && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Custom templates require Max plan
            </p>
            <p className="text-sm text-muted-foreground">
              Upgrade to customize these messages with your brand voice.
            </p>
          </div>
        </div>
      )}

      {/* Template Cards */}
      <div className="grid gap-4">
        {activeTab === 'push' ? (
          TRIGGER_ORDER.map((triggerType) => (
            <TemplateCard
              key={triggerType}
              template={{
                channel: 'push',
                triggerType,
                title: defaultTemplates.push[triggerType].title,
                body: defaultTemplates.push[triggerType].body,
              }}
              onCustomize={handleCustomize}
              canCustomize={canCustomize}
            />
          ))
        ) : (
          TRIGGER_ORDER.map((triggerType) => (
            <TemplateCard
              key={triggerType}
              template={{
                channel: 'dm',
                triggerType,
                message: defaultTemplates.dm[triggerType].message,
              }}
              onCustomize={handleCustomize}
              canCustomize={canCustomize}
            />
          ))
        )}
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
