'use client';

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, ArrowRight, Star } from 'lucide-react';
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

interface Feature {
  name: string;
  included: boolean;
  detail?: string;
}

function getTierFeatures(tier: TierName): Feature[] {
  const limits = TIER_LIMITS[tier];

  return [
    {
      name: 'Recoveries per month',
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
  const monthlyPrice = TIER_PRICING[tier].monthly;
  const features = getTierFeatures(tier);
  const isFree = tier === 'free';

  const savings = interval === 'annual' && !isFree
    ? Math.round((1 - TIER_PRICING[tier].annual / (TIER_PRICING[tier].monthly * 12)) * 100)
    : 0;

  return (
    <Card
      className={cn(
        'relative flex flex-col',
        isPopular && 'border-primary ring-2 ring-primary',
        isCurrentTier && 'border-success'
      )}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="gap-1 bg-primary text-primary-foreground">
            <Star className="h-3 w-3 fill-current" />
            Most Popular
          </Badge>
        </div>
      )}

      <CardHeader className="text-center pb-2">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h3 className="text-2xl font-bold">{TIER_DISPLAY_NAMES[tier]}</h3>
          {isCurrentTier && (
            <Badge variant="success">Current</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {TIER_DESCRIPTIONS[tier]}
        </p>
      </CardHeader>

      <CardContent className="flex-1">
        {/* Price */}
        <div className="text-center mb-6">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl font-bold">
              {formatPrice(interval === 'annual' ? Math.round(price / 12) : price)}
            </span>
            <span className="text-muted-foreground">/month</span>
          </div>
          {interval === 'annual' && !isFree && (
            <div className="mt-1 space-y-1">
              <p className="text-sm text-muted-foreground">
                {formatPrice(price)}/year
              </p>
              {savings > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Save {savings}%
                </Badge>
              )}
            </div>
          )}
          {interval === 'monthly' && !isFree && (
            <p className="text-sm text-muted-foreground mt-1">
              billed monthly
            </p>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature.name} className="flex items-start gap-2">
              {feature.included ? (
                <Check className="h-5 w-5 text-success shrink-0 mt-0.5" />
              ) : (
                <X className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div>
                <span className={cn(
                  'text-sm',
                  !feature.included && 'text-muted-foreground'
                )}>
                  {feature.detail ? (
                    <>
                      <span className="font-medium">{feature.detail}</span>
                      {' '}
                      {feature.name.toLowerCase()}
                    </>
                  ) : (
                    feature.name
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="pt-4">
        {isCurrentTier ? (
          <Button variant="outline" className="w-full" disabled>
            Current Plan
          </Button>
        ) : isFree ? (
          <Button variant="outline" className="w-full" disabled>
            Free Forever
          </Button>
        ) : checkoutUrl ? (
          <Button asChild className="w-full gap-2">
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
              Upgrade to {TIER_DISPLAY_NAMES[tier]}
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        ) : (
          <Button className="w-full" disabled>
            Coming Soon
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
