import { sql } from '@/lib/db';

export async function seedTestCases(companyId: string, count: number = 3) {
  const cases = [];
  for (let i = 0; i < count; i++) {
    const result = await sql.insert(
      `INSERT INTO recovery_cases (
        company_id, membership_id, user_id, status, first_failure_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING *`,
      [
        companyId,
        `test-membership-${i}`,
        `test-user-${i}`,
        i === 0 ? 'open' : 'recovered'
      ]
    );
    cases.push(result);
  }
  return cases;
}

export async function cleanupTestCases(companyId: string) {
  await sql.execute(
    `DELETE FROM recovery_cases WHERE company_id = $1`,
    [companyId]
  );
}

