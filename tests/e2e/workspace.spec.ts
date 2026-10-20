import { expect, test, type Page } from '@playwright/test';

async function signInToWorkspace(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /Eleanor Vance/ }).click();
  await page.waitForURL(/\/(home|onboarding)/);
  const origin = new URL(page.url()).origin;
  if (page.url().includes('/onboarding')) {
    for (let step = 1; step <= 8; step += 1) await page.request.put('/api/onboarding', { data: { step }, headers: { Origin: origin } });
    await page.request.post('/api/onboarding/complete', { headers: { Origin: origin } });
  }
  await page.request.patch('/api/me/preferences', { data: { resetLayout: true, landing: 'brief' }, headers: { Origin: origin } });
  await page.goto('/home');
}

test('home layout changes persist across reloads', async ({ page }) => {
  await signInToWorkspace(page);
  await expect(page.getByRole('region', { name: 'Needs Your Attention' })).toBeVisible();
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Needs Your Attention' }).click();
  await expect(page.getByRole('region', { name: 'Needs Your Attention' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await page.reload();
  await expect(page.getByRole('region', { name: 'Daily Brief' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Needs Your Attention' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.getByRole('button', { name: 'Reset to recommended' }).click();
  await expect(page.getByRole('region', { name: 'Needs Your Attention' })).toBeVisible();
});

test('command palette searches records and opens a preview', async ({ page }) => {
  await signInToWorkspace(page);
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('Ridgeline');
  await palette.getByText('Ridgeline Grid Storage').first().click();
  await expect(page.getByRole('dialog', { name: /Record preview|Ridgeline/ })).toBeVisible();
});

test('RedSky AI answers with cited sources', async ({ page }) => {
  await signInToWorkspace(page);
  await page.keyboard.press('ControlOrMeta+j');
  const input = page.getByRole('textbox', { name: /Ask RedSky/ });
  await input.fill('What decisions are waiting on me?');
  await input.press('Enter');
  await expect(page.getByText(/Simulated/).first()).toBeVisible();
  await expect(page.getByText(/^Sources/).first()).toBeVisible();
});
