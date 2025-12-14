import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('030_remove_default_company_id migration', () => {
  const migrationPath = resolve(__dirname, '../../../infra/migrations/030_remove_default_company_id.sql');
  const content = readFileSync(migrationPath, 'utf8');

  it('fails fast when legacy default rows exist', () => {
    expect(content).toContain('RAISE EXCEPTION');
    expect(content).toContain('biz_hqNeRcxEMkuyOL');
  });

  it('drops defaults for all targeted tables', () => {
    const targets = [
      'ab_tests',
      'ab_test_variants',
      'ab_test_participants',
      'job_queue',
      'rate_limits',
      'migration_history',
      'security_alerts',
    ];

    targets.forEach((table) => {
      expect(content).toContain(`ALTER TABLE ${table} ALTER COLUMN company_id DROP DEFAULT`);
    });
  });
});






