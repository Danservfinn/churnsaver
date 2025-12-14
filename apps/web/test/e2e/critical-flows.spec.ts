import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || process.env.BASE_URL;

test.describe('Critical flows', () => {
  test.skip(!baseUrl, 'E2E base URL not configured');

  test('webhook endpoint rejects unsigned requests', async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/webhooks/whop`, {
      data: { type: 'ping', data: {} }
    });
    expect(res.status()).toBe(401);
  });

  test('dashboard route responds without 5xx', async ({ page }) => {
    const response = await page.goto(`${baseUrl}/dashboard`);
    expect(response?.status() || 0).toBeLessThan(500);
  });

  test('recovery link handler responds without 5xx', async ({ request }) => {
    const res = await request.get(`${baseUrl}/r/test-token`);
    expect(res.status()).toBeLessThan(500);
  });
});

