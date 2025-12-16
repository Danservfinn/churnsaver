'use client';

import { Bell, MessageCircle, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type TemplateChannel = 'push' | 'dm';
export type TriggerType = 'immediate' | 'day_2' | 'day_4' | 'manual';

interface TemplateData {
  channel: TemplateChannel;
  triggerType: TriggerType;
  title?: string;
  body?: string;
  message?: string;
}

interface TemplateCardProps {
  template: TemplateData;
  onCustomize: () => void;
  canCustomize: boolean;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  immediate: 'Immediate',
  day_2: 'Day 2',
  day_4: 'Day 4',
  manual: 'Manual',
};

const TRIGGER_DESCRIPTIONS: Record<TriggerType, string> = {
  immediate: 'Sent immediately when payment fails',
  day_2: 'Sent 2 days after initial failure',
  day_4: 'Sent 4 days after initial failure',
  manual: 'Sent when manually triggered',
};

export function TemplateCard({ template, onCustomize, canCustomize }: TemplateCardProps) {
  const isPush = template.channel === 'push';

  return (
    <div className="bg-card/50 border border-border rounded-lg p-4 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            {isPush ? (
              <Bell className="h-4 w-4 text-primary" />
            ) : (
              <MessageCircle className="h-4 w-4 text-primary" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-foreground">
              {TRIGGER_LABELS[template.triggerType]}
            </h3>
            <p className="text-xs text-muted-foreground">
              {TRIGGER_DESCRIPTIONS[template.triggerType]}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCustomize}
          className="gap-1.5"
        >
          <Edit2 className="h-3.5 w-3.5" />
          {canCustomize ? 'Edit' : 'Customize'}
        </Button>
      </div>

      {/* Content Preview */}
      <div className="bg-background/50 rounded-md p-3 border border-border/50">
        {isPush ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {template.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {template.body}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {template.message}
          </p>
        )}
      </div>

      {/* Variables hint */}
      <p className="mt-2 text-xs text-muted-foreground">
        Available variables: {'{{billing_url}}'}, {'{{membership_name}}'}, {'{{first_name}}'}
      </p>
    </div>
  );
}
