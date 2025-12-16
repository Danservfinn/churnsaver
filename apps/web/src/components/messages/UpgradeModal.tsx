'use client';

import { X, Zap, MessageSquare, Users, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutUrl: string | null;
}

export function UpgradeModal({ isOpen, onClose, checkoutUrl }: UpgradeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Upgrade to Max
              </h2>
              <p className="text-sm text-muted-foreground">
                Unlock custom message templates
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="text-muted-foreground mb-6">
            Custom message templates are a Max plan feature. Personalize your recovery messages to match your brand voice and increase conversions.
          </p>

          {/* Features */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <span className="text-foreground">Customize all message templates</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <span className="text-foreground">Unlimited recoveries per month</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <span className="text-foreground">Priority support</span>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-3xl font-bold text-foreground">$99</span>
            <span className="text-muted-foreground">/month</span>
          </div>

          {/* CTA */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Maybe Later
            </Button>
            {checkoutUrl ? (
              <Button
                className="flex-1"
                onClick={() => window.open(checkoutUrl, '_blank')}
              >
                Upgrade Now
              </Button>
            ) : (
              <Button className="flex-1" disabled>
                Coming Soon
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
