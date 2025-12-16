'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutDashboard, CreditCard, Settings } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Extract companyId from URL for dashboard link
  const pathParts = pathname.split('/');
  const dashboardIndex = pathParts.indexOf('dashboard');
  const urlCompanyId = dashboardIndex >= 0 && pathParts[dashboardIndex + 1]
    ? pathParts[dashboardIndex + 1]
    : null;
  const basePath = urlCompanyId ? `/dashboard/${urlCompanyId}` : '/dashboard';

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: basePath, label: 'Dashboard', icon: LayoutDashboard },
    { href: '/pricing', label: 'Pricing', icon: CreditCard },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === basePath) return pathname === basePath || pathname.startsWith('/dashboard');
    return pathname.startsWith(href);
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setCollapsed(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleToggle = () => {
    setCollapsed(!collapsed);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#09090b' }}>
      {/* Sidebar - hidden on mobile, shown on desktop */}
      {!isMobile && (
        <div className="flex-shrink-0 z-50">
          <Sidebar collapsed={collapsed} onToggle={handleToggle} />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto" style={{ background: '#09090b' }}>
        {/* Mobile Header with Navigation */}
        {isMobile && (
          <div className="border-b border-gray-700" style={{ background: 'rgba(31, 31, 35, 0.8)' }}>
            <div className="flex items-center justify-between h-14 px-4">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-foreground font-bold text-xs">
                  CS
                </div>
                <span className="font-semibold text-foreground text-sm">ChurnSaver</span>
              </Link>
            </div>
            <nav className="flex items-center gap-1 px-2 pb-2 overflow-x-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Page Content */}
        <div className="p-6" style={{ background: '#09090b' }}>{children}</div>
      </main>
    </div>
  );
}

export default SidebarLayout;










