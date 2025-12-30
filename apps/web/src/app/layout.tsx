import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { logger } from '@/lib/logger';
import WhopClientWrapper from '@/components/layouts/WhopClientWrapper';
import { WhopProvider } from '@/lib/context/whop';
import { ToastProvider } from '@/components/ui/toast';
import { AccessibilityUtils } from '@/lib/accessibility';
import { accessibilityConfig, applyAccessibilityClasses } from '@/lib/accessibilityConfig';

// Premium font pairing: Inter for body, Space Grotesk for headings
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ChurnSaver | Automated Payment Recovery',
  description: 'Recover failed subscription payments automatically with intelligent notifications, personalized outreach, and strategic incentives. Built for Whop businesses.',
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
      className={`${inter.variable} ${spaceGrotesk.variable} ${accessibilityConfig.enabled ? 'accessibility-enabled' : ''}`}
      style={{ background: '#09090b', backgroundColor: '#09090b' }}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {accessibilityConfig.enabled && (
          <meta name="description" content="ChurnSaver - Payment recovery solution with full accessibility support and WCAG 2.1 AA compliance" />
        )}
      </head>
      <body
        className={`
          antialiased
          ${accessibilityConfig.colorContrast.enabled ? 'high-contrast' : ''}
          ${accessibilityConfig.reducedMotion.enabled ? 'reduced-motion' : ''}
        `}
        style={{ background: '#09090b', backgroundColor: '#09090b' }}
      >
        <WhopProvider>
          <ToastProvider>
            <WhopClientWrapper>
              {children}
            </WhopClientWrapper>
          </ToastProvider>
        </WhopProvider>
      </body>
    </html>
  );
}
