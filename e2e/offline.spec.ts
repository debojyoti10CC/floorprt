import {test,expect} from '@playwright/test';
test('recorded evidence loads promptly without RPC and cannot authorize wallet writes',async({page})=>{
  await page.route('http://127.0.0.1:8545/**',route=>route.abort());
  await page.route('http://127.0.0.1:8545',route=>route.abort());
  await page.goto('/');
  await expect(page.getByText('RECORDED DEVNET RUN',{exact:true})).toBeVisible({timeout:10000});
  await expect(page.getByTestId('payoff-surface')).toBeVisible();
  await page.getByTestId('overview-above').click();await expect(page.getByTestId('overview-scenario-payout')).toContainText('$1.00');
  await page.getByRole('link',{name:'Portfolio studio',exact:true}).click();
  await expect(page.getByTestId('lock-pair')).toBeDisabled();
  await expect(page.getByText('Preview calculation',{exact:true})).toBeVisible();
});
