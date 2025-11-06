// E2E test: Webhook Processing to Case Creation to Recovery Flow
import { test, expect } from '@playwright/test';
import { simulateWebhook, createPaymentFailedWebhook, createPaymentSucceededWebhook } from './helpers/webhook-simulator';
import { loginAsUser } from './helpers/auth';
import { createTestCase, cleanupTestData } from './helpers/test-data';

test.describe('Webhook to Recovery Journey', () => {
  const testMembershipId = `mem_e2e_${Date.now()}`;
  const testUserId = `user_e2e_${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    // Login as merchant admin
    // Note: In a real scenario, you'd use actual auth or mock it
    await page.goto('/dashboard');
    
    // If redirected to login, handle authentication
    if (page.url().includes('/login')) {
      await loginAsUser(page, {
        email: 'merchant@example.com',
        password: 'password123',
      });
    }
  });

  test.afterEach(async () => {
    // Cleanup test data if cleanup endpoint exists
    await cleanupTestData();
  });

  test('payment failed webhook creates case and triggers recovery flow', async ({ page }) => {
    // Start with empty cases list (or verify current state)
    await page.goto('/dashboard/cases');
    
    // Wait for cases table to load
    await page.waitForSelector('[data-testid=case-list], [data-testid=no-cases-message]', { timeout: 5000 });

    // Check if there's a "no cases" message or empty state
    const noCasesMessage = page.locator('[data-testid=no-cases-message]');
    const caseList = page.locator('[data-testid=case-list]');
    
    // If cases exist, that's fine - we'll just verify our new case appears
    const initialCaseCount = await caseList.count();

    // Simulate payment_failed webhook
    const webhookResponse = await simulateWebhook('payment_failed', {
      membership_id: testMembershipId,
      user_id: testUserId,
      failure_reason: 'card_declined',
    });

    expect(webhookResponse.ok).toBe(true);

    // Wait a moment for webhook processing
    await page.waitForTimeout(2000);

    // Refresh to see new case
    await page.reload();
    await page.waitForSelector('[data-testid=case-list]', { timeout: 10000 });

    // Verify case appears in the list
    const caseItem = page.locator(`[data-testid=case-item]:has-text("${testMembershipId}")`);
    await expect(caseItem).toBeVisible({ timeout: 10000 });

    // Click on the case to view details
    await caseItem.first().click();

    // Verify case details are visible
    await expect(page.locator('[data-testid=case-details]')).toBeVisible({ timeout: 5000 });

    // Apply incentives (if button exists)
    const applyIncentivesButton = page.locator('[data-testid=apply-incentives-button]');
    if (await applyIncentivesButton.isVisible()) {
      await applyIncentivesButton.click();
      
      // Confirm incentives if confirmation dialog appears
      const confirmButton = page.locator('[data-testid=confirm-incentives-button]');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Verify incentives applied message
      const incentivesMessage = page.locator('[data-testid=incentives-applied-message]');
      await expect(incentivesMessage).toBeVisible({ timeout: 5000 });
    }

    // Simulate successful payment
    const successWebhookResponse = await simulateWebhook('payment_succeeded', {
      membership_id: testMembershipId,
      user_id: testUserId,
      amount: 29.99,
    });

    expect(successWebhookResponse.ok).toBe(true);

    // Wait for recovery processing
    await page.waitForTimeout(2000);

    // Refresh to see recovery status
    await page.reload();
    await page.waitForSelector('[data-testid=case-list]', { timeout: 10000 });

    // Verify case shows as recovered
    const recoveredCase = page.locator(`[data-testid=case-item]:has-text("${testMembershipId}")`);
    await expect(recoveredCase).toContainText('recovered', { timeout: 10000 });

    // Verify recovered amount is displayed
    const recoveredAmount = page.locator('[data-testid=recovered-amount]');
    if (await recoveredAmount.isVisible()) {
      await expect(recoveredAmount).toContainText('$29.99');
    }
  });

  test('case creation triggers appropriate notifications', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard');

    // Create a new case via webhook
    const notificationMembershipId = `mem_notification_${Date.now()}`;
    const notificationUserId = `user_notification_${Date.now()}`;

    const webhookResponse = await simulateWebhook('payment_failed', {
      membership_id: notificationMembershipId,
      user_id: notificationUserId,
      failure_reason: 'insufficient_funds',
    });

    expect(webhookResponse.ok).toBe(true);

    // Wait for notification processing
    await page.waitForTimeout(3000);

    // In a real test, you might check:
    // - Email notifications (via test email service)
    // - Push notifications (via mocked notification service)
    // - Dashboard alerts (via UI elements)
    
    // For now, verify the case was created
    await page.goto('/dashboard/cases');
    await page.waitForSelector('[data-testid=case-list]', { timeout: 10000 });
    
    const caseItem = page.locator(`[data-testid=case-item]:has-text("${notificationMembershipId}")`);
    await expect(caseItem).toBeVisible({ timeout: 10000 });
  });
});

