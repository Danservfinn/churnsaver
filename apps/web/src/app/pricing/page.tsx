import { getAllCheckoutUrls } from '@/lib/whop-checkout';
import { PricingPageClient } from './PricingPageClient';

export const metadata = {
  title: 'Pricing - ChurnSaver',
  description: 'Simple, transparent pricing for ChurnSaver. Choose the plan that fits your business.',
};

export default function PricingPage() {
  // Get checkout URLs server-side
  const checkoutUrls = getAllCheckoutUrls();

  return <PricingPageClient checkoutUrls={checkoutUrls} />;
}
