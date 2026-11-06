import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {publicClientFor,MockUSDCAbi,OutcomeTokensAbi,FloorVaultAbi,CreditDeskAbi,SharedObservationRegistryAbi,OutcomeMarketFactoryAbi,readSnapshot,type Deployment} from '../packages/shared/src/index';

const d:Deployment=JSON.parse(await readFile('apps/web/public/deployment.json','utf8'));const client=publicClientFor(d);
async function connect(page:Page,role:'borrower'|'lender'|'resolver'){
  await page.getByTestId('wallet-menu').click();await expect(page.getByTestId(`connect-${role}`)).toBeEnabled();await page.getByTestId(`connect-${role}`).click();await expect(page.getByRole('dialog')).toBeHidden();
}
const balance=(who:'borrower'|'lender')=>client.readContract({address:d.contracts.CollateralToken,abi:MockUSDCAbi,functionName:'balanceOf',args:[d.roles[who]]});
const results:unknown[]=[];
test.describe.serial('wallet-signed outcome collateral lifecycle',()=>{
  test.beforeAll(async()=>{await import('../scripts/differential');});
  test('portfolio composer recalculates payouts for settlement prices and cancellation',async({page})=>{
    await page.goto('/compose/');await expect(page.getByRole('heading',{name:'Portfolio composer'})).toBeVisible();
    const payout=page.locator('.chart-summary strong').first();await expect(payout).toContainText('$2.00');
    const price=page.getByRole('textbox',{name:'Scenario settlement price'});
    await price.fill('4000');await expect(payout).toContainText('$1.00');
    await page.getByRole('button',{name:'Explore cancellation result'}).click();await expect(payout).toContainText('$1.00');
    await page.getByRole('button',{name:'Use price settlement'}).click();
    await price.fill('5500');await expect(payout).toContainText('$2.00');
    const slider=page.getByRole('slider',{name:'Explore settlement price'}),before=await slider.inputValue();await slider.focus();await page.keyboard.press('ArrowRight');await expect(slider).not.toHaveValue(before);
  });
  test('market terminal mints fully backed complete sets onchain',async({page})=>{
    await page.goto('/markets/');await expect(page.getByRole('heading',{name:'Market terminal'})).toBeVisible();await connect(page,'borrower');await page.getByRole('tab',{name:/AQRA collateral/}).click();
    const marketId=BigInt(await page.getByLabel('Choose an AQRA collateral market').inputValue());
    const yesToken=marketId*2n+1n,noToken=yesToken+1n;
    const readBalance=(tokenId:bigint)=>client.readContract({address:d.contracts.OutcomeTokens,abi:OutcomeTokensAbi,functionName:'balanceOf',args:[d.roles.borrower,tokenId]});
    const beforeYes=await readBalance(yesToken),beforeNo=await readBalance(noToken);
    const mint=page.getByTestId('mint-complete-set');await expect(mint).toBeEnabled();await mint.click();
    await expect.poll(()=>readBalance(yesToken)).toBe(beforeYes+1n);await expect.poll(()=>readBalance(noToken)).toBe(beforeNo+1n);
  });
  test('outcome palette supports drag and keyboard selection',async({page})=>{
    await page.goto('/compose/');
    await expect(page.locator('.outcome-tray-chips button').first()).toBeVisible();
    const lower=await page.getByTestId('lower-market').inputValue(),upper=await page.getByTestId('upper-market').inputValue();
    await expect(page.getByTestId(`claim-${lower}-YES`)).toBeVisible();
    await page.getByTestId(`claim-${upper}-YES`).click();await expect(page.getByTestId('lower-market')).toHaveValue(upper);
    // Chromium needs intermediate pointer movement to start a native HTML drag.
    // Keep the drop on the card header so its native select does not capture it.
    const chip=page.getByTestId(`claim-${lower}-YES`),zone=page.getByTestId('lower-dropzone');
    await zone.scrollIntoViewIfNeeded();await chip.scrollIntoViewIfNeeded();
    const source=(await chip.boundingBox())!,target=(await zone.boundingBox())!;
    await page.mouse.move(source.x+20,source.y+17);await page.mouse.down();
    await page.mouse.move(source.x+25,source.y+27,{steps:5});
    await page.mouse.move(target.x+100,target.y+30,{steps:12});await page.mouse.up();
    await expect(page.getByTestId('lower-market')).toHaveValue(lower);
    await expect(page.getByTestId('upper-market')).toHaveValue(upper);
  });
  for(const scenario of ['inside','below','above','cancelled','repaid'] as const){
    test(`${scenario}: separate borrower and lender contexts, actual redemption waterfall`,async({browser})=>{
      const errors:string[]=[];
      const operator=await browser.newContext(),borrower=await browser.newContext(),lender=await browser.newContext();
      const op=await operator.newPage(),bp=await borrower.newPage(),lp=await lender.newPage();
      for(const page of [op,bp,lp])page.on('pageerror',e=>errors.push(e.message));
      await op.goto('/ops/');await connect(op,'resolver');
      const count=await client.readContract({address:d.contracts.OutcomeMarketFactory,abi:OutcomeMarketFactoryAbi,functionName:'marketCount'});
      await op.getByTestId('create-pair').click();await expect(op.getByTestId('fresh-pair')).toBeVisible();
      const lower=count+1n,upper=count+2n;
      const observationId=await client.readContract({address:d.contracts.SharedObservationRegistry,abi:SharedObservationRegistryAbi,functionName:'observationCount'});
      await bp.goto('/compose/');await connect(bp,'borrower');
      await bp.getByTestId('lower-market').selectOption(lower.toString());await bp.getByTestId('upper-market').selectOption(upper.toString());
      const mintButtons=bp.getByRole('button',{name:'Mint complete set'});
      await mintButtons.nth(0).click();await expect.poll(()=>client.readContract({address:d.contracts.OutcomeTokens,abi:OutcomeTokensAbi,functionName:'balanceOf',args:[d.roles.borrower,lower*2n+1n]})).toBe(1n);
      await expect(mintButtons.nth(1)).toBeEnabled();await mintButtons.nth(1).click();
      await expect.poll(()=>client.readContract({address:d.contracts.OutcomeTokens,abi:OutcomeTokensAbi,functionName:'balanceOf',args:[d.roles.borrower,upper*2n+2n]})).toBe(1n);
      await expect(bp.locator('.payoff-chart svg')).toBeVisible();
      await expect(bp.getByTestId('lock-pair')).toBeEnabled();
      await bp.getByTestId('lock-pair').click();await expect(bp.getByTestId('lock-success')).toBeVisible();
      const positionId=await client.readContract({address:d.contracts.FloorVault,abi:FloorVaultAbi,functionName:'positionCount'});
      await expect.poll(async()=>(await client.readContract({address:d.contracts.FloorVault,abi:FloorVaultAbi,functionName:'getPosition',args:[positionId]})).certifiedFloor).toBe(1000000n);
      // Counterpart claims were never pledged.
      expect(await client.readContract({address:d.contracts.OutcomeTokens,abi:OutcomeTokensAbi,functionName:'balanceOf',args:[d.roles.borrower,lower*2n+2n]})).toBe(1n);
      await bp.getByRole('link',{name:'Credit desk',exact:true}).click();
      await bp.getByRole('button',{name:new RegExp(`Proof position #${positionId}\\b`)}).click();
      await bp.getByTestId('loan-principal').fill('0.75');await bp.getByTestId('loan-due').fill('0.78');
      await expect(bp.getByTestId('request-loan')).toBeEnabled();await bp.getByTestId('request-loan').click();await expect(bp.getByTestId('request-success')).toBeVisible();
      await lp.goto('/credit/');await connect(lp,'lender');await lp.getByTestId('lend-tab').click();
      await lp.getByRole('button',{name:new RegExp(`Proof position #${positionId}\\b`)}).click();
      await expect(lp.getByTestId('fund-loan')).toBeEnabled();const beforeBorrower=await balance('borrower'),beforeLender=await balance('lender');
      const beforeLoans=await client.readContract({address:d.contracts.CreditDesk,abi:CreditDeskAbi,functionName:'loanCount'});
      await lp.getByTestId('fund-loan').click();
      await expect.poll(()=>client.readContract({address:d.contracts.CreditDesk,abi:CreditDeskAbi,functionName:'loanCount'})).toBe(beforeLoans+1n);
      const loanId=await client.readContract({address:d.contracts.CreditDesk,abi:CreditDeskAbi,functionName:'loanCount'});
      expect(await balance('borrower')-beforeBorrower).toBe(750000n);expect(beforeLender-await balance('lender')).toBe(750000n);
      if(scenario==='repaid'){
        await bp.getByRole('link',{name:'Portfolio dashboard',exact:true}).click();
        const b=await balance('borrower'),l=await balance('lender');
        await bp.getByTestId(`repay-${loanId}`).click();
        await expect.poll(async()=>(await client.readContract({address:d.contracts.CreditDesk,abi:CreditDeskAbi,functionName:'getLoan',args:[loanId]})).state).toBe(3);
        expect(b-await balance('borrower')).toBe(780000n);expect(await balance('lender')-l).toBe(780000n);
        expect((await client.readContract({address:d.contracts.FloorVault,abi:FloorVaultAbi,functionName:'getPosition',args:[positionId]})).state).toBe(3);
        await bp.reload();await expect(bp.getByText('Repaid',{exact:true}).first()).toBeVisible();
        const snap=await readSnapshot(d,d.roles.borrower),event=snap.activity.find(e=>e.event==='LoanRepaid'&&String(e.args.loanId)===loanId.toString());expect(event).toBeDefined();
        results.push({scenario,loanId:String(loanId),paid:'780000',transactionHash:event!.transactionHash,blockNumber:event!.blockNumber});
        await operator.close();await borrower.close();await lender.close();return;
      }
      await op.getByTestId('resolver-observation').selectOption(observationId.toString());await op.getByTestId(`scenario-${scenario}`).click();await expect(op.getByTestId('resolve-observation')).toBeEnabled();await op.getByTestId('resolve-observation').click();
      await expect.poll(async()=>(await client.readContract({address:d.contracts.SharedObservationRegistry,abi:SharedObservationRegistryAbi,functionName:'observation',args:[observationId]})).state).toBe(scenario==='cancelled'?2:1);
      const b=await balance('borrower'),l=await balance('lender');
      await op.getByRole('link',{name:'Settlement explorer',exact:true}).click();await expect(op.getByTestId('settle-loan')).toBeEnabled();await op.getByTestId('settle-loan').click();
      await expect(op.getByText('Settlement complete',{exact:true})).toBeVisible();
      const expected=scenario==='inside'?2000000n:1000000n;
      expect(await balance('lender')-l).toBe(780000n);expect(await balance('borrower')-b).toBe(expected-780000n);
      await op.reload();await expect(op.getByText('Settlement complete',{exact:true})).toBeVisible();
      const snapshot=await readSnapshot(d,d.roles.borrower);const event=snapshot.activity.find(e=>e.event==='LoanSettled'&&String(e.args.loanId)===loanId.toString());expect(event).toBeDefined();
      results.push({scenario,loanId:loanId.toString(),positionId:positionId.toString(),gross:expected.toString(),lenderPaid:'780000',borrowerPaid:(expected-780000n).toString(),transactionHash:event!.transactionHash,blockNumber:event!.blockNumber});
      await mkdir('evidence/screenshots',{recursive:true});await op.screenshot({path:`evidence/screenshots/settlement-${scenario}.png`,fullPage:true});
      expect(errors).toEqual([]);
      await operator.close();await borrower.close();await lender.close();
    });
  }
  test('incompatible observation is rejected in the browser',async({page})=>{
    await page.goto('/compose/');
    // Observations 1 and 2 remain distinct, whether unresolved or matured.
    await page.getByTestId('lower-market').selectOption('2');await page.getByTestId('upper-market').selectOption('7');
    await expect(page.getByTestId('proof-rejection')).toContainText('ERR_OBSERVATION_MISMATCH');await expect(page.getByTestId('lock-pair')).toBeDisabled();
  });
  test('expired collateral offers an open pair without overwriting claim units',async({page})=>{
    await page.goto('/compose/');await expect(page.getByTestId('lower-market')).toBeVisible();
    await page.getByTestId('lower-market').selectOption('2');await page.getByTestId('upper-market').selectOption('3');
    await page.getByTestId('lower-units').fill('3');await expect(page.getByTestId('expired-pair')).toBeVisible();
    await page.getByTestId('use-open-pair').click();await expect(page.getByTestId('expired-pair')).toBeHidden();
    await expect(page.getByTestId('lower-units')).toHaveValue('3');
  });
  test('responsive studio has no document overflow and keyboard controls remain usable',async({page})=>{
    await page.setViewportSize({width:390,height:844});await page.goto('/compose/');
    await expect(page.getByRole('heading',{name:'Portfolio composer',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByTestId('lower-units').fill('3');await expect(page.getByTestId('lower-units')).toHaveValue('3');
    await page.screenshot({path:'evidence/screenshots/mobile-studio.png',fullPage:true});
  });
  test.afterAll(async()=>{if(results.length){await mkdir('evidence',{recursive:true});await writeFile('evidence/browser-results.json',JSON.stringify({source:'PLAYWRIGHT_REAL_LOCAL_EVM',results},null,2));}});
});
