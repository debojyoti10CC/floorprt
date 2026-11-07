import { expect, test } from '@playwright/test';

test('Lend reads the early liquidation and exact recovery from the lending chain', async ({ page }) => {
  const arc = process.env.AQRA_E2E_ARC === 'true';
  test.skip(!arc && process.env.AQRA_E2E_MARGIN !== 'true', 'Requires the Arc profile or a local CRE replay.');
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Credit desk navigation' }).getByRole('button', { name: 'Lend', exact: true }).click();
  const replay = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'CRE liquidation replay' }) });
  await expect(replay.getByText('69.76% LTV', { exact: true })).toBeVisible();
  await expect(replay.getByText('406.05% LTV', { exact: true })).toBeVisible();
  await expect(replay.getByText(arc ? '$1.02 tUSDC' : '$51.00 tUSDC', { exact: true })).toBeVisible();
  await expect(replay.getByText('Full debt recovered', { exact: true })).toBeVisible();
  if (arc) {
    await expect(replay.getByRole('link', { name: 'Early liquidation' })).toHaveAttribute(
      'href', /^https:\/\/explorer\.testnet\.arc\.io\/tx\/0x[\da-f]{64}$/i,
    );
    await expect(replay.getByRole('link', { name: 'Shares released' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Credit desk navigation' }).getByRole('button', { name: 'Borrow', exact: true }).click();
    await page.getByRole('button', { name: 'Positions + bond' }).click();
    await expect(page.getByText('ARC TESTNET', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load test borrower' })).toHaveCount(0);
  } else {
    await expect(replay.getByRole('button', { name: 'Early liquidation' })).toHaveAttribute('title', /0x[\da-f]{64}/i);
  }
});
