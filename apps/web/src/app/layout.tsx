import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { logger } from '@/lib/logger';
import WhopClientWrapper from '@/components/layouts/WhopClientWrapper';
import { WhopProvider } from '@/lib/context/whop';

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
  description: 'Recover lost customers with smart nudges and incentives',
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

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WhopProvider>
          <WhopClientWrapper>{children}</WhopClientWrapper>
        </WhopProvider>
      </body>
    </html>
  );
}
