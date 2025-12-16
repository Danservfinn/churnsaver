/**
 * Seed Demo Data for Churn Saver
 * 
 * Generates realistic dummy data for testing, demos, and screenshots.
 * Run against STAGING environment only.
 * 
 * Usage:
 *   DATABASE_URL="your-staging-db-url" npx tsx scripts/seed-demo-data.ts
 *   
 * Options:
 *   --clean    Clear existing data before seeding
 *   --count N  Number of cases to generate (default: 50)
 */

import { Pool } from 'pg';

// Configuration
const DEMO_COMPANY_ID = 'biz_demo_staging';
const DEFAULT_CASE_COUNT = 50;

// Realistic failure reasons from Whop/Stripe
const FAILURE_REASONS = [
  'insufficient_funds',
  'card_declined', 
  'expired_card',
  'processing_error',
  'authentication_required',
  'invalid_account',
  'card_velocity_exceeded',
];

// Status distribution for realistic dashboard
const STATUS_WEIGHTS = {
  open: 0.35,        // 35% still open
  recovered: 0.45,   // 45% recovered (good recovery rate!)
  closed_no_recovery: 0.20,  // 20% churned
};

// Random helpers
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  
  for (const [key, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function randomDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysAgo));
  date.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59));
  return date;
}

function generateCaseId(): string {
  return `case_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateMembershipId(): string {
  return `mem_${Math.random().toString(36).substring(2, 12)}`;
}

function generateUserId(): string {
  return `usr_${Math.random().toString(36).substring(2, 12)}`;
}

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

interface DemoCase {
  id: string;
  company_id: string;
  membership_id: string;
  user_id: string;
  first_failure_at: Date;
  last_nudge_at: Date | null;
  attempts: number;
  incentive_days: number;
  status: string;
  failure_reason: string;
  recovered_amount_cents: number;
  created_at: Date;
  updated_at: Date;
}

function generateCase(companyId: string, daysAgoMax: number = 30): DemoCase {
  const status = weightedChoice(STATUS_WEIGHTS);
  const firstFailure = randomDate(daysAgoMax);
  const attempts = status === 'open' ? randomInt(1, 3) : randomInt(1, 5);
  
  // Realistic recovered amounts ($9.99 - $299.99)
  const amountTiers = [999, 1999, 2999, 4999, 9999, 14999, 29999];
  const recoveredAmount = status === 'recovered' 
    ? randomChoice(amountTiers)
    : 0;

  const lastNudge = attempts > 0 
    ? new Date(firstFailure.getTime() + (attempts * 2 * 24 * 60 * 60 * 1000))
    : null;

  return {
    id: generateCaseId(),
    company_id: companyId,
    membership_id: generateMembershipId(),
    user_id: generateUserId(),
    first_failure_at: firstFailure,
    last_nudge_at: lastNudge,
    attempts,
    incentive_days: status === 'recovered' && Math.random() > 0.5 ? 3 : 0,
    status,
    failure_reason: randomChoice(FAILURE_REASONS),
    recovered_amount_cents: recoveredAmount,
    created_at: firstFailure,
    updated_at: lastNudge || firstFailure,
  };
}

interface DemoAction {
  company_id: string;
  case_id: string;
  membership_id: string;
  user_id: string;
  type: string;
  channel: string | null;
  metadata: object;
  created_at: Date;
}

function generateActionsForCase(demoCase: DemoCase): DemoAction[] {
  const actions: DemoAction[] = [];
  
  // Generate nudge actions based on attempts
  for (let i = 0; i < demoCase.attempts; i++) {
    const nudgeDate = new Date(demoCase.first_failure_at.getTime() + (i * 2 * 24 * 60 * 60 * 1000));
    const channel = i === 0 ? 'push' : (Math.random() > 0.5 ? 'push' : 'dm');
    
    actions.push({
      company_id: demoCase.company_id,
      case_id: demoCase.id,
      membership_id: demoCase.membership_id,
      user_id: demoCase.user_id,
      type: channel === 'push' ? 'nudge_push' : 'nudge_dm',
      channel,
      metadata: { attempt: i + 1, scheduled_offset_days: i * 2 },
      created_at: nudgeDate,
    });
  }
  
  // Add incentive action if incentive was applied
  if (demoCase.incentive_days > 0) {
    actions.push({
      company_id: demoCase.company_id,
      case_id: demoCase.id,
      membership_id: demoCase.membership_id,
      user_id: demoCase.user_id,
      type: 'incentive_applied',
      channel: null,
      metadata: { days: demoCase.incentive_days },
      created_at: demoCase.first_failure_at,
    });
  }
  
  return actions;
}

async function seedDatabase(options: { clean: boolean; count: number; companyId: string }) {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  // Safety check - don't run against production
  if (databaseUrl.includes('prod') || databaseUrl.includes('churnsaver.com')) {
    console.error('❌ SAFETY: This script should NOT be run against production!');
    process.exit(1);
  }
  
  console.log('🌱 Churn Saver Demo Data Seeder');
  console.log('================================');
  console.log(`Company ID: ${options.companyId}`);
  console.log(`Case count: ${options.count}`);
  console.log(`Clean first: ${options.clean}`);
  console.log('');
  
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Database connected');
    
    if (options.clean) {
      console.log('🧹 Cleaning existing demo data...');
      await pool.query('DELETE FROM recovery_actions WHERE company_id = $1', [options.companyId]);
      await pool.query('DELETE FROM recovery_cases WHERE company_id = $1', [options.companyId]);
      await pool.query('DELETE FROM events WHERE company_id = $1', [options.companyId]);
      console.log('✅ Existing data cleared');
    }
    
    // Ensure creator_settings exists for demo company
    console.log('📝 Creating/updating company settings...');
    await pool.query(`
      INSERT INTO creator_settings (company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days)
      VALUES ($1, true, true, 3, ARRAY[0, 2, 4])
      ON CONFLICT (company_id) DO UPDATE SET
        enable_push = true,
        enable_dm = true,
        incentive_days = 3,
        updated_at = now()
    `, [options.companyId]);
    
    // Generate cases
    console.log(`\n🎲 Generating ${options.count} demo cases...`);
    const cases: DemoCase[] = [];
    const allActions: DemoAction[] = [];
    
    for (let i = 0; i < options.count; i++) {
      const demoCase = generateCase(options.companyId, 45);
      cases.push(demoCase);
      allActions.push(...generateActionsForCase(demoCase));
    }
    
    // Insert cases
    console.log('📥 Inserting recovery cases...');
    for (const c of cases) {
      await pool.query(`
        INSERT INTO recovery_cases (
          id, company_id, membership_id, user_id, first_failure_at,
          last_nudge_at, attempts, incentive_days, status, failure_reason,
          recovered_amount_cents, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        c.id, c.company_id, c.membership_id, c.user_id, c.first_failure_at,
        c.last_nudge_at, c.attempts, c.incentive_days, c.status, c.failure_reason,
        c.recovered_amount_cents, c.created_at, c.updated_at
      ]);
    }
    console.log(`✅ Inserted ${cases.length} recovery cases`);
    
    // Insert actions
    console.log('📥 Inserting recovery actions...');
    for (const a of allActions) {
      await pool.query(`
        INSERT INTO recovery_actions (
          company_id, case_id, membership_id, user_id, type, channel, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        a.company_id, a.case_id, a.membership_id, a.user_id,
        a.type, a.channel, JSON.stringify(a.metadata), a.created_at
      ]);
    }
    console.log(`✅ Inserted ${allActions.length} recovery actions`);
    
    // Calculate and display summary statistics
    const stats = {
      total: cases.length,
      open: cases.filter(c => c.status === 'open').length,
      recovered: cases.filter(c => c.status === 'recovered').length,
      churned: cases.filter(c => c.status === 'closed_no_recovery').length,
      totalRecovered: cases.reduce((sum, c) => sum + c.recovered_amount_cents, 0),
      withIncentive: cases.filter(c => c.incentive_days > 0).length,
    };
    
    console.log('\n📊 Demo Data Summary');
    console.log('====================');
    console.log(`Total Cases:     ${stats.total}`);
    console.log(`Open:            ${stats.open} (${((stats.open / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Recovered:       ${stats.recovered} (${((stats.recovered / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Churned:         ${stats.churned} (${((stats.churned / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Recovery Rate:   ${((stats.recovered / stats.total) * 100).toFixed(1)}%`);
    console.log(`Total Recovered: $${(stats.totalRecovered / 100).toFixed(2)}`);
    console.log(`Used Incentive:  ${stats.withIncentive} cases`);
    console.log(`Total Actions:   ${allActions.length}`);
    
    console.log('\n✅ Demo data seeding complete!');
    console.log(`\n🔗 Access dashboard at: https://staging.churnsaver.app/dashboard/${options.companyId}`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  clean: args.includes('--clean'),
  count: DEFAULT_CASE_COUNT,
  companyId: DEMO_COMPANY_ID,
};

const countIndex = args.indexOf('--count');
if (countIndex !== -1 && args[countIndex + 1]) {
  options.count = parseInt(args[countIndex + 1], 10);
}

const companyIndex = args.indexOf('--company');
if (companyIndex !== -1 && args[companyIndex + 1]) {
  options.companyId = args[companyIndex + 1];
}

// Run seeder
seedDatabase(options);
