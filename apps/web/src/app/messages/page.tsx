import { getWhopCheckoutUrl } from '@/lib/whop-checkout';
import { MessagesPageClient } from './MessagesPageClient';

// Default templates used when no custom templates are configured
const DEFAULT_TEMPLATES = {
  push: {
    immediate: {
      title: 'Payment Issue',
      body: 'We had trouble processing your payment. Update your card to keep your access.',
    },
    day_2: {
      title: 'Payment Reminder',
      body: 'Your payment is still pending. Update your payment method to continue your membership.',
    },
    day_4: {
      title: 'Last Chance',
      body: 'Final reminder: Your access will expire soon. Update your payment now.',
    },
    manual: {
      title: 'Payment Update Needed',
      body: 'Please update your payment method to maintain access.',
    },
  },
  dm: {
    immediate: {
      message: 'Hi! We noticed there was an issue with your payment. Please update your payment method to keep your access: {{billing_url}}',
    },
    day_2: {
      message: 'Hey there! Just a reminder that your payment is still pending. Update your payment method here: {{billing_url}}',
    },
    day_4: {
      message: "This is your last reminder! Your access will expire soon if you don't update your payment: {{billing_url}}",
    },
    manual: {
      message: 'Please update your payment method to continue your membership: {{billing_url}}',
    },
  },
};

export default function MessagesPage() {
  const maxCheckoutUrl = getWhopCheckoutUrl('max', 'monthly');

  return (
    <MessagesPageClient
      defaultTemplates={DEFAULT_TEMPLATES}
      maxCheckoutUrl={maxCheckoutUrl}
    />
  );
}
