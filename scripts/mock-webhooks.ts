/**
 * ChurnSaver Mock Webhook Generator
 *
 * Generates realistic Whop webhook payloads for testing the webhook endpoint.
 * Includes signature generation for authenticated testing.
 *
 * Usage:
 *   pnpm tsx scripts/mock-webhooks.ts --type=payment_failed --count=10
 *   pnpm tsx scripts/mock-webhooks.ts --scenario=full_recovery_cycle
 *   pnpm tsx scripts/mock-webhooks.ts --fire --url=http://localhost:3000/api/webhooks/whop
 */

import { createHmac, randomUUID } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

type WebhookEventType =
  | 'payment_failed'
  | 'payment_succeeded'
  | 'membership_went_invalid'
  | 'membership_went_valid'
  | 'payment_pending'
  | 'invoice_past_due';

interface WebhookPayload {
  event_id: string;
  type: WebhookEventType;
  created_at: string;
  data: Record<string, unknown>;
}

interface SignedWebhook {
  payload: WebhookPayload;
  signature: string;
  timestamp: number;
}

interface WebhookScenario {
  name: string;
  description: string;
  webhooks: WebhookPayload[];
  delays: number[]; // delays in seconds between webhooks
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'test_webhook_secret_12345';

const FAILURE_REASONS = [
  { code: 'card_declined', message: 'Your card was declined.' },
  { code: 'insufficient_funds', message: 'Your card has insufficient funds.' },
  { code: 'expired_card', message: 'Your card has expired.' },
  { code: 'processing_error', message: 'An error occurred while processing your payment.' },
  { code: 'fraud_suspected', message: 'This transaction was flagged as potentially fraudulent.' },
  { code: 'authentication_required', message: '3D Secure authentication required.' },
  { code: 'do_not_honor', message: 'The card issuer declined this transaction.' },
  { code: 'invalid_card', message: 'The card number is invalid.' },
];

// ============================================================================
// HELPERS
// ============================================================================

function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 12)}`;
}

function generateSignature(payload: string, secret: string, timestamp: number): string {
  const signaturePayload = `${timestamp}.${payload}`;
  return createHmac('sha256', secret).update(signaturePayload).digest('hex');
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// WEBHOOK GENERATORS
// ============================================================================

function generatePaymentFailedWebhook(options: {
  membershipId?: string;
  userId?: string;
  companyId?: string;
  amountCents?: number;
  failureReason?: string;
}): WebhookPayload {
  const failureInfo = randomElement(FAILURE_REASONS);

  return {
    event_id: generateId('evt'),
    type: 'payment_failed',
    created_at: new Date().toISOString(),
    data: {
      membership_id: options.membershipId || generateId('mem'),
      user_id: options.userId || generateId('user'),
      company_id: options.companyId || generateId('company'),
      product_id: generateId('prod'),
      plan_id: generateId('plan'),
      amount_cents: options.amountCents || Math.floor(Math.random() * 10000) + 999,
      currency: 'usd',
      failure_reason: options.failureReason || failureInfo.code,
      failure_message: failureInfo.message,
      attempt_count: Math.floor(Math.random() * 3) + 1,
      next_retry_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      invoice_id: generateId('inv'),
      payment_method: {
        type: 'card',
        last_four: String(Math.floor(Math.random() * 10000)).padStart(4, '0'),
        brand: randomElement(['visa', 'mastercard', 'amex', 'discover']),
        exp_month: Math.floor(Math.random() * 12) + 1,
        exp_year: new Date().getFullYear() + Math.floor(Math.random() * 5),
      },
    },
  };
}

function generatePaymentSucceededWebhook(options: {
  membershipId?: string;
  userId?: string;
  companyId?: string;
  amountCents?: number;
  wasRecovery?: boolean;
}): WebhookPayload {
  return {
    event_id: generateId('evt'),
    type: 'payment_succeeded',
    created_at: new Date().toISOString(),
    data: {
      membership_id: options.membershipId || generateId('mem'),
      user_id: options.userId || generateId('user'),
      company_id: options.companyId || generateId('company'),
      product_id: generateId('prod'),
      plan_id: generateId('plan'),
      amount_cents: options.amountCents || Math.floor(Math.random() * 10000) + 999,
      currency: 'usd',
      invoice_id: generateId('inv'),
      payment_method: {
        type: 'card',
        last_four: String(Math.floor(Math.random() * 10000)).padStart(4, '0'),
        brand: randomElement(['visa', 'mastercard', 'amex']),
      },
      was_recovery: options.wasRecovery || false,
      previous_failure: options.wasRecovery || false,
    },
  };
}

function generateMembershipWentInvalidWebhook(options: {
  membershipId?: string;
  userId?: string;
  companyId?: string;
  reason?: string;
}): WebhookPayload {
  return {
    event_id: generateId('evt'),
    type: 'membership_went_invalid',
    created_at: new Date().toISOString(),
    data: {
      membership_id: options.membershipId || generateId('mem'),
      user_id: options.userId || generateId('user'),
      company_id: options.companyId || generateId('company'),
      product_id: generateId('prod'),
      reason: options.reason || 'payment_failed',
      previous_status: 'active',
      new_status: 'past_due',
    },
  };
}

function generateMembershipWentValidWebhook(options: {
  membershipId?: string;
  userId?: string;
  companyId?: string;
}): WebhookPayload {
  return {
    event_id: generateId('evt'),
    type: 'membership_went_valid',
    created_at: new Date().toISOString(),
    data: {
      membership_id: options.membershipId || generateId('mem'),
      user_id: options.userId || generateId('user'),
      company_id: options.companyId || generateId('company'),
      product_id: generateId('prod'),
      reason: 'payment_succeeded',
      previous_status: 'past_due',
      new_status: 'active',
    },
  };
}

function generatePaymentPendingWebhook(options: {
  membershipId?: string;
  userId?: string;
  companyId?: string;
  amountCents?: number;
}): WebhookPayload {
  return {
    event_id: generateId('evt'),
    type: 'payment_pending',
    created_at: new Date().toISOString(),
    data: {
      membership_id: options.membershipId || generateId('mem'),
      user_id: options.userId || generateId('user'),
      company_id: options.companyId || generateId('company'),
      amount_cents: options.amountCents || Math.floor(Math.random() * 10000) + 999,
      currency: 'usd',
      invoice_id: generateId('inv'),
      expected_completion_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

function generateInvoicePastDueWebhook(options: {
  membershipId?: string;
  userId?: string;
  companyId?: string;
  amountCents?: number;
  daysPastDue?: number;
}): WebhookPayload {
  return {
    event_id: generateId('evt'),
    type: 'invoice_past_due',
    created_at: new Date().toISOString(),
    data: {
      membership_id: options.membershipId || generateId('mem'),
      user_id: options.userId || generateId('user'),
      company_id: options.companyId || generateId('company'),
      invoice_id: generateId('inv'),
      amount_cents: options.amountCents || Math.floor(Math.random() * 10000) + 999,
      currency: 'usd',
      days_past_due: options.daysPastDue || Math.floor(Math.random() * 14) + 1,
      due_date: new Date(Date.now() - (options.daysPastDue || 7) * 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

// ============================================================================
// WEBHOOK TYPE GENERATOR
// ============================================================================

function generateWebhook(type: WebhookEventType, options: Record<string, unknown> = {}): WebhookPayload {
  switch (type) {
    case 'payment_failed':
      return generatePaymentFailedWebhook(options);
    case 'payment_succeeded':
      return generatePaymentSucceededWebhook(options);
    case 'membership_went_invalid':
      return generateMembershipWentInvalidWebhook(options);
    case 'membership_went_valid':
      return generateMembershipWentValidWebhook(options);
    case 'payment_pending':
      return generatePaymentPendingWebhook(options);
    case 'invoice_past_due':
      return generateInvoicePastDueWebhook(options);
    default:
      throw new Error(`Unknown webhook type: ${type}`);
  }
}

// ============================================================================
// SCENARIO GENERATORS
// ============================================================================

function generateFullRecoveryCycleScenario(): WebhookScenario {
  const membershipId = generateId('mem');
  const userId = generateId('user');
  const companyId = generateId('company');
  const amountCents = 4999;

  return {
    name: 'Full Recovery Cycle',
    description: 'Payment fails, membership goes invalid, payment succeeds, membership goes valid',
    webhooks: [
      generatePaymentFailedWebhook({ membershipId, userId, companyId, amountCents }),
      generateMembershipWentInvalidWebhook({ membershipId, userId, companyId }),
      generatePaymentSucceededWebhook({ membershipId, userId, companyId, amountCents, wasRecovery: true }),
      generateMembershipWentValidWebhook({ membershipId, userId, companyId }),
    ],
    delays: [0, 1, 172800, 1], // 0s, 1s, 48h, 1s
  };
}

function generateFailedRecoveryScenario(): WebhookScenario {
  const membershipId = generateId('mem');
  const userId = generateId('user');
  const companyId = generateId('company');

  return {
    name: 'Failed Recovery (Auto-Cancel)',
    description: 'Payment fails, multiple retries fail, membership remains invalid past 14 days',
    webhooks: [
      generatePaymentFailedWebhook({ membershipId, userId, companyId, failureReason: 'card_declined' }),
      generateMembershipWentInvalidWebhook({ membershipId, userId, companyId }),
      generatePaymentFailedWebhook({ membershipId, userId, companyId, failureReason: 'card_declined' }),
      generatePaymentFailedWebhook({ membershipId, userId, companyId, failureReason: 'insufficient_funds' }),
      generateInvoicePastDueWebhook({ membershipId, userId, companyId, daysPastDue: 14 }),
    ],
    delays: [0, 1, 172800, 172800, 604800], // 0s, 1s, 2 days, 2 days, 7 days
  };
}

function generateDuplicateEventScenario(): WebhookScenario {
  const webhook = generatePaymentFailedWebhook({});
  const duplicateWebhook = { ...webhook }; // Same event_id

  return {
    name: 'Duplicate Event Handling',
    description: 'Same webhook sent twice - should only process once',
    webhooks: [webhook, duplicateWebhook],
    delays: [0, 0.1], // 100ms apart
  };
}

function generateRapidFireScenario(): WebhookScenario {
  const membershipId = generateId('mem');
  const userId = generateId('user');
  const companyId = generateId('company');

  const webhooks: WebhookPayload[] = [];
  for (let i = 0; i < 10; i++) {
    webhooks.push(
      generatePaymentFailedWebhook({
        membershipId: i % 3 === 0 ? membershipId : generateId('mem'),
        userId: i % 3 === 0 ? userId : generateId('user'),
        companyId,
      })
    );
  }

  return {
    name: 'Rapid Fire Events',
    description: '10 payment failures in quick succession',
    webhooks,
    delays: new Array(10).fill(0.1), // 100ms between each
  };
}

function generateMultiCompanyScenario(): WebhookScenario {
  const companies = [generateId('company'), generateId('company'), generateId('company')];

  return {
    name: 'Multi-Company Events',
    description: 'Events from 3 different companies interleaved',
    webhooks: [
      generatePaymentFailedWebhook({ companyId: companies[0] }),
      generatePaymentFailedWebhook({ companyId: companies[1] }),
      generatePaymentFailedWebhook({ companyId: companies[2] }),
      generatePaymentSucceededWebhook({ companyId: companies[0], wasRecovery: true }),
      generatePaymentFailedWebhook({ companyId: companies[1] }),
      generatePaymentSucceededWebhook({ companyId: companies[2], wasRecovery: true }),
    ],
    delays: [0, 0.5, 0.5, 3600, 1800, 7200], // Mix of timing
  };
}

function generateEdgeCaseScenarios(): WebhookScenario {
  return {
    name: 'Edge Cases Collection',
    description: 'Various edge cases for testing',
    webhooks: [
      // $0 amount
      generatePaymentFailedWebhook({ amountCents: 0 }),
      // Very large amount
      generatePaymentFailedWebhook({ amountCents: 999999999 }),
      // Success without prior failure
      generatePaymentSucceededWebhook({ wasRecovery: false }),
      // Valid without prior invalid
      generateMembershipWentValidWebhook({}),
      // Pending payment
      generatePaymentPendingWebhook({}),
      // Very old past due
      generateInvoicePastDueWebhook({ daysPastDue: 90 }),
    ],
    delays: [0, 1, 1, 1, 1, 1],
  };
}

// ============================================================================
// SIGNATURE GENERATION
// ============================================================================

function signWebhook(payload: WebhookPayload, secret: string = DEFAULT_WEBHOOK_SECRET): SignedWebhook {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, secret, timestamp);

  return {
    payload,
    signature: `t=${timestamp},v1=${signature}`,
    timestamp,
  };
}

// ============================================================================
// WEBHOOK FIRING
// ============================================================================

async function fireWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string = DEFAULT_WEBHOOK_SECRET
): Promise<{ status: number; body: string }> {
  const { signature } = signWebhook(payload, secret);
  const body = JSON.stringify(payload);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Whop-Signature': signature,
      'X-Whop-Event-Type': payload.type,
    },
    body,
  });

  const responseBody = await response.text();
  return { status: response.status, body: responseBody };
}

async function fireScenario(
  url: string,
  scenario: WebhookScenario,
  secret: string = DEFAULT_WEBHOOK_SECRET,
  verbose: boolean = false
): Promise<void> {
  console.log(`\n🚀 Running Scenario: ${scenario.name}`);
  console.log(`   ${scenario.description}`);
  console.log(`   Webhooks: ${scenario.webhooks.length}`);
  console.log('');

  for (let i = 0; i < scenario.webhooks.length; i++) {
    const webhook = scenario.webhooks[i];
    const delay = scenario.delays[i] || 0;

    if (delay > 0 && i > 0) {
      if (verbose) console.log(`   ⏳ Waiting ${delay}s...`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    console.log(`   [${i + 1}/${scenario.webhooks.length}] Firing ${webhook.type}...`);

    try {
      const result = await fireWebhook(url, webhook, secret);
      console.log(`       Status: ${result.status} ${result.status === 200 ? '✅' : '❌'}`);
      if (verbose && result.body) {
        console.log(`       Response: ${result.body.slice(0, 100)}...`);
      }
    } catch (error) {
      console.log(`       Error: ${error instanceof Error ? error.message : 'Unknown error'} ❌`);
    }
  }

  console.log(`\n✅ Scenario complete: ${scenario.name}`);
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const type = args.find(a => a.startsWith('--type='))?.split('=')[1] as WebhookEventType | undefined;
  const count = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '1', 10);
  const scenario = args.find(a => a.startsWith('--scenario='))?.split('=')[1];
  const fire = args.includes('--fire');
  const url = args.find(a => a.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000/api/webhooks/whop';
  const secret = args.find(a => a.startsWith('--secret='))?.split('=')[1] || DEFAULT_WEBHOOK_SECRET;
  const signed = args.includes('--signed');
  const listScenarios = args.includes('--list-scenarios');
  const verbose = args.includes('--verbose');

  console.log('🎯 ChurnSaver Mock Webhook Generator');
  console.log('=====================================\n');

  // List available scenarios
  if (listScenarios) {
    console.log('Available Scenarios:');
    console.log('  --scenario=full_recovery_cycle     - Complete recovery flow');
    console.log('  --scenario=failed_recovery         - Failed recovery with auto-cancel');
    console.log('  --scenario=duplicate_event         - Idempotency testing');
    console.log('  --scenario=rapid_fire              - 10 events in quick succession');
    console.log('  --scenario=multi_company           - Events from 3 companies');
    console.log('  --scenario=edge_cases              - Various edge cases');
    console.log('  --scenario=all                     - Run all scenarios');
    return;
  }

  // Scenario mode
  if (scenario) {
    const scenarios: Record<string, () => WebhookScenario> = {
      full_recovery_cycle: generateFullRecoveryCycleScenario,
      failed_recovery: generateFailedRecoveryScenario,
      duplicate_event: generateDuplicateEventScenario,
      rapid_fire: generateRapidFireScenario,
      multi_company: generateMultiCompanyScenario,
      edge_cases: generateEdgeCaseScenarios,
    };

    if (scenario === 'all') {
      for (const [name, generator] of Object.entries(scenarios)) {
        const webhookScenario = generator();
        if (fire) {
          await fireScenario(url, webhookScenario, secret, verbose);
        } else {
          console.log(`\n📋 Scenario: ${webhookScenario.name}`);
          console.log(`   Description: ${webhookScenario.description}`);
          console.log(`   Webhooks: ${webhookScenario.webhooks.length}`);
          webhookScenario.webhooks.forEach((wh, i) => {
            console.log(`     ${i + 1}. ${wh.type} (delay: ${webhookScenario.delays[i]}s)`);
          });
        }
      }
    } else if (scenarios[scenario]) {
      const webhookScenario = scenarios[scenario]();
      if (fire) {
        await fireScenario(url, webhookScenario, secret, verbose);
      } else {
        console.log(JSON.stringify(webhookScenario, null, 2));
      }
    } else {
      console.error(`Unknown scenario: ${scenario}`);
      console.log('Use --list-scenarios to see available options');
      process.exit(1);
    }
    return;
  }

  // Single webhook generation mode
  if (type) {
    const webhooks: WebhookPayload[] = [];
    for (let i = 0; i < count; i++) {
      webhooks.push(generateWebhook(type));
    }

    if (fire) {
      console.log(`🔫 Firing ${count} ${type} webhook(s) to ${url}...\n`);
      for (let i = 0; i < webhooks.length; i++) {
        console.log(`[${i + 1}/${count}] Firing webhook...`);
        const result = await fireWebhook(url, webhooks[i], secret);
        console.log(`   Status: ${result.status} ${result.status === 200 ? '✅' : '❌'}`);
        if (verbose) console.log(`   Response: ${result.body}`);
      }
    } else if (signed) {
      const signedWebhooks = webhooks.map(wh => signWebhook(wh, secret));
      console.log(JSON.stringify(signedWebhooks, null, 2));
    } else {
      console.log(JSON.stringify(webhooks, null, 2));
    }
    return;
  }

  // Show help
  console.log('Usage:');
  console.log('  Generate webhooks:');
  console.log('    pnpm tsx scripts/mock-webhooks.ts --type=payment_failed --count=5');
  console.log('    pnpm tsx scripts/mock-webhooks.ts --type=payment_succeeded --signed');
  console.log('');
  console.log('  Fire webhooks to endpoint:');
  console.log('    pnpm tsx scripts/mock-webhooks.ts --type=payment_failed --fire --url=http://localhost:3000/api/webhooks/whop');
  console.log('');
  console.log('  Run test scenarios:');
  console.log('    pnpm tsx scripts/mock-webhooks.ts --scenario=full_recovery_cycle --fire');
  console.log('    pnpm tsx scripts/mock-webhooks.ts --scenario=all --fire --verbose');
  console.log('');
  console.log('Options:');
  console.log('  --type=TYPE         Event type: payment_failed, payment_succeeded, etc.');
  console.log('  --count=N           Number of webhooks to generate (default: 1)');
  console.log('  --scenario=NAME     Run a predefined test scenario');
  console.log('  --fire              Actually send webhooks to the URL');
  console.log('  --url=URL           Target webhook URL');
  console.log('  --secret=SECRET     Webhook signing secret');
  console.log('  --signed            Include signatures in output');
  console.log('  --verbose           Show detailed output');
  console.log('  --list-scenarios    List available test scenarios');
}

main().catch(console.error);

export {
  generateWebhook,
  generatePaymentFailedWebhook,
  generatePaymentSucceededWebhook,
  generateMembershipWentInvalidWebhook,
  generateMembershipWentValidWebhook,
  signWebhook,
  fireWebhook,
  fireScenario,
  generateFullRecoveryCycleScenario,
  generateFailedRecoveryScenario,
  generateDuplicateEventScenario,
  generateRapidFireScenario,
  generateMultiCompanyScenario,
  generateEdgeCaseScenarios,
};
