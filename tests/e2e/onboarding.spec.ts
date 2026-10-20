import { expect, test } from '@playwright/test';
import { continueTo, signInFresh } from './helpers';

test('onboarding saves progress and resumes after a refresh', async ({ page }) => {
  await signInFresh(page, /Marcus Chen/);
  await expect(page.getByRole('heading', { name: /Welcome to RedSky/ })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForURL(/\/onboarding\/profile$/);

  const preferred = page.getByLabel('Preferred name');
  await preferred.fill('Marc');
  await preferred.blur();
  await continueTo(page, 'role');

  // A refresh lands on the same step with the saved profile.
  await page.reload();
  await expect(page).toHaveURL(/\/onboarding\/role$/);
  await page.goto('/onboarding/profile');
  await expect(page.getByLabel('Preferred name')).toHaveValue('Marc');

  // Steps beyond the furthest one reached are not addressable.
  await page.goto('/onboarding/ready');
  await expect(page).toHaveURL(/\/onboarding\/(profile|role)$/);
});

test('workstyle requires consent, then sample suggestions update the preview', async ({ page }) => {
  await signInFresh(page, /Marcus Chen/);
  await page.getByRole('button', { name: 'Get started' }).click();
  await continueTo(page, 'role');
  await continueTo(page, 'workstyle');

  const workstyle = await page.request.delete('/api/workstyle', { headers: { Origin: new URL(page.url()).origin } });
  expect(workstyle.ok()).toBeTruthy();
  await page.reload();

  await expect(page.getByLabel('Upload your TTI Talent Insights report (PDF)')).toBeDisabled();
  await page.getByRole('checkbox', { name: /I consent/ }).click();
  await expect(page.getByLabel('Upload your TTI Talent Insights report (PDF)')).toBeEnabled();
  await page.getByRole('button', { name: 'Preview with a sample assessment' }).click();
  await expect(page.getByRole('heading', { name: 'Your Workstyle. Your RedSky.' })).toBeVisible();
  await page.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.getByText('6 of 6 accepted')).toBeVisible();
  await expect(page.getByText('Changed').first()).toBeVisible();
});

test('completing onboarding enters the workspace on the chosen landing view', async ({ page }) => {
  await signInFresh(page, /Marcus Chen/);
  await page.getByRole('button', { name: 'Get started' }).click();
  for (const slug of ['role', 'workstyle', 'connect', 'preferences']) await continueTo(page, slug);
  await page.getByRole('button', { name: /My Tasks/ }).click();
  for (const slug of ['ai', 'home', 'ready']) await continueTo(page, slug);
  await page.getByRole('button', { name: 'Enter RedSky' }).first().click();
  await page.waitForURL(/\/home\?tab=tasks$/, { timeout: 20_000 });
  await expect(page.getByRole('tab', { name: 'My Tasks', selected: true })).toBeVisible();
  await expect(page.getByText(/Your workspace is ready/)).toBeVisible();
});
