import {test,expect} from '@playwright/test';
test('Kimia foundations, contrast, keyboard chart and wallet focus are usable',async({page})=>{
  await page.goto('/');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(0, 0, 0)');
  await expect(page.locator('body')).toHaveCSS('font-family',/Poppins/);
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.fonts.check('400 16px Poppins'))).toBe(true);
  const ratios=await page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement);
    const rgb=(token:string)=>{const raw=style.getPropertyValue(token).trim().replace('#','');return [0,2,4].map(i=>parseInt(raw.slice(i,i+2),16)/255)};
    const luminance=(c:number[])=>c.map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
    const ratio=(a:string,b:string)=>{const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    return {textRaised:ratio('--color-text-secondary','--color-surface-raised'),textMuted:ratio('--color-text-secondary','--color-surface-muted'),accentText:ratio('--color-on-accent','--color-accent'),control:ratio('--color-border-interactive','--color-surface-muted'),focus:ratio('--color-accent','--color-surface-raised')};
  });
  expect(ratios.textRaised).toBeGreaterThanOrEqual(4.5);expect(ratios.textMuted).toBeGreaterThanOrEqual(4.5);expect(ratios.accentText).toBeGreaterThanOrEqual(4.5);expect(ratios.control).toBeGreaterThanOrEqual(3);expect(ratios.focus).toBeGreaterThanOrEqual(3);
  const svg=page.getByTestId('payoff-surface').locator('svg');await svg.focus();const before=await svg.locator('polygon').first().getAttribute('points');await svg.press('ArrowRight');expect(await svg.locator('polygon').first().getAttribute('points')).not.toBe(before);
  const menu=page.getByTestId('wallet-menu');await menu.click();await expect(page.getByRole('button',{name:'Close wallet dialog'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();await expect(menu).toBeFocused();
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.getByRole('link',{name:'Open portfolio studio'}).evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
});
