'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, CreditCard, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = { children: React.ReactNode };

// Compact navigation items for embedded context
const EMBED_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/pricing', label: 'Pricing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function WhopAppLayout({ children }: Props) {
  const pathname = usePathname();
  const [isIframe, setIsIframe] = useState(false);

  // Helper to check if a nav item is active
  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname.startsWith('/experiences/');
    }
    return pathname.startsWith(href);
  };

  useEffect(() => {
    const inIframe =
      typeof window !== 'undefined' && window.self !== window.top;

    setIsIframe(inIframe);

    if (!inIframe) return;

    try {
      document.documentElement.style.background = '#09090b';
      document.body.style.background = '#09090b';
      document.body.style.overflow = 'auto';
    } catch {}

    const postSize = () => {
      try {
        const height = document.body.scrollHeight;
        window.parent.postMessage(
          { type: 'whop:app:height', height },
          '*'
        );
      } catch {}
    };

    postSize();

    const ro = new ResizeObserver(() => postSize());
    ro.observe(document.body);
    window.addEventListener('load', postSize);

    return () => {
      try {
        ro.disconnect();
        window.removeEventListener('load', postSize);
      } catch {}
    };
  }, []);

  return (
    <div
      data-whop-app
      style={{
        minHeight: '100vh',
        background: '#09090b',
        backgroundColor: '#09090b',
        color: 'inherit',
      }}
    >
      {/* Compact Navigation Tabs */}
      <nav className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto">
          {EMBED_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Page Content */}
      <div className={isIframe ? 'p-4 sm:p-6 max-w-full' : 'p-4 sm:p-6 lg:p-8'}>
        {children}
      </div>
    </div>
  );
}

export default WhopAppLayout;
