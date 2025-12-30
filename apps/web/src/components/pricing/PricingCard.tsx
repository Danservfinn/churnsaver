'use client';

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, ArrowRight, Star, Sparkles, Zap } from 'lucide-react';
import { TierName, BillingInterval, TIER_LIMITS, TIER_PRICING } from '@/lib/tiers';
import { cn } from '@/lib/utils';

interface PricingCardProps {
  tier: TierName;
  interval: BillingInterval;
  checkoutUrl: string | null;
  isCurrentTier?: boolean;
  isPopular?: boolean;
}

const TIER_DISPLAY_NAMES: Record<TierName, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
};

const TIER_DESCRIPTIONS: Record<TierName, string> = {
  free: 'Get started with basic recovery features',
  pro: 'For growing businesses with more recoveries',
  max: 'Unlimited power for high-volume businesses',
};

const TIER_ICONS: Record<TierName, typeof Zap> = {
  free: Zap,
  pro: Star,
  max: Sparkles,
};

interface Feature {
  name: string;
  included: boolean;
  detail?: string;
}

function getTierFeatures(tier: TierName): Feature[] {
  const limits = TIER_LIMITS[tier];

  return [
    {
      name: 'recoveries per month',
      included: true,
      detail: limits.recoveriesPerMonth === Infinity
        ? 'Unlimited'
        : `${limits.recoveriesPerMonth}`,
    },
    {
      name: '365-day analytics',
      included: limits.basicAnalytics,
    },
    {
      name: 'Custom templates',
      included: limits.customTemplates,
      detail: limits.customTemplates ? `Up to ${limits.maxTemplatesPerChannel} per channel` : undefined,
    },
    {
      name: 'CSV export',
      included: limits.csvExport,
    },
    {
      name: 'Priority support',
      included: limits.prioritySupport,
    },
  ];
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function PricingCard({
  tier,
  interval,
  checkoutUrl,
  isCurrentTier = false,
  isPopular = false,
}: PricingCardProps) {
  const price = TIER_PRICING[tier][interval];
  const features = getTierFeatures(tier);
  const isFree = tier === 'free';
  const TierIcon = TIER_ICONS[tier];

  const savings = interval === 'annual' && !isFree
    ? Math.round((1 - TIER_PRICING[tier].annual / (TIER_PRICING[tier].monthly * 12)) * 100)
    : 0;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl transition-all duration-300 hover:scale-[1.02]',
        isPopular ? 'card-featured' : 'card-premium',
        isCurrentTier && 'ring-2 ring-success/50'
      )}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <Badge className="gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 text-sm font-semibold shadow-lg shadow-primary/30">
            <Star className="h-3.5 w-3.5 fill-current" />
            Most Popular
          </Badge>
        </div>
      )}

      {/* Glow effect for popular tier */}
      {isPopular && (
        <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-pulse-glow pointer-events-none" />
      )}

      <div className="relative p-8 flex flex-col flex-1">
        {/* Header */}
        <div className="text-center mb-8">
          {/* Tier Icon */}
          <div className={cn(
            'inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4',
            isPopular ? 'bg-primary/20' : 'bg-muted'
          )}>
            <TierIcon className={cn(
              'h-7 w-7',
              isPopular ? 'text-primary' : 'text-muted-foreground'
            )} />
          </div>

          {/* Tier Name */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <h3 className={cn(
              'text-2xl font-bold',
              isPopular && 'text-gradient'
            )}>
              {TIER_DISPLAY_NAMES[tier]}
            </h3>
            {isCurrentTier && (
              <Badge variant="outline" className="border-success/50 text-success">
                Current
              </Badge>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground">
            {TIER_DESCRIPTIONS[tier]}
          </p>
        </div>

        {/* Price */}
        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center gap-1">
            <span className={cn(
              'text-5xl font-bold tracking-tight',
              isPopular && 'text-gradient'
            )}>
              {formatPrice(interval === 'annual' ? Math.round(price / 12) : price)}
            </span>
            <span className="text-muted-foreground text-lg">/month</span>
          </div>
          {interval === 'annual' && !isFree && (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-muted-foreground">
                {formatPrice(price)}/year billed annually
              </p>
              {savings > 0 && (
                <Badge variant="secondary" className="text-xs bg-success/10 text-success border-success/20">
                  Save {savings}% annually
                </Badge>
              )}
            </div>
          )}
          {interval === 'monthly' && !isFree && (
            <p className="text-sm text-muted-foreground mt-2">
              billed monthly
            </p>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-4 flex-1">
          {features.map((feature) => (
            <li key={feature.name} className="flex items-start gap-3">
              <div className={cn(
                'flex items-center justify-center w-5 h-5 rounded-full shrink-0 mt-0.5',
                feature.included
                  ? 'bg-success/20'
                  : 'bg-muted'
              )}>
                {feature.included ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
              <span className={cn(
                'text-sm leading-relaxed',
                !feature.included && 'text-muted-foreground'
              )}>
                {feature.detail ? (
                  <>
                    <span className="font-semibold">{feature.detail}</span>
                    {' '}
                    {feature.name}
                  </>
                ) : (
                  feature.name
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA Button */}
        <div className="mt-8 pt-6 border-t border-white/5">
          {isCurrentTier ? (
            <Button variant="outline" className="w-full h-12" disabled>
              Current Plan
            </Button>
          ) : isFree ? (
            <Button variant="outline" className="w-full h-12" disabled>
              Free Forever
            </Button>
          ) : checkoutUrl ? (
            <Button
              asChild
              className={cn(
                'w-full h-12 gap-2 font-semibold',
                isPopular && 'glow-primary-sm'
              )}
            >
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                Upgrade to {TIER_DISPLAY_NAMES[tier]}
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <Button className="w-full h-12" disabled>
              Coming Soon
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
