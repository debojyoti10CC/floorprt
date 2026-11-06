import { expect, test } from '@playwright/test';

test('Lend reads the early liquidation and exact recovery from the local chain', async ({ page }) => {
  test.skip(process.env.AQRA_E2E_MARGIN !== 'true', 'Requires a successful pnpm cre:margin:demo run and its local chain.');
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Credit desk navigation' }).getByRole('button', { name: 'Lend', exact: true }).click();
  const replay = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'CRE liquidation replay' }) });
  await expect(replay.getByText('69.76% LTV', { exact: true })).toBeVisible();
  await expect(replay.getByText('406.05% LTV', { exact: true })).toBeVisible();
  await expect(replay.getByText('$51.00 tUSDC', { exact: true })).toBeVisible();
  await expect(replay.getByText('Full debt recovered', { exact: true })).toBeVisible();
  await expect(replay.getByRole('button', { name: 'Early liquidation' })).toHaveAttribute('title', /0x[\da-f]{64}/i);
});
