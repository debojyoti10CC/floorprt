import {test,expect} from '@playwright/test';
test('chain-dependent collateral actions stay unavailable without a live RPC',async({page})=>{
  await page.route('http://127.0.0.1:8545/**',route=>route.abort());
  await page.route('http://127.0.0.1:8545',route=>route.abort());
  await page.goto('/markets/');
  await expect(page.getByRole('heading',{name:'Market terminal'})).toBeVisible();
  await expect(page.locator('.network-card')).toHaveAttribute('aria-label','AQRA network unavailable',{timeout:10000});
  await page.getByRole('tab',{name:/AQRA collateral/}).click();
  await expect(page.getByText('No AQRA market selected')).toBeVisible();
  await page.getByRole('link',{name:'Portfolio composer',exact:true}).click();
  await expect(page.getByTestId('lock-pair')).toBeDisabled();
  await expect(page.getByText('Chain data unavailable',{exact:true})).toBeVisible();
  await expect(page.getByText(/Illustrative ETH/)).toHaveCount(0);
});
