import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service - ChurnSaver',
  description: 'Terms and conditions for using ChurnSaver payment recovery service.',
};

export default function TermsPage() {
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
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Terms of Service</h1>
          <p className="text-muted-foreground">Last Updated: December 2024</p>
        </div>

        {/* Content Sections */}
        <div className="prose prose-invert prose-zinc max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Agreement to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using ChurnSaver (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you disagree with any part of these terms, you may not access the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              ChurnSaver is an automated payment recovery application for Whop marketplace creators. The Service helps you recover failed payments by creating recovery cases, sending reminders, and tracking recovery outcomes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Eligibility</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">You must:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Be at least 18 years of age</li>
              <li>Have a valid Whop marketplace account</li>
              <li>Have the authority to bind your company to these Terms</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Account and Access</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Account:</strong> Your access is managed through your Whop account</li>
              <li><strong className="text-foreground">Security:</strong> You are responsible for maintaining the security of your account</li>
              <li><strong className="text-foreground">Unauthorized Access:</strong> Notify us immediately of any unauthorized access</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Service Availability</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Uptime:</strong> We strive for 99.9% uptime but do not guarantee uninterrupted service</li>
              <li><strong className="text-foreground">Maintenance:</strong> We may perform scheduled maintenance with advance notice</li>
              <li><strong className="text-foreground">Modifications:</strong> We reserve the right to modify or discontinue the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Payment and Billing</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Subscription:</strong> The Service operates on a subscription model</li>
              <li><strong className="text-foreground">Billing:</strong> Billing is handled through Whop marketplace</li>
              <li><strong className="text-foreground">Refunds:</strong> Refund policies are governed by Whop marketplace terms</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Use the Service for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to the Service</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Use the Service to violate any third-party rights</li>
              <li>Reverse engineer or attempt to extract source code</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Data and Privacy</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Your Data:</strong> You retain ownership of your data</li>
              <li><strong className="text-foreground">Privacy:</strong> Our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> governs data collection and use</li>
              <li><strong className="text-foreground">Backup:</strong> You are responsible for maintaining backups of your data</li>
              <li><strong className="text-foreground">Data Loss:</strong> We are not liable for data loss except due to gross negligence</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Intellectual Property</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Service:</strong> All rights in the Service remain with us</li>
              <li><strong className="text-foreground">Your Content:</strong> You retain rights to your content and data</li>
              <li><strong className="text-foreground">License:</strong> We grant you a limited, non-exclusive license to use the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed mb-4 uppercase font-medium">
              To the maximum extent permitted by law:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">No Warranty:</strong> The Service is provided &ldquo;as is&rdquo; without warranties</li>
              <li><strong className="text-foreground">Limitation:</strong> We are not liable for indirect, incidental, or consequential damages</li>
              <li><strong className="text-foreground">Maximum Liability:</strong> Our total liability is limited to the amount you paid in the past 12 months</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You agree to indemnify and hold us harmless from any claims, damages, or expenses arising from:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Termination</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">By You:</strong> You may stop using the Service at any time</li>
              <li><strong className="text-foreground">By Us:</strong> We may terminate or suspend your access for violations of these Terms</li>
              <li><strong className="text-foreground">Effect:</strong> Upon termination, your right to use the Service ceases immediately</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Dispute Resolution</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Governing Law:</strong> These Terms are governed by the laws of the State of Delaware, United States</li>
              <li><strong className="text-foreground">Arbitration:</strong> Disputes will be resolved through binding arbitration</li>
              <li><strong className="text-foreground">Class Action Waiver:</strong> You waive the right to participate in class actions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify you of material changes. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Severability</h2>
            <p className="text-muted-foreground leading-relaxed">
              If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Entire Agreement</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms, together with our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, constitute the entire agreement between you and us regarding the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              For questions about these Terms, please contact us through:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Whop App Dashboard:</strong> Support section within the app</li>
              <li><strong className="text-foreground">Email:</strong> <a href="mailto:support@churnsaver.com" className="text-primary hover:underline">support@churnsaver.com</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Acknowledgment</h2>
            <p className="text-muted-foreground leading-relaxed">
              By using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
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
