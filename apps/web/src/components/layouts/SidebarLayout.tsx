'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Overlay */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setMobileOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'flex-shrink-0 z-50',
          isMobile && 'fixed inset-y-0 left-0 transform transition-transform duration-200',
          isMobile && !mobileOpen && '-translate-x-full'
        )}
      >
        <Sidebar collapsed={!isMobile && collapsed} onToggle={handleToggle} />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile Header */}
        {isMobile && (
          <div className="flex items-center h-16 px-4 border-b border-border bg-card">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Open sidebar"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <span className="ml-4 font-semibold text-foreground">ChurnSaver</span>
          </div>
        )}

        {/* Page Content */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

export default SidebarLayout;










