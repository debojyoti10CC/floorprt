import { expect, test } from '@playwright/test';

test('replay exposes captured cohorts and the lending book reads request IDs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trader credit', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Paper lender result' })).toBeVisible();
  await expect(page.locator('.trader-trajectory svg')).toBeVisible();
  await expect(page.getByText('-$1,001.15', { exact: true })).toBeVisible();
  await page.getByLabel('Decision month').selectOption('2026-07');
  await page.getByLabel('Selection policy').selectOption('tail10');
  await expect(page.getByText('1/1 · 3 wallets', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wallet evidence' })).toBeVisible();
  await page.getByLabel('Selection policy').selectOption('tail100');
  await expect(page.getByText('No matching wallets in this cutoff and policy.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Lend', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lending book' })).toBeVisible();
  await page.getByLabel('Request ID').fill('999999');
  await page.getByRole('button', { name: 'Find request' }).click();
  await expect(page.getByText('No request with that ID.')).toBeVisible();
});
