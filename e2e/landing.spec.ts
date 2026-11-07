import { test, expect } from '@playwright/test';

test('landing explains the current pilot and links to the existing app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('FOR TRADERSWITH ATRACK RECORD.');
  await expect(page.getByText('LOCAL / TESTNET PROTOTYPE · TEST FUNDS ONLY')).toBeVisible();
  await expect(page.getByText('Evidence is not collateral.', { exact: true })).toBeVisible();
  await expect(page.getByText(/A lender can lose principal beyond/)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Landing navigation' }).getByRole('link', { name: 'Whitepaper' })).toHaveAttribute('href', '/whitepaper/');
  await page.getByRole('link', { name: 'Launch app' }).click();
  await expect(page).toHaveURL(/\/underwriting\//);
  await expect(page.getByRole('navigation', { name: 'Credit desk navigation' })).toBeVisible();
});

test('native keyboard navigation and explanation anchor work', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#landing-main$/);
  const howLink = page.getByRole('link', { name: 'How it works' });
  await howLink.focus();
  await expect(howLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole('heading', { name: /A track record is a starting point/ })).toBeInViewport();
});

test('desktop and small screens have no horizontal overflow', async ({ page }) => {
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`).toBe(true);
    await expect(page.getByRole('link', { name: 'Launch app' })).toBeVisible();
  }
});

test('scroll walkthrough tracks chapters and exposes both illustrative outcomes', async ({ page }) => {
  await page.goto('/');
  const visual = page.getByTestId('story-visual');
  for (let index = 0; index < 5; index++) {
    await page.locator(`#aqra-chapter-${index}`).scrollIntoViewIfNeeded();
    await expect(visual).toHaveAttribute('data-stage', String(index));
    await expect(page.getByRole('navigation', { name: 'Product walkthrough chapters' }).getByRole('button').nth(index)).toHaveAttribute('aria-current', 'step');
  }
  await page.getByRole('button', { name: 'Matured default', exact: true }).click();
  await expect(visual.getByText('Lender principal shortfall', { exact: true })).toBeVisible();
  await expect(visual.getByText('$75', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Full repayment', exact: true }).click();
  await expect(visual.getByText('Bond returned to borrower', { exact: true })).toBeVisible();
  await expect(visual.getByText('$102', { exact: true })).toBeVisible();
  const discover = page.getByRole('navigation', { name: 'Product walkthrough chapters' }).getByRole('button', { name: /Discover/ });
  await discover.focus();
  await page.keyboard.press('Enter');
  await expect(visual).toHaveAttribute('data-stage', '0');
});

test('research context and accessible FAQ are complete', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Less folklore/ })).toBeVisible();
  await expect(page.getByText('Largest monthly P&L', { exact: true })).toBeVisible();
  const question = page.locator('summary').filter({ hasText: 'What can a lender lose?' });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details[open]')).toContainText('lose $75 of principal');
  await expect(page.locator('details[open]')).toContainText('not guaranteed');
});

test('mobile walkthrough remains usable and full page fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#aqra-chapter-4').scrollIntoViewIfNeeded();
  const visual = page.getByTestId('story-visual');
  await expect(visual).toHaveAttribute('data-stage', '4');
  await page.getByRole('button', { name: 'Matured default', exact: true }).click();
  await expect(visual.getByText('$75', { exact: true })).toBeVisible();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `full-page overflow at ${width}px`).toBe(true);
  }
});

test('reduced motion disables decorative animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const animations = await page.locator('main svg').evaluateAll(elements => elements.map(el => getComputedStyle(el).animationName));
  expect(animations.every(name => name === 'none')).toBe(true);
});
