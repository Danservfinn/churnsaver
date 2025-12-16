'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, getNavHref, isNavActive } from '@/lib/navigation';

export function TopToolbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuId = 'primary-navigation';

  // Extract companyId from URL for dashboard link
  const pathParts = pathname.split('/');
  const dashboardIndex = pathParts.indexOf('dashboard');
  const companyId = dashboardIndex >= 0 && pathParts[dashboardIndex + 1]
    ? pathParts[dashboardIndex + 1]
    : null;

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    const firstLink = mobileMenuRef.current?.querySelector<HTMLAnchorElement>('a');
    firstLink?.focus();

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-bold">CS</span>
            </div>
            <span className="text-lg font-semibold text-foreground">
              ChurnSaver
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const href = getNavHref(item, companyId);
              const isActive = isNavActive(item, pathname, companyId);

              return (
                <Link
                  key={item.href}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }),
                    'gap-2'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            aria-controls={menuId}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <button
              aria-label="Close menu"
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <nav
              id={menuId}
              ref={mobileMenuRef}
              aria-label="Main navigation"
              className="absolute right-0 top-0 h-full w-72 max-w-[90%] border-l border-border bg-card shadow-xl py-6 px-4 space-y-3 focus:outline-none"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-muted-foreground">
                  Navigation
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close menu"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const href = getNavHref(item, companyId);
                const isActive = isNavActive(item, pathname, companyId);

                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }),
                      'w-full justify-start gap-2'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
