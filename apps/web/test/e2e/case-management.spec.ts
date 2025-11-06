// E2E test: Case Management Workflow
import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';
import { createTestCase } from './helpers/test-data';

test.describe('Case Management Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/dashboard');
    
    if (page.url().includes('/login')) {
      await loginAsUser(page, {
        email: 'merchant@example.com',
        password: 'password123',
      });
    }
  });

  test('can create a case manually', async ({ page }) => {
    await page.goto('/dashboard/cases');

    // Click new case button
    const newCaseButton = page.locator('[data-testid=new-case-button]');
    await expect(newCaseButton).toBeVisible({ timeout: 5000 });
    await newCaseButton.click();

    // Should open modal or form
    const caseModal = page.locator('[data-testid=case-modal]');
    await expect(caseModal).toBeVisible({ timeout: 5000 });

    // Fill form
    const userSelect = page.locator('[data-testid=user-select]');
    const reasonSelect = page.locator('[data-testid=reason-select]');
    const descriptionTextarea = page.locator('[data-testid=description-textarea]');

    if (await userSelect.isVisible()) {
      await userSelect.fill('Test User');
    }

    if (await reasonSelect.isVisible()) {
      await reasonSelect.selectOption('churn_risk');
    }

    if (await descriptionTextarea.isVisible()) {
      await descriptionTextarea.fill('User showing signs of churning');
    }

    // Submit form
    const saveCaseButton = page.locator('[data-testid=save-case-button]');
    await saveCaseButton.click();

    // Should close modal and show success message
    await expect(caseModal).not.toBeVisible({ timeout: 5000 });
    
    const successMessage = page.locator('[data-testid=success-message]');
    await expect(successMessage).toContainText('Case created successfully', { timeout: 5000 });
  });

  test('can apply incentives to a case', async ({ page }) => {
    await page.goto('/dashboard/cases');
    await page.waitForSelector('[data-testid=case-list]', { timeout: 10000 });

    // Find first case or create one if none exist
    const caseItems = page.locator('[data-testid=case-item]');
    const caseCount = await caseItems.count();

    if (caseCount === 0) {
      // Create a case first (you might want to use API or webhook here)
      test.skip();
      return;
    }

    // Click on first case
    await caseItems.first().click();

    // Wait for case details
    await page.waitForSelector('[data-testid=case-details]', { timeout: 5000 });

    // Click apply incentives button
    const applyIncentivesButton = page.locator('[data-testid=apply-incentives-button]');
    if (await applyIncentivesButton.isVisible()) {
      await applyIncentivesButton.click();

      // Confirm if confirmation dialog appears
      const confirmButton = page.locator('[data-testid=confirm-incentives-button]');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Verify incentives applied
      const incentivesMessage = page.locator('[data-testid=incentives-applied-message]');
      await expect(incentivesMessage).toBeVisible({ timeout: 5000 });
    }
  });

  test('can send reminders for a case', async ({ page }) => {
    await page.goto('/dashboard/cases');
    await page.waitForSelector('[data-testid=case-list]', { timeout: 10000 });

    const caseItems = page.locator('[data-testid=case-item]');
    const caseCount = await caseItems.count();

    if (caseCount === 0) {
      test.skip();
      return;
    }

    // Click on first case
    await caseItems.first().click();
    await page.waitForSelector('[data-testid=case-details]', { timeout: 5000 });

    // Find send reminder button
    const sendReminderButton = page.locator('[data-testid=send-reminder-button]');
    if (await sendReminderButton.isVisible()) {
      await sendReminderButton.click();

      // Verify reminder sent message
      const reminderMessage = page.locator('[data-testid=reminder-sent-message]');
      await expect(reminderMessage).toBeVisible({ timeout: 5000 });
    }
  });

  test('can mark case as recovered', async ({ page }) => {
    await page.goto('/dashboard/cases');
    await page.waitForSelector('[data-testid=case-list]', { timeout: 10000 });

    const caseItems = page.locator('[data-testid=case-item]');
    const caseCount = await caseItems.count();

    if (caseCount === 0) {
      test.skip();
      return;
    }

    // Find an open case
    const openCase = page.locator('[data-testid=case-item]:has-text("open")').first();
    if (await openCase.isVisible()) {
      await openCase.click();
      await page.waitForSelector('[data-testid=case-details]', { timeout: 5000 });

      // Mark as recovered
      const markRecoveredButton = page.locator('[data-testid=mark-recovered-button]');
      if (await markRecoveredButton.isVisible()) {
        await markRecoveredButton.click();

        // Confirm if needed
        const confirmButton = page.locator('[data-testid=confirm-recovery-button]');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Verify recovery status
        await page.reload();
        await expect(page.locator('[data-testid=case-status]')).toContainText('recovered', { timeout: 5000 });
      }
    }
  });

  test('can filter cases', async ({ page }) => {
    await page.goto('/dashboard/cases');
    await page.waitForSelector('[data-testid=case-list]', { timeout: 10000 });

    // Test status filter
    const statusFilter = page.locator('[data-testid=status-filter]');
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('open');
      
      // Verify filtered results
      await page.waitForTimeout(1000);
      const caseItems = page.locator('[data-testid=case-item]');
      const visibleCases = await caseItems.count();
      
      // All visible cases should be open
      for (let i = 0; i < Math.min(visibleCases, 5); i++) {
        const caseItem = caseItems.nth(i);
        await expect(caseItem).toContainText('open');
      }
    }
  });
});

