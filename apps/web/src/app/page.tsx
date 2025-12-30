'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  MessageSquare,
  Gift,
  TrendingUp,
  ArrowRight,
  Settings,
  Zap,
  Shield,
  Clock,
  ChevronRight,
  Sparkles,
  BarChart3,
  Users,
  DollarSign,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { useWhop } from '@/lib/context/whop';
import { RecoveryFlowAnimation } from '@/components/landing/RecoveryFlowAnimation';

export default function HomePage() {
  const { companyId } = useWhop();
  const [showSettings, setShowSettings] = useState(false);
  const dashboardHref =
    companyId && companyId !== 'unknown' ? `/dashboard/${companyId}` : '/dashboard';

  // Stats for social proof
  const stats = [
    { value: '97%', label: 'Recovery Rate', icon: TrendingUp },
    { value: '$2.4M+', label: 'Revenue Saved', icon: DollarSign },
    { value: '10K+', label: 'Recoveries', icon: CheckCircle2 },
    { value: '24/7', label: 'Automated', icon: Clock },
  ];

  // Features grouped by category
  const featureGroups = [
    {
      label: 'Intelligent Outreach',
      description: 'Reach customers at the right moment',
      features: [
        {
          icon: Bell,
          title: 'Push Notifications',
          description: 'Instant alerts when payments fail, delivered at optimal times for maximum engagement.',
          highlight: 'Real-time',
        },
        {
          icon: MessageSquare,
          title: 'Direct Messages',
          description: 'Personalized recovery messages with smart templates that convert.',
          highlight: 'Personalized',
        },
      ],
    },
    {
      label: 'Smart Strategy',
      description: 'Data-driven recovery optimization',
      features: [
        {
          icon: Gift,
          title: 'Dynamic Incentives',
          description: 'Automatically offer the right incentive at the right time to maximize recovery.',
          highlight: 'AI-Powered',
        },
        {
          icon: BarChart3,
          title: 'Advanced Analytics',
          description: 'Deep insights into recovery performance with actionable recommendations.',
          highlight: 'Insights',
        },
      ],
    },
  ];

  // Trust indicators
  const trustPoints = [
    { icon: Shield, text: 'Enterprise-grade security' },
    { icon: Zap, text: 'Sub-second response time' },
    { icon: Users, text: 'Whop integration' },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-hero-gradient pointer-events-none" />
      <div className="fixed inset-0 bg-dot-pattern pointer-events-none opacity-50" />

      {/* Hero Section */}
      <section className="relative py-24 md:py-32 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Floating glow effect */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-glow opacity-30 pointer-events-none animate-pulse-glow" />

          <div className="relative text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/20 animate-scale-in">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground/90">
                Automated Payment Recovery
              </span>
            </div>

            {/* Main Heading */}
            <div className="space-y-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground">
                Stop Churn.
                <br />
                <span className="text-gradient">Save Revenue.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Transform failed payments into recovered revenue with intelligent automation.
                Smart notifications, personalized outreach, and strategic incentives—all on autopilot.
              </p>
            </div>

            {/* CTA Buttons */}
            <div
              className="flex flex-col sm:flex-row gap-4 justify-center pt-4 animate-slide-up"
              style={{ animationDelay: '200ms' }}
            >
              <Link href={dashboardHref}>
                <Button size="lg" className="gap-2 px-8 h-12 text-base glow-primary-sm shine-on-hover">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" size="lg" className="gap-2 px-8 h-12 text-base glass">
                  View Pricing
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div
              className="flex flex-wrap items-center justify-center gap-6 pt-8 animate-slide-up"
              style={{ animationDelay: '300ms' }}
            >
              {trustPoints.map((point) => {
                const Icon = point.icon;
                return (
                  <div key={point.text} className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-4 w-4 text-primary/70" />
                    <span className="text-sm">{point.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative py-16 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="card-premium rounded-xl p-6 text-center transition-all duration-300 hover:scale-[1.02] animate-slide-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 mb-3">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-3xl md:text-4xl font-bold text-foreground mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works - Animated Flow */}
      <section className="relative py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              How It Works
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Recovery on Autopilot
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Watch how ChurnSaver automatically transforms failed payments into recovered revenue
            </p>
          </div>
          <RecoveryFlowAnimation />
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 px-4 bg-mesh-gradient">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">
              <Zap className="h-3 w-3 mr-1" />
              Features
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything You Need to
              <span className="text-gradient"> Maximize Recovery</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to maximize recovery rates and minimize manual work
            </p>
          </div>

          <div className="space-y-16">
            {featureGroups.map((group, groupIndex) => (
              <div key={group.label}>
                {/* Group Header */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary uppercase tracking-wider">
                      {group.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      — {group.description}
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                </div>

                {/* Group Features */}
                <div className="grid md:grid-cols-2 gap-6">
                  {group.features.map((feature, featureIndex) => {
                    const Icon = feature.icon;
                    return (
                      <div
                        key={feature.title}
                        className="card-premium rounded-xl p-6 transition-all duration-300 hover:scale-[1.01] group animate-slide-up"
                        style={{ animationDelay: `${(groupIndex * 2 + featureIndex) * 100}ms` }}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                            <Icon className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-semibold text-foreground">
                                {feature.title}
                              </h3>
                              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                                {feature.highlight}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground leading-relaxed">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Settings Preview Section */}
      {showSettings && (
        <section className="relative py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <Card className="card-premium">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl mb-2 flex items-center gap-2">
                      <Settings className="h-5 w-5 text-primary" />
                      Quick Settings
                    </CardTitle>
                    <CardDescription>
                      Configure your recovery strategy. Full settings available in the settings page.
                    </CardDescription>
                  </div>
                  <Link href="/settings">
                    <Button variant="outline" size="sm" className="gap-2">
                      Full Settings
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-2 p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary" />
                      <span className="font-medium">Push Notifications</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enabled by default
                    </p>
                  </div>
                  <div className="space-y-2 p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-primary" />
                      <span className="font-medium">Incentives</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      3 days free
                    </p>
                  </div>
                  <div className="space-y-2 p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      <span className="font-medium">Direct Messages</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enabled by default
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Final CTA Section */}
      <section className="relative py-24 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Background glow */}
          <div className="absolute inset-0 bg-glow opacity-20 pointer-events-none" />

          <div className="relative card-featured rounded-2xl p-12 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              Start Today
            </div>

            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
              Ready to <span className="text-gradient">Save Revenue</span>?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto text-lg">
              Join businesses recovering thousands in lost revenue every month.
              No credit card required to get started.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href={dashboardHref}>
                <Button size="lg" className="gap-2 px-8 h-12 text-base glow-primary-sm">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowSettings(!showSettings)}
                className="gap-2 px-8 h-12 text-base"
              >
                <Settings className="h-4 w-4" />
                {showSettings ? 'Hide' : 'Preview'} Settings
              </Button>
            </div>

            {/* Social proof */}
            <div className="mt-10 pt-8 border-t border-white/10">
              <p className="text-sm text-muted-foreground mb-4">
                Trusted by businesses on Whop
              </p>
              <div className="flex items-center justify-center gap-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground"
                  >
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}
                <span className="text-sm text-muted-foreground ml-2">+50 more</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
