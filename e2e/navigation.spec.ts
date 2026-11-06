import {test,expect} from '@playwright/test';

test('the seven terminal destinations are connected from the sidebar',async({page})=>{
  await page.goto('/');
  const navigation=page.getByRole('navigation',{name:'Main navigation'});
  await expect(navigation.getByRole('link')).toHaveCount(7);
  const screens=[
    ['Outcome graph','Outcome graph'],
    ['Portfolio composer','Portfolio composer'],
    ['Proof inspector','Proof inspector'],
    ['Credit desk','Credit desk'],
    ['Portfolio dashboard','Portfolio dashboard'],
    ['Settlement explorer','Settlement explorer'],
    ['Market terminal','Market terminal'],
  ] as const;
  for(const [link,title] of screens){await navigation.getByRole('link',{name:link,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible()}
});
