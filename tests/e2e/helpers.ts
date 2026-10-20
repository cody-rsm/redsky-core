import { expect, type Page } from '@playwright/test';

// Signs in with the development-only persona sign-in and returns onboarding to step 1 so each test starts clean.
export async function signInFresh(page: Page, persona: RegExp) {
  await page.goto('/login');
  await page.getByRole('button', { name: persona }).click();
  await page.waitForURL(/\/(home|onboarding)/);
  const response = await page.request.post('/api/onboarding/restart', { headers: { Origin: new URL(page.url()).origin } });
  expect(response.ok()).toBeTruthy();
  await page.goto('/onboarding/welcome');
}

export async function continueTo(page: Page, slug: string) {
  await page.getByRole('button', { name: /^(Continue|Finish setup)/ }).click();
  await page.waitForURL(new RegExp(`/onboarding/${slug}$`));
}
