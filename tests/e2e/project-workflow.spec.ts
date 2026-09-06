import { test, expect } from '@playwright/test';
import { launchElectronApp, closeElectronApp } from './helpers';

test.describe('Reframe App - Project Workflow', () => {
  test('should create a project and navigate to it', async () => {
    const seed = { basePath: '/tmp/reframe-test', projects: [], videos: [] };
    const { app, page } = await launchElectronApp(seed);

    // Clear stale routes from previous tests
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await page.click('[data-testid="onboarding-skip-button"]');

    await page.waitForSelector('[data-testid="new-project-button"]', { timeout: 10000 });
    
    await page.click('[data-testid="new-project-button"]');
    
    const input = page.locator('[data-testid="new-project-input"]');
    await input.waitFor({ state: 'visible' });
    await input.fill('My E2E Project');
    await input.press('Enter');

    // Use first() since the project name appears in both sidebar and project detail header
    await expect(page.locator('text=My E2E Project').first()).toBeVisible();

    await closeElectronApp(app);
  });

  test('should show welcome screen when no project is selected', async () => {
    const seed = { basePath: '/tmp/reframe-test', projects: [], videos: [] };
    const { app, page } = await launchElectronApp(seed);

    // Clear stale routes so app starts at the projects view
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await page.click('[data-testid="onboarding-skip-button"]');

    await expect(page.locator('text=Welcome to Reframe')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Select a project from the sidebar or create a new one to get started.')).toBeVisible();

    await closeElectronApp(app);
  });

  test('should show onboarding once and allow it to be reopened', async () => {
    const seed = { basePath: '/tmp/reframe-test', projects: [], videos: [] };
    const { app, page } = await launchElectronApp(seed);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('[data-testid="onboarding"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Create a project')).toBeVisible();
    await page.click('[data-testid="onboarding-skip-button"]');
    await expect(page.locator('[data-testid="onboarding"]')).not.toBeVisible();

    await page.click('[data-testid="show-onboarding-button"]');
    await expect(page.locator('[data-testid="onboarding"]')).toBeVisible();
    await page.click('[data-testid="onboarding-next-button"]');
    await expect(page.locator('text=Import and reframe')).toBeVisible();
    await page.click('[data-testid="onboarding-next-button"]');
    await expect(page.locator('text=Create scenes and export')).toBeVisible();
    await expect(page.locator('text=Press S to create a scene')).toBeVisible();

    await closeElectronApp(app);
  });
});
