import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { logger } from '@/lib/logger';
import WhopClientWrapper from '@/components/layouts/WhopClientWrapper';
import { WhopProvider } from '@/lib/context/whop';
import { AccessibilityUtils } from '@/lib/accessibility';
import { accessibilityConfig, applyAccessibilityClasses } from '@/lib/accessibilityConfig';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Churn Saver',
  description: 'Recover lost customers with smart nudges and incentives - Fully accessible WCAG 2.1 AA compliant application',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Basic iframe token validation placeholder
  // In production, this would validate the x-whop-user-token header
  if (typeof window === 'undefined') {
    // Server-side only - log iframe context
    const userToken =
      process.env.NODE_ENV === 'development'
        ? 'dev-token-placeholder'
        : 'production-validation-needed';

    logger.info('Iframe request detected', {
      hasUserToken: !!userToken,
      env: process.env.NODE_ENV,
    });
  }

  // Apply accessibility classes based on user preferences
  if (typeof window !== 'undefined') {
    applyAccessibilityClasses();
  }

  return (
    <html
      lang="en"
      className={accessibilityConfig.enabled ? 'accessibility-enabled' : ''}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {accessibilityConfig.enabled && (
          <meta name="description" content="Churn Saver - Payment recovery solution with full accessibility support and WCAG 2.1 AA compliance" />
        )}
      </head>
      <body
        className={`
          ${geistSans.variable} ${geistMono.variable} antialiased
          ${accessibilityConfig.colorContrast.enabled ? 'high-contrast' : ''}
          ${accessibilityConfig.reducedMotion.enabled ? 'reduced-motion' : ''}
        `}
      >
        <WhopProvider>
          <WhopClientWrapper>
            {children}
          </WhopClientWrapper>
        </WhopProvider>
      </body>
    </html>
  );
}
