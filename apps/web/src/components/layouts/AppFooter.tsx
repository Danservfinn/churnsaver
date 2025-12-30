'use client';

import Link from 'next/link';
import { Mail, ExternalLink } from 'lucide-react';

export function AppFooter() {
  const currentYear = new Date().getFullYear();

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'Settings', href: '/settings' },
  ];

  const resources = [
    { name: 'Messages', href: '/messages' },
    { name: 'Support', href: 'mailto:support@churnsaver.com' },
  ];

  return (
    <footer className="relative border-t border-white/5 bg-background/50 backdrop-blur-sm">
      {/* Gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <span className="text-sm font-bold">CS</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground tracking-tight">
                  ChurnSaver
                </h3>
                <p className="text-xs text-muted-foreground">
                  Payment Recovery Automation
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Automatically recover failed payments with intelligent notifications,
              personalized outreach, and strategic incentives. Built for Whop businesses.
            </p>
          </div>

          {/* Navigation Links */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">
              Navigation
            </h4>
            <ul className="space-y-3">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">
              Resources
            </h4>
            <ul className="space-y-3">
              {resources.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200 inline-flex items-center gap-1"
                  >
                    {item.name}
                    {item.href.startsWith('mailto:') && (
                      <Mail className="h-3 w-3" />
                    )}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="https://whop.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-200 inline-flex items-center gap-1"
                >
                  Whop Platform
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {currentYear} ChurnSaver. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="/privacy"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
