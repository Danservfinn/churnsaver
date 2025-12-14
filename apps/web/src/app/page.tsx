'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, MessageSquare, Gift, TrendingUp, ArrowRight, Settings } from 'lucide-react';
import Link from 'next/link';
import { useWhop } from '@/lib/context/whop';

export default function HomePage() {
  const { companyId } = useWhop();
  const [showSettings, setShowSettings] = useState(false);
  const dashboardHref =
    companyId && companyId !== 'unknown' ? `/dashboard/${companyId}` : '/dashboard';

  const features = [
    {
      icon: Bell,
      title: 'Push Notifications',
      description: 'Automatically notify customers when payments fail, keeping them engaged and informed.',
    },
    {
      icon: MessageSquare,
      title: 'Direct Messages',
      description: 'Send personalized recovery messages directly through your platform.',
    },
    {
      icon: Gift,
      title: 'Smart Incentives',
      description: 'Offer free days automatically to encourage customers to update their payment method.',
    },
    {
      icon: TrendingUp,
      title: 'Analytics & Insights',
      description: 'Track recovery rates, revenue saved, and optimize your strategy with detailed metrics.',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center space-y-6">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
              Stop Churn,{' '}
              <span className="text-primary">Save Revenue</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Automatically recover failed payments with smart notifications, incentives, and personalized outreach. 
              Turn payment failures into successful recoveries.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link href={dashboardHref}>
                <Button size="lg" className="gap-2">
                  View Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowSettings(!showSettings)}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                {showSettings ? 'Hide' : 'Configure'} Settings
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase */}
      <section className="py-16 px-4 bg-muted/50">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Everything You Need
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to maximize recovery rates and minimize manual work
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} className="text-center">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription className="text-sm mt-2">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Settings Preview Section */}
      {showSettings && (
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-3xl">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl mb-2">Quick Settings</CardTitle>
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
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary" />
                      <span className="font-medium">Push Notifications</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enabled by default
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-primary" />
                      <span className="font-medium">Incentives</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      3 days free
                    </p>
                  </div>
                  <div className="space-y-2">
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

      {/* CTA Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <Card className="bg-muted/50">
            <CardContent className="py-12">
              <h2 className="text-2xl font-bold mb-4 text-foreground">
                Ready to <span className="text-primary">Save Revenue</span>?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Start recovering failed payments automatically. No credit card required to get started.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href={dashboardHref}>
                  <Button size="lg" className="gap-2">
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/settings">
                  <Button variant="outline" size="lg">
                    Configure Settings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
