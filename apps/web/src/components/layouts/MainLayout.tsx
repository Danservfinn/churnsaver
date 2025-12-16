'use client';

import { TopToolbar } from './TopToolbar';
import { AppFooter } from './AppFooter';
import { ToastProvider } from '@/components/ui/toast';

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col" style={{ background: '#09090b' }}>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <TopToolbar />
        <main id="main-content" className="flex-1 overflow-auto">
          {children}
        </main>
        <AppFooter />
      </div>
    </ToastProvider>
  );
}
