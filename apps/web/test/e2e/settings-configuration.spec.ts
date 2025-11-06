// E2E test: Settings Configuration
import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test.describe('Settings Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    
    if (page.url().includes('/login')) {
      await loginAsUser(page, {
        email: 'merchant@example.com',
        password: 'password123',
      });
    }
  });

  test('can update company settings', async ({ page }) => {
    // Navigate to settings page
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid=settings-form]', { timeout: 10000 });

    // Update push notification setting
    const enablePushToggle = page.locator('[data-testid=enable-push-toggle]');
    if (await enablePushToggle.isVisible()) {
      const currentState = await enablePushToggle.isChecked();
      await enablePushToggle.setChecked(!currentState);
    }

    // Update DM notification setting
    const enableDMToggle = page.locator('[data-testid=enable-dm-toggle]');
    if (await enableDMToggle.isVisible()) {
      const currentState = await enableDMToggle.isChecked();
      await enableDMToggle.setChecked(!currentState);
    }

    // Update incentive days
    const incentiveDaysInput = page.locator('[data-testid=incentive-days-input]');
    if (await incentiveDaysInput.isVisible()) {
      await incentiveDaysInput.clear();
      await incentiveDaysInput.fill('14');
    }

    // Save settings
    const saveButton = page.locator('[data-testid=save-settings-button]');
    await saveButton.click();

    // Verify success message
    const successMessage = page.locator('[data-testid=settings-saved-message]');
    await expect(successMessage).toBeVisible({ timeout: 5000 });
  });

  test('settings persist after page reload', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid=settings-form]', { timeout: 10000 });

    // Get initial values
    const incentiveDaysInput = page.locator('[data-testid=incentive-days-input]');
    let initialValue = '';
    
    if (await incentiveDaysInput.isVisible()) {
      initialValue = await incentiveDaysInput.inputValue();
      
      // Change value
      await incentiveDaysInput.clear();
      await incentiveDaysInput.fill('21');
      
      // Save
      const saveButton = page.locator('[data-testid=save-settings-button]');
      await saveButton.click();
      
      // Wait for save confirmation
      await page.waitForSelector('[data-testid=settings-saved-message]', { timeout: 5000 });
      
      // Reload page
      await page.reload();
      await page.waitForSelector('[data-testid=settings-form]', { timeout: 10000 });
      
      // Verify value persisted
      const persistedValue = await incentiveDaysInput.inputValue();
      expect(persistedValue).toBe('21');
    }
  });

  test('settings impact on behavior', async ({ page }) => {
    // Update settings
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid=settings-form]', { timeout: 10000 });

    // Set specific incentive days
    const incentiveDaysInput = page.locator('[data-testid=incentive-days-input]');
    if (await incentiveDaysInput.isVisible()) {
      await incentiveDaysInput.clear();
      await incentiveDaysInput.fill('7');
      
      const saveButton = page.locator('[data-testid=save-settings-button]');
      await saveButton.click();
      
      await page.waitForSelector('[data-testid=settings-saved-message]', { timeout: 5000 });
    }

    // Navigate to cases and create/apply incentives
    await page.goto('/dashboard/cases');
    await page.waitForSelector('[data-testid=case-list]', { timeout: 10000 });

    // Find or create a case
    const caseItems = page.locator('[data-testid=case-item]');
    const caseCount = await caseItems.count();

    if (caseCount > 0) {
      await caseItems.first().click();
      await page.waitForSelector('[data-testid=case-details]', { timeout: 5000 });

      // Apply incentives
      const applyIncentivesButton = page.locator('[data-testid=apply-incentives-button]');
      if (await applyIncentivesButton.isVisible()) {
        await applyIncentivesButton.click();
        
        // Verify incentive days match settings (7 days)
        const incentiveDaysDisplay = page.locator('[data-testid=incentive-days-display]');
        if (await incentiveDaysDisplay.isVisible()) {
          await expect(incentiveDaysDisplay).toContainText('7');
        }
      }
    }
  });

  test('can reset settings to defaults', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid=settings-form]', { timeout: 10000 });

    // Change some settings
    const incentiveDaysInput = page.locator('[data-testid=incentive-days-input]');
    if (await incentiveDaysInput.isVisible()) {
      await incentiveDaysInput.clear();
      await incentiveDaysInput.fill('30');
      
      const saveButton = page.locator('[data-testid=save-settings-button]');
      await saveButton.click();
      
      await page.waitForSelector('[data-testid=settings-saved-message]', { timeout: 5000 });
    }

    // Reset to defaults
    const resetButton = page.locator('[data-testid=reset-settings-button]');
    if (await resetButton.isVisible()) {
      await resetButton.click();
      
      // Confirm reset if dialog appears
      const confirmResetButton = page.locator('[data-testid=confirm-reset-button]');
      if (await confirmResetButton.isVisible()) {
        await confirmResetButton.click();
      }
      
      // Verify settings reset
      const resetMessage = page.locator('[data-testid=settings-reset-message]');
      await expect(resetMessage).toBeVisible({ timeout: 5000 });
    }
  });
});

