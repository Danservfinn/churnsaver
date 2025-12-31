/**
 * ChurnSaver Comprehensive Test Data Seeder
 *
 * This script generates realistic dummy data for testing all ChurnSaver features
 * across all tiers and scenarios.
 *
 * Usage:
 *   pnpm tsx scripts/seed-test-data.ts [--tier=all|free|pro|max] [--clean]
 *
 * Options:
 *   --tier      Seed data for specific tier or all (default: all)
 *   --clean     Clear existing test data before seeding
 *   --verbose   Show detailed progress
 */

import { randomUUID } from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface SeedConfig {
  companiesPerTier: number;
  membershipsPerCompany: {
    free: number;
    pro: number;
    max: number;
  };
  casesDistribution: {
    open: number;
    recovered: number;
    closed_no_recovery: number;
    canceled_by_creator: number;
    terminated: number;
  };
  eventsPerCompany: number;
  includeEdgeCases: boolean;
}

const DEFAULT_CONFIG: SeedConfig = {
  companiesPerTier: 3,
  membershipsPerCompany: {
    free: 20,
    pro: 200,
    max: 1000,
  },
  casesDistribution: {
    open: 40, // 40%
    recovered: 30, // 30%
    closed_no_recovery: 15, // 15%
    canceled_by_creator: 10, // 10%
    terminated: 5, // 5%
  },
  eventsPerCompany: 500,
  includeEdgeCases: true,
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type Tier = 'free' | 'pro_monthly' | 'pro_annual' | 'max_monthly' | 'max_annual';
type CaseStatus = 'open' | 'recovered' | 'closed_no_recovery' | 'canceled_by_creator' | 'terminated';
type FailureReason = 'card_declined' | 'insufficient_funds' | 'expired_card' | 'processing_error' | 'fraud_suspected';
type EventType = 'payment_failed' | 'payment_succeeded' | 'membership_went_invalid' | 'membership_went_valid' | 'payment_pending' | 'invoice_past_due';

interface Company {
  id: string;
  name: string;
  tier: Tier;
  created_at: Date;
  settings: CreatorSettings;
}

interface CreatorSettings {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_enabled: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
  timezone: string;
}

interface Membership {
  id: string;
  company_id: string;
  user_id: string;
  product_id: string;
  plan_id: string;
  status: string;
  created_at: Date;
  current_period_end: Date;
  ltv_cents: number;
}

interface RecoveryCase {
  id: string;
  company_id: string;
  membership_id: string;
  user_id: string;
  status: CaseStatus;
  failure_reason: FailureReason;
  first_failure_at: Date;
  last_nudge_at: Date | null;
  recovered_at: Date | null;
  recovered_amount_cents: number | null;
  incentive_days: number;
  attempts: number;
}

interface WebhookEvent {
  id: string;
  whop_event_id: string;
  type: EventType;
  company_id: string;
  membership_id: string;
  payload: Record<string, unknown>;
  processed: boolean;
  error: string | null;
  created_at: Date;
}

interface RecoveryAction {
  id: string;
  case_id: string;
  type: string;
  channel: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ============================================================================
// DATA GENERATORS
// ============================================================================

const TIERS: Tier[] = ['free', 'pro_monthly', 'pro_annual', 'max_monthly', 'max_annual'];
const FAILURE_REASONS: FailureReason[] = ['card_declined', 'insufficient_funds', 'expired_card', 'processing_error', 'fraud_suspected'];
const EVENT_TYPES: EventType[] = ['payment_failed', 'payment_succeeded', 'membership_went_invalid', 'membership_went_valid', 'payment_pending', 'invoice_past_due'];

function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function randomDate(daysAgo: number, daysAgoEnd: number = 0): Date {
  const now = Date.now();
  const start = now - daysAgo * 24 * 60 * 60 * 1000;
  const end = now - daysAgoEnd * 24 * 60 * 60 * 1000;
  return new Date(start + Math.random() * (end - start));
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

function generateCompanyName(tier: string, index: number): string {
  const adjectives = ['Awesome', 'Digital', 'Creative', 'Modern', 'Elite', 'Prime', 'Alpha', 'Stellar'];
  const nouns = ['Studios', 'Labs', 'Academy', 'Hub', 'Club', 'Pro', 'Plus', 'Network'];
  return `${randomElement(adjectives)} ${randomElement(nouns)} ${tier.toUpperCase()} ${index}`;
}

function getTierCategory(tier: Tier): 'free' | 'pro' | 'max' {
  if (tier === 'free') return 'free';
  if (tier.startsWith('pro')) return 'pro';
  return 'max';
}

// ============================================================================
// COMPANY GENERATOR
// ============================================================================

function generateCompanies(config: SeedConfig): Company[] {
  const companies: Company[] = [];

  for (const tier of TIERS) {
    for (let i = 1; i <= config.companiesPerTier; i++) {
      const companyId = generateId('company');
      companies.push({
        id: companyId,
        name: generateCompanyName(tier, i),
        tier,
        created_at: randomDate(365, 30),
        settings: generateCreatorSettings(companyId),
      });
    }
  }

  // Add edge case companies
  if (config.includeEdgeCases) {
    // Expired subscription company
    companies.push({
      id: generateId('company'),
      name: 'Expired Subscription Co',
      tier: 'free', // Downgraded
      created_at: randomDate(400, 300),
      settings: generateCreatorSettings(generateId('company')),
    });

    // Brand new company (just signed up)
    const newCompanyId = generateId('company');
    companies.push({
      id: newCompanyId,
      name: 'Brand New Startup',
      tier: 'pro_monthly',
      created_at: new Date(),
      settings: generateCreatorSettings(newCompanyId),
    });

    // Company with all notifications disabled
    const silentCompanyId = generateId('company');
    companies.push({
      id: silentCompanyId,
      name: 'Silent Mode Co',
      tier: 'max_monthly',
      created_at: randomDate(180, 90),
      settings: {
        company_id: silentCompanyId,
        enable_push: false,
        enable_dm: false,
        incentive_enabled: false,
        incentive_days: 0,
        reminder_offsets_days: [0, 2, 4],
        timezone: 'America/New_York',
      },
    });
  }

  return companies;
}

function generateCreatorSettings(companyId: string): CreatorSettings {
  return {
    company_id: companyId,
    enable_push: Math.random() > 0.1, // 90% have push enabled
    enable_dm: Math.random() > 0.2, // 80% have DM enabled
    incentive_enabled: Math.random() > 0.15, // 85% have incentive enabled
    incentive_days: weightedRandom([3, 5, 7, 10, 14], [50, 25, 15, 7, 3]),
    reminder_offsets_days: Math.random() > 0.3 ? [0, 2, 4] : [0, 3, 6],
    timezone: randomElement(['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'UTC']),
  };
}

// ============================================================================
// MEMBERSHIP GENERATOR
// ============================================================================

function generateMemberships(companies: Company[], config: SeedConfig): Membership[] {
  const memberships: Membership[] = [];

  for (const company of companies) {
    const tierCategory = getTierCategory(company.tier);
    const membershipCount = config.membershipsPerCompany[tierCategory];

    for (let i = 0; i < membershipCount; i++) {
      const createdAt = randomDate(365, 1);
      memberships.push({
        id: generateId('mem'),
        company_id: company.id,
        user_id: generateId('user'),
        product_id: `prod_${company.tier}`,
        plan_id: `plan_${randomElement(['monthly', 'annual', 'lifetime'])}`,
        status: weightedRandom(
          ['active', 'payment_failed', 'canceled', 'expired'],
          [60, 20, 15, 5]
        ),
        created_at: createdAt,
        current_period_end: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        ltv_cents: Math.floor(Math.random() * 50000) + 999, // $9.99 to $509.99
      });
    }
  }

  // Add edge case memberships
  if (config.includeEdgeCases && companies.length > 0) {
    const edgeCompany = companies[0];

    // High-value whale customer
    memberships.push({
      id: generateId('mem'),
      company_id: edgeCompany.id,
      user_id: generateId('user'),
      product_id: `prod_${edgeCompany.tier}`,
      plan_id: 'plan_lifetime',
      status: 'active',
      created_at: randomDate(500, 400),
      current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      ltv_cents: 150000, // $1,500
    });

    // Zero LTV (refunded customer)
    memberships.push({
      id: generateId('mem'),
      company_id: edgeCompany.id,
      user_id: generateId('user'),
      product_id: `prod_${edgeCompany.tier}`,
      plan_id: 'plan_monthly',
      status: 'canceled',
      created_at: randomDate(30, 1),
      current_period_end: new Date(),
      ltv_cents: 0,
    });
  }

  return memberships;
}

// ============================================================================
// RECOVERY CASE GENERATOR
// ============================================================================

function generateRecoveryCases(memberships: Membership[], config: SeedConfig): RecoveryCase[] {
  const cases: RecoveryCase[] = [];
  const statusWeights = Object.values(config.casesDistribution);
  const statuses: CaseStatus[] = ['open', 'recovered', 'closed_no_recovery', 'canceled_by_creator', 'terminated'];

  // Group memberships by company
  const membershipsByCompany = new Map<string, Membership[]>();
  for (const membership of memberships) {
    const existing = membershipsByCompany.get(membership.company_id) || [];
    existing.push(membership);
    membershipsByCompany.set(membership.company_id, existing);
  }

  for (const [companyId, companyMemberships] of membershipsByCompany) {
    // Generate cases for ~30% of memberships
    const caseCount = Math.floor(companyMemberships.length * 0.3);
    const selectedMemberships = companyMemberships
      .sort(() => Math.random() - 0.5)
      .slice(0, caseCount);

    for (const membership of selectedMemberships) {
      const status = weightedRandom(statuses, statusWeights);
      const firstFailureAt = generateCaseDate(status);
      const isRecovered = status === 'recovered';
      const isClosed = status !== 'open';

      cases.push({
        id: generateId('case'),
        company_id: companyId,
        membership_id: membership.id,
        user_id: membership.user_id,
        status,
        failure_reason: randomElement(FAILURE_REASONS),
        first_failure_at: firstFailureAt,
        last_nudge_at: isClosed ? randomDate(14, 1) : (Math.random() > 0.3 ? randomDate(7, 0) : null),
        recovered_at: isRecovered ? new Date(firstFailureAt.getTime() + Math.random() * 14 * 24 * 60 * 60 * 1000) : null,
        recovered_amount_cents: isRecovered ? Math.floor(Math.random() * 10000) + 999 : null,
        incentive_days: Math.random() > 0.3 ? weightedRandom([3, 5, 7], [60, 30, 10]) : 0,
        attempts: Math.floor(Math.random() * 4) + 1,
      });
    }
  }

  // Add edge case recovery cases
  if (config.includeEdgeCases && memberships.length > 0) {
    const edgeMembership = memberships[0];

    // Case at exactly 14 days (boundary)
    cases.push({
      id: generateId('case'),
      company_id: edgeMembership.company_id,
      membership_id: edgeMembership.id,
      user_id: edgeMembership.user_id,
      status: 'open',
      failure_reason: 'card_declined',
      first_failure_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      last_nudge_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      recovered_at: null,
      recovered_amount_cents: null,
      incentive_days: 3,
      attempts: 3,
    });

    // Very old case (data retention test)
    cases.push({
      id: generateId('case'),
      company_id: edgeMembership.company_id,
      membership_id: generateId('mem'),
      user_id: generateId('user'),
      status: 'closed_no_recovery',
      failure_reason: 'expired_card',
      first_failure_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      last_nudge_at: new Date(Date.now() - 390 * 24 * 60 * 60 * 1000),
      recovered_at: null,
      recovered_amount_cents: null,
      incentive_days: 0,
      attempts: 3,
    });

    // $0 recovered amount case
    cases.push({
      id: generateId('case'),
      company_id: edgeMembership.company_id,
      membership_id: generateId('mem'),
      user_id: generateId('user'),
      status: 'recovered',
      failure_reason: 'processing_error',
      first_failure_at: randomDate(10, 5),
      last_nudge_at: randomDate(8, 3),
      recovered_at: randomDate(5, 1),
      recovered_amount_cents: 0,
      incentive_days: 3,
      attempts: 2,
    });
  }

  return cases;
}

function generateCaseDate(status: CaseStatus): Date {
  switch (status) {
    case 'open':
      // Open cases should be within last 14 days
      return randomDate(14, 0);
    case 'recovered':
      // Recovered cases within last 30 days
      return randomDate(30, 3);
    case 'closed_no_recovery':
      // Closed cases are older than 14 days
      return randomDate(60, 14);
    case 'canceled_by_creator':
    case 'terminated':
      // Manual actions can be any time
      return randomDate(45, 1);
    default:
      return randomDate(30, 0);
  }
}

// ============================================================================
// EVENT GENERATOR
// ============================================================================

function generateEvents(cases: RecoveryCase[], config: SeedConfig): WebhookEvent[] {
  const events: WebhookEvent[] = [];

  // Group cases by company
  const casesByCompany = new Map<string, RecoveryCase[]>();
  for (const caseItem of cases) {
    const existing = casesByCompany.get(caseItem.company_id) || [];
    existing.push(caseItem);
    casesByCompany.set(caseItem.company_id, existing);
  }

  for (const [companyId, companyCases] of casesByCompany) {
    let eventCount = 0;
    const targetEvents = config.eventsPerCompany;

    // Generate events for each case
    for (const caseItem of companyCases) {
      if (eventCount >= targetEvents) break;

      // Payment failed event (always)
      events.push({
        id: generateId('evt'),
        whop_event_id: `whop_evt_${randomUUID()}`,
        type: 'payment_failed',
        company_id: companyId,
        membership_id: caseItem.membership_id,
        payload: {
          amount_cents: Math.floor(Math.random() * 10000) + 999,
          failure_reason: caseItem.failure_reason,
          attempt_count: 1,
        },
        processed: true,
        error: null,
        created_at: caseItem.first_failure_at,
      });
      eventCount++;

      // Payment succeeded event (if recovered)
      if (caseItem.status === 'recovered' && caseItem.recovered_at) {
        events.push({
          id: generateId('evt'),
          whop_event_id: `whop_evt_${randomUUID()}`,
          type: 'payment_succeeded',
          company_id: companyId,
          membership_id: caseItem.membership_id,
          payload: {
            amount_cents: caseItem.recovered_amount_cents || 0,
            previous_failure: true,
          },
          processed: true,
          error: null,
          created_at: caseItem.recovered_at,
        });
        eventCount++;
      }

      // Membership status events (randomly)
      if (Math.random() > 0.5) {
        events.push({
          id: generateId('evt'),
          whop_event_id: `whop_evt_${randomUUID()}`,
          type: randomElement(['membership_went_invalid', 'membership_went_valid']),
          company_id: companyId,
          membership_id: caseItem.membership_id,
          payload: {
            reason: 'payment_status_change',
          },
          processed: true,
          error: null,
          created_at: new Date(caseItem.first_failure_at.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000),
        });
        eventCount++;
      }
    }

    // Fill remaining events with random types
    while (eventCount < targetEvents) {
      const randomCase = randomElement(companyCases);
      events.push({
        id: generateId('evt'),
        whop_event_id: `whop_evt_${randomUUID()}`,
        type: randomElement(EVENT_TYPES),
        company_id: companyId,
        membership_id: randomCase?.membership_id || generateId('mem'),
        payload: {
          random_event: true,
          test_data: true,
        },
        processed: Math.random() > 0.05, // 5% unprocessed
        error: Math.random() > 0.98 ? 'Test error for debugging' : null,
        created_at: randomDate(30, 0),
      });
      eventCount++;
    }
  }

  // Add edge case events
  if (config.includeEdgeCases) {
    const companyId = cases[0]?.company_id || generateId('company');

    // Duplicate event (for idempotency testing)
    const duplicateEventId = `whop_evt_duplicate_${randomUUID().slice(0, 8)}`;
    events.push({
      id: generateId('evt'),
      whop_event_id: duplicateEventId,
      type: 'payment_failed',
      company_id: companyId,
      membership_id: generateId('mem'),
      payload: { duplicate_test: true },
      processed: true,
      error: null,
      created_at: randomDate(1, 0),
    });
    events.push({
      id: generateId('evt'),
      whop_event_id: duplicateEventId, // Same ID!
      type: 'payment_failed',
      company_id: companyId,
      membership_id: generateId('mem'),
      payload: { duplicate_test: true },
      processed: true,
      error: 'Duplicate event - already processed',
      created_at: randomDate(1, 0),
    });

    // Event with error
    events.push({
      id: generateId('evt'),
      whop_event_id: `whop_evt_${randomUUID()}`,
      type: 'payment_failed',
      company_id: companyId,
      membership_id: generateId('mem'),
      payload: { error_test: true },
      processed: false,
      error: 'Processing failed: Whop API timeout',
      created_at: randomDate(2, 1),
    });

    // Very old event (retention test)
    events.push({
      id: generateId('evt'),
      whop_event_id: `whop_evt_${randomUUID()}`,
      type: 'payment_succeeded',
      company_id: companyId,
      membership_id: generateId('mem'),
      payload: { old_event: true },
      processed: true,
      error: null,
      created_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    });
  }

  return events;
}

// ============================================================================
// RECOVERY ACTION GENERATOR
// ============================================================================

function generateRecoveryActions(cases: RecoveryCase[]): RecoveryAction[] {
  const actions: RecoveryAction[] = [];
  const actionTypes = ['nudge_push', 'nudge_dm', 'incentive_applied', 'manual_nudge', 'case_opened', 'case_closed', 'case_recovered'];

  for (const caseItem of cases) {
    // Case opened action (always)
    actions.push({
      id: generateId('action'),
      case_id: caseItem.id,
      type: 'case_opened',
      channel: null,
      metadata: { failure_reason: caseItem.failure_reason },
      created_at: caseItem.first_failure_at,
    });

    // Nudge actions based on attempts
    for (let i = 0; i < caseItem.attempts; i++) {
      const nudgeType = Math.random() > 0.5 ? 'nudge_push' : 'nudge_dm';
      actions.push({
        id: generateId('action'),
        case_id: caseItem.id,
        type: nudgeType,
        channel: nudgeType === 'nudge_push' ? 'push' : 'dm',
        metadata: {
          attempt: i + 1,
          template_id: `template_t${i * 2}`,
        },
        created_at: new Date(caseItem.first_failure_at.getTime() + i * 2 * 24 * 60 * 60 * 1000),
      });
    }

    // Incentive action
    if (caseItem.incentive_days > 0) {
      actions.push({
        id: generateId('action'),
        case_id: caseItem.id,
        type: 'incentive_applied',
        channel: null,
        metadata: {
          days: caseItem.incentive_days,
          applied_at_attempt: 1,
        },
        created_at: new Date(caseItem.first_failure_at.getTime() + 1000),
      });
    }

    // Closing action
    if (caseItem.status !== 'open') {
      actions.push({
        id: generateId('action'),
        case_id: caseItem.id,
        type: caseItem.status === 'recovered' ? 'case_recovered' : 'case_closed',
        channel: null,
        metadata: {
          reason: caseItem.status,
          recovered_amount: caseItem.recovered_amount_cents,
        },
        created_at: caseItem.recovered_at || new Date(caseItem.first_failure_at.getTime() + 14 * 24 * 60 * 60 * 1000),
      });
    }
  }

  return actions;
}

// ============================================================================
// SQL GENERATION
// ============================================================================

function generateSQL(
  companies: Company[],
  memberships: Membership[],
  cases: RecoveryCase[],
  events: WebhookEvent[],
  actions: RecoveryAction[]
): string {
  const sql: string[] = [];

  sql.push('-- ChurnSaver Test Data Seed Script');
  sql.push(`-- Generated: ${new Date().toISOString()}`);
  sql.push('-- Total Records: ' + (companies.length + memberships.length + cases.length + events.length + actions.length));
  sql.push('');
  sql.push('BEGIN;');
  sql.push('');

  // Companies (creator_settings is separate)
  sql.push('-- Companies');
  for (const company of companies) {
    sql.push(`INSERT INTO companies (id, name, tier, created_at) VALUES (
  '${company.id}',
  '${company.name.replace(/'/g, "''")}',
  '${company.tier}',
  '${company.created_at.toISOString()}'
) ON CONFLICT (id) DO UPDATE SET tier = EXCLUDED.tier;`);
  }
  sql.push('');

  // Creator Settings
  sql.push('-- Creator Settings');
  for (const company of companies) {
    const s = company.settings;
    sql.push(`INSERT INTO creator_settings (company_id, enable_push, enable_dm, incentive_enabled, incentive_days, reminder_offsets_days, timezone) VALUES (
  '${s.company_id}',
  ${s.enable_push},
  ${s.enable_dm},
  ${s.incentive_enabled},
  ${s.incentive_days},
  ARRAY[${s.reminder_offsets_days.join(', ')}],
  '${s.timezone}'
) ON CONFLICT (company_id) DO UPDATE SET
  enable_push = EXCLUDED.enable_push,
  enable_dm = EXCLUDED.enable_dm,
  incentive_enabled = EXCLUDED.incentive_enabled,
  incentive_days = EXCLUDED.incentive_days;`);
  }
  sql.push('');

  // Recovery Cases
  sql.push('-- Recovery Cases');
  for (const c of cases) {
    sql.push(`INSERT INTO recovery_cases (id, company_id, membership_id, user_id, status, failure_reason, first_failure_at, last_nudge_at, recovered_at, recovered_amount_cents, incentive_days, attempts) VALUES (
  '${c.id}',
  '${c.company_id}',
  '${c.membership_id}',
  '${c.user_id}',
  '${c.status}',
  '${c.failure_reason}',
  '${c.first_failure_at.toISOString()}',
  ${c.last_nudge_at ? `'${c.last_nudge_at.toISOString()}'` : 'NULL'},
  ${c.recovered_at ? `'${c.recovered_at.toISOString()}'` : 'NULL'},
  ${c.recovered_amount_cents ?? 'NULL'},
  ${c.incentive_days},
  ${c.attempts}
) ON CONFLICT (id) DO NOTHING;`);
  }
  sql.push('');

  // Events
  sql.push('-- Webhook Events');
  for (const e of events) {
    sql.push(`INSERT INTO events (id, whop_event_id, type, company_id, membership_id, payload, processed, error, created_at) VALUES (
  '${e.id}',
  '${e.whop_event_id}',
  '${e.type}',
  '${e.company_id}',
  '${e.membership_id}',
  '${JSON.stringify(e.payload).replace(/'/g, "''")}',
  ${e.processed},
  ${e.error ? `'${e.error.replace(/'/g, "''")}'` : 'NULL'},
  '${e.created_at.toISOString()}'
) ON CONFLICT (whop_event_id) DO NOTHING;`);
  }
  sql.push('');

  // Recovery Actions
  sql.push('-- Recovery Actions');
  for (const a of actions) {
    sql.push(`INSERT INTO recovery_actions (id, case_id, type, channel, metadata, created_at) VALUES (
  '${a.id}',
  '${a.case_id}',
  '${a.type}',
  ${a.channel ? `'${a.channel}'` : 'NULL'},
  '${JSON.stringify(a.metadata).replace(/'/g, "''")}',
  '${a.created_at.toISOString()}'
) ON CONFLICT (id) DO NOTHING;`);
  }
  sql.push('');

  sql.push('COMMIT;');
  sql.push('');
  sql.push('-- Summary Statistics');
  sql.push(`-- Companies: ${companies.length}`);
  sql.push(`-- Memberships: ${memberships.length}`);
  sql.push(`-- Recovery Cases: ${cases.length}`);
  sql.push(`-- Events: ${events.length}`);
  sql.push(`-- Actions: ${actions.length}`);

  return sql.join('\n');
}

// ============================================================================
// JSON EXPORT (for API seeding)
// ============================================================================

function generateJSON(
  companies: Company[],
  memberships: Membership[],
  cases: RecoveryCase[],
  events: WebhookEvent[],
  actions: RecoveryAction[]
): string {
  return JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      summary: {
        companies: companies.length,
        memberships: memberships.length,
        cases: cases.length,
        events: events.length,
        actions: actions.length,
      },
      data: {
        companies,
        memberships,
        cases,
        events,
        actions,
      },
    },
    null,
    2
  );
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const tierFilter = args.find(a => a.startsWith('--tier='))?.split('=')[1] || 'all';
  const clean = args.includes('--clean');
  const verbose = args.includes('--verbose');
  const outputFormat = args.find(a => a.startsWith('--format='))?.split('=')[1] || 'sql';

  console.log('🌱 ChurnSaver Test Data Seeder');
  console.log('=============================');
  console.log(`Tier Filter: ${tierFilter}`);
  console.log(`Clean First: ${clean}`);
  console.log(`Output Format: ${outputFormat}`);
  console.log('');

  const config = { ...DEFAULT_CONFIG };

  // Generate data
  console.log('📊 Generating companies...');
  const companies = generateCompanies(config);
  if (verbose) console.log(`   Created ${companies.length} companies`);

  console.log('👥 Generating memberships...');
  const memberships = generateMemberships(companies, config);
  if (verbose) console.log(`   Created ${memberships.length} memberships`);

  console.log('📋 Generating recovery cases...');
  const cases = generateRecoveryCases(memberships, config);
  if (verbose) console.log(`   Created ${cases.length} cases`);

  console.log('📡 Generating webhook events...');
  const events = generateEvents(cases, config);
  if (verbose) console.log(`   Created ${events.length} events`);

  console.log('📝 Generating recovery actions...');
  const actions = generateRecoveryActions(cases);
  if (verbose) console.log(`   Created ${actions.length} actions`);

  // Output
  console.log('');
  console.log('💾 Generating output...');

  if (outputFormat === 'json') {
    const json = generateJSON(companies, memberships, cases, events, actions);
    console.log(json);
  } else {
    const sql = generateSQL(companies, memberships, cases, events, actions);
    console.log(sql);
  }

  console.log('');
  console.log('✅ Seed data generation complete!');
  console.log('');
  console.log('📈 Summary:');
  console.log(`   Companies:  ${companies.length}`);
  console.log(`   Memberships: ${memberships.length}`);
  console.log(`   Cases:       ${cases.length}`);
  console.log(`   Events:      ${events.length}`);
  console.log(`   Actions:     ${actions.length}`);
  console.log(`   Total:       ${companies.length + memberships.length + cases.length + events.length + actions.length} records`);
}

// Run if called directly
main().catch(console.error);

export {
  generateCompanies,
  generateMemberships,
  generateRecoveryCases,
  generateEvents,
  generateRecoveryActions,
  generateSQL,
  generateJSON,
  DEFAULT_CONFIG,
};
