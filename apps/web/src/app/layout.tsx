import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { WhopClientWrapper } from '@/components/layouts/WhopClientWrapper';
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
  return (
    <html lang="en" suppressHydrationWarning>
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
