import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy - ChurnSaver',
  description: 'Learn how ChurnSaver collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-white/5 bg-background/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Title */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground">Last Updated: December 2024</p>
        </div>

        {/* Content Sections */}
        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              ChurnSaver (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application on the Whop marketplace.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Information We Collect</h2>

            <h3 className="text-lg font-medium mt-6 mb-3 text-foreground">Data Received from Whop</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Company Information:</strong> Company ID and business details</li>
              <li><strong className="text-foreground">User Information:</strong> User IDs and membership data</li>
              <li><strong className="text-foreground">Payment Data:</strong> Payment status, failure reasons, and recovery outcomes</li>
              <li><strong className="text-foreground">Membership Data:</strong> Membership status, activation/deactivation events</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3 text-foreground">Data We Generate</h3>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Recovery Cases:</strong> Case records created from payment failures</li>
              <li><strong className="text-foreground">Analytics Data:</strong> Aggregated recovery metrics and KPIs</li>
              <li><strong className="text-foreground">Settings:</strong> Your configured reminder schedules and preferences</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Process Recovery Cases:</strong> Create and manage recovery cases for failed payments</li>
              <li><strong className="text-foreground">Send Reminders:</strong> Deliver automated reminders to help recover failed payments</li>
              <li><strong className="text-foreground">Provide Analytics:</strong> Generate recovery metrics and insights for your dashboard</li>
              <li><strong className="text-foreground">Improve Service:</strong> Analyze usage patterns to enhance our service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Data Storage and Security</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Encryption:</strong> All sensitive data is encrypted at rest using AES-256-GCM</li>
              <li><strong className="text-foreground">Tenant Isolation:</strong> Row-Level Security (RLS) ensures complete data isolation between companies</li>
              <li><strong className="text-foreground">Access Control:</strong> Only authenticated users from your company can access your data</li>
              <li><strong className="text-foreground">Secure Transmission:</strong> All data transmission uses TLS 1.3 encryption</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Data Retention</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Recovery Cases:</strong> Retained for the duration of your subscription</li>
              <li><strong className="text-foreground">Event Data:</strong> Stored for processing and analytics purposes</li>
              <li><strong className="text-foreground">Analytics:</strong> Aggregated metrics retained for historical analysis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Data Sharing</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We do not sell, trade, or rent your personal information to third parties. We only share data:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">With Whop:</strong> As required for marketplace integration and webhook processing</li>
              <li><strong className="text-foreground">For Legal Compliance:</strong> When required by law or legal process</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Access:</strong> Request access to your personal data</li>
              <li><strong className="text-foreground">Correction:</strong> Request correction of inaccurate data</li>
              <li><strong className="text-foreground">Deletion:</strong> Request deletion of your data (subject to retention requirements)</li>
              <li><strong className="text-foreground">Export:</strong> Request export of your data in a portable format</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">We use the following third-party services:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Vercel:</strong> Application hosting and serverless functions</li>
              <li><strong className="text-foreground">Supabase:</strong> Database hosting and data storage</li>
              <li><strong className="text-foreground">Whop:</strong> Marketplace integration and authentication</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Children&apos;s Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our service is not intended for users under 18 years of age. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &ldquo;Last Updated&rdquo; date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If you have questions about this Privacy Policy, please contact us through:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Whop App Dashboard:</strong> Support section within the app</li>
              <li><strong className="text-foreground">Email:</strong> <a href="mailto:support@churnsaver.com" className="text-primary hover:underline">support@churnsaver.com</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Compliance</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">This Privacy Policy complies with:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>General Data Protection Regulation (GDPR)</li>
              <li>California Consumer Privacy Act (CCPA)</li>
              <li>Whop Marketplace Privacy Requirements</li>
            </ul>
          </section>
        </div>

        {/* Back link */}
        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
