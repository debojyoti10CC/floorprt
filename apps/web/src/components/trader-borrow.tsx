'use client';

import { useState } from 'react';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { isAddress, zeroHash, type Address as EvmAddress, type Hex } from 'viem';
import { parseAmount } from '@floor/proof-engine';
import type { Evidence } from '../../../../services/underwriting/policy';
import { linkContext } from '../../../../services/underwriting/reports';
import { short, useProtocol } from '../lib/protocol';
import { approveTraderCredit, sameWallet, traderDesk, underwritingApi, type EnsGroup } from '../lib/trader-credit';
import { eventArgs, useAction } from './actions';
import { usd } from './trader-replay';
import { Address, Badge, Button, Panel } from './ui';

type WalletProof = { trader: EvmAddress; controller: EvmAddress; digest: Hex; signature: string };
type Consent = { borrower: EvmAddress; desk: EvmAddress; nonce: bigint; expires: bigint; proofs: WalletProof[] };

function loanTerms(principalText: string, bondText: string, daysText: string) {
  try {
    const principal = parseAmount(principalText);
    const bond = parseAmount(bondText);
    const days = Number(daysText);
    const due = principal * 10_200n / 10_000n;
    if (principal <= 0n || principal > 100_000_000n || bond < (principal + 3n) / 4n || bond > due
      || !Number.isInteger(days) || days < 1 || days > 30) return null;
    return { principal, due, bond, termSeconds: days * 86400 };
  } catch {
    return null;
  }
}

export function TraderBorrow({ onRequest }: { onRequest: (id: bigint) => void }) {
  const p = useProtocol();
  const action = useAction();
  const [input, setInput] = useState('');
  const [identity, setIdentity] = useState<EnsGroup | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [controllerInput, setControllerInput] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState<Consent | null>(null);
  const [principal, setPrincipal] = useState('100');
  const [bond, setBond] = useState('25');
  const [days, setDays] = useState('30');
  const terms = loanTerms(principal, bond, days);
  const wallet = p.address;
  const canBorrow = p.walletReady && !!p.deployment?.contracts.TraderCreditDesk && (!identity || sameWallet(identity.primary, wallet));
  const links = (evidence?.wallets ?? []).map(value => ({
    trader: value as EvmAddress,
    controller: (controllerInput[value]?.trim() ?? value).toLowerCase() as EvmAddress,
  }));
  const validControllers = links.every(link => isAddress(link.controller, { strict: false }));
  const others = links.filter(link => !sameWallet(link.controller, wallet));
  const isPrepared = !!consent && sameWallet(consent.borrower, wallet) && sameWallet(consent.desk, p.deployment?.contracts.TraderCreditDesk);
  const signaturesReady = isPrepared && consent.proofs.every(proof => /^0x(?:[a-f0-9]{2}){1,512}$/i.test(proof.signature.trim()));

  const getEvidence = async () => {
    setEvidence(null);
    setControllerInput({});
    setConsent(null);
    setIdentity(null);
    const query = input.trim();
    const group = query.toLowerCase().endsWith('.eth')
      ? await underwritingApi<EnsGroup>('/identity?' + new URLSearchParams({ name: query })) : null;
    const wallets = group?.wallets ?? (query ? query.split(/[\s,]+/) : wallet ? [wallet] : []);
    if (!wallets.length || wallets.length > 4 || wallets.some(address => !isAddress(address, { strict: false }))) {
      throw new Error('Enter a .eth name or one to four distinct EVM addresses.');
    }
    setIdentity(group);
    const params = new URLSearchParams();
    for (const address of wallets) params.append('wallet', address);
    setEvidence(await underwritingApi<Evidence>('/evidence?' + params));
  };

  const prepare = async () => {
    if (!canBorrow || !wallet || !evidence?.decision.qualified || !validControllers) {
      throw new Error('Connect the borrower wallet, load eligible evidence, and enter valid controller addresses.');
    }
    const { client, contract, block, address } = await traderDesk(p);
    const nonce = await client.readContract({ ...contract, functionName: 'nextNonce', args: [wallet] });
    const expires = block.timestamp + 3600n;
    const context = linkContext(evidence, identity?.node ?? zeroHash, expires);
    const proofs = await Promise.all(others.map(async ({ trader, controller }) => {
      const digest = await client.readContract({ ...contract, functionName: 'linkDigest', args: [wallet, trader, context, nonce] });
      return { trader, controller, digest, signature: '' };
    }));
    setConsent({ borrower: wallet, desk: address, nonce, expires, proofs });
  };

  const setSignature = (trader: EvmAddress, signature: string) => setConsent(current => current && ({
    ...current, proofs: current.proofs.map(proof => proof.trader === trader ? { ...proof, signature } : proof),
  }));

  const sign = async (proof: WalletProof) => {
    if (!window.ethereum) throw new Error('Use a browser wallet to sign the consent digest.');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as EvmAddress[];
    if (!sameWallet(accounts[0], proof.controller)) throw new Error('Select ' + short(proof.controller) + ' in the browser wallet.');
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [proof.digest, proof.controller] }) as Hex;
    setSignature(proof.trader, signature);
  };

  const request = async () => {
    if (!wallet || !canBorrow || !terms || !evidence?.decision.qualified || !validControllers) throw new Error('Review the borrower, evidence and loan terms.');
    const { client, contract, block, active } = await traderDesk(p);
    const asOf = BigInt(evidence.asOf);
    if (block.timestamp < asOf || block.timestamp >= asOf + 35n * 86400n) throw new Error('The evidence is outside the funding window.');
    const traders = evidence.wallets as EvmAddress[];
    const controllers = links.map(link => link.controller);
    const activeIds = await Promise.all([...new Set([wallet, ...traders, ...controllers])].map(active));
    if (activeIds.some(id => id > 0n)) throw new Error('A borrower or linked wallet already has an active request.');
    if (others.length) {
      const nonce = await client.readContract({ ...contract, functionName: 'nextNonce', args: [wallet] });
      if (!isPrepared || !signaturesReady || consent.expires <= block.timestamp || consent.nonce !== nonce) {
        throw new Error('Prepare and sign a fresh consent for each linked trader wallet.');
      }
      for (const proof of consent.proofs) {
        if (!await client.verifyMessage({ address: proof.controller, message: { raw: proof.digest }, signature: proof.signature.trim() as Hex })) {
          throw new Error('Consent signature does not match ' + short(proof.controller) + '.');
        }
      }
    }
    const proxies = links.filter(link => !sameWallet(link.trader, link.controller));
    await Promise.all(proxies.map(link => underwritingApi('/controller?' + new URLSearchParams(link))));
    const consents = links.map(({ trader, controller }) => sameWallet(controller, wallet) ? '0x' : consent!.proofs.find(proof => proof.trader === trader)!.signature.trim());
    const args = [{
      ...terms, asOf, evidenceDigest: evidence.digest, ensNode: identity?.node ?? zeroHash,
      linkExpires: others.length ? consent!.expires : block.timestamp + 3600n,
    }, traders];
    await approveTraderCredit(p, terms.bond);
    const receipt = await p.transact('Escrow bond and request trader credit', 'TraderCreditDesk',
      proxies.length ? 'requestLoanWithControllers' : 'requestLoan',
      proxies.length ? [...args, controllers, consents] : [...args, consents]);
    const id = eventArgs(receipt, 'TraderCreditDesk', 'TraderCreditRequested').loanId as bigint;
    setConsent(null);
    onRequest(id);
  };

  return <div className="trader-loan-layout">
    <Panel title="Polymarket account history" eyebrow="PUBLIC WALLET DATA · READ ONLY">
      <div className="trader-panel-body">
        <p className="trader-note">Enter the Polymarket proxy/account address used for trading, or an ENS name that resolves to it. This reads public history; it does not sign in to Polymarket, move positions, or pledge them as collateral.</p>
        <form className="trader-form" onSubmit={event => { event.preventDefault(); void action.run(getEvidence); }}>
          <label className="trader-field">Polymarket account address or ENS name
            <input value={input} placeholder={wallet ?? 'name.eth or 0x…'} maxLength={255} disabled={action.busy}
              onChange={event => { setInput(event.target.value); setEvidence(null); setConsent(null); setIdentity(null); action.setError(null); }} />
          </label>
          <Button type="submit" variant="secondary" disabled={action.busy || (!input.trim() && !wallet)}><Fingerprint size={15} /> {action.busy ? 'Working…' : 'Check wallet history'}</Button>
        </form>
        {identity && <div className="trader-inline"><Badge tone="blue">{identity.name}</Badge><Address value={identity.primary} /><span className="trader-note">ENS block {identity.block}</span></div>}
        {evidence && <>
          <div className="trader-inline"><Badge tone={evidence.decision.qualified ? 'green' : 'amber'}>{evidence.decision.qualified ? 'Meets performance policy' : 'Below performance policy'}</Badge>
            <strong className="mono">{evidence.decision.score}/100</strong><span className="trader-note">{evidence.decision.reason}</span></div>
          <div className="trader-inline">{evidence.wallets.map(address => <Address value={address} key={address} />)}</div>
          <dl className="trader-metrics">
            <div><dt>Evidence as of</dt><dd>{new Date(evidence.asOf * 1000).toISOString().slice(0, 10)}</dd></div>
            <div><dt>Active months</dt><dd>{evidence.decision.activeMonths}/3</dd></div>
            <div><dt>Positive months</dt><dd>{evidence.decision.positiveMonths}/{evidence.decision.activeMonths}</dd></div>
            <div><dt>Active-window realized P&amp;L</dt><dd>{usd(evidence.decision.pnl)}</dd></div>
            <div><dt>Trading turnover</dt><dd>{usd(evidence.decision.turnover)}</dd></div>
            <div><dt>Realized efficiency</dt><dd>{(evidence.decision.efficiencyBps / 100).toFixed(2)}%</dd></div>
            <div><dt>Drawdown / turnover</dt><dd>{(evidence.decision.drawdownBps / 100).toFixed(2)}%</dd></div>
            <div><dt>Wallets in group</dt><dd>{evidence.wallets.length}</dd></div>
          </dl>
          <p className="trader-note">Score components · consistency {evidence.decision.components.consistency}/40 · efficiency {evidence.decision.components.efficiency}/35 · drawdown {evidence.decision.components.drawdown}/25</p>
          <p className="trader-note">These metrics determine pilot eligibility, not loan pricing or repayment probability. A separate lender decides whether to fund.</p>
          {wallet && identity && !sameWallet(identity.primary, wallet) && <p className="trader-note" role="status">Connect {short(identity.primary)} to borrow under this name.</p>}
          {evidence.decision.qualified && <details className="trader-method">
            <summary>Trading proxy controllers</summary>
            <div className="trader-form">
              {links.map(link => <label key={link.trader} className="trader-field">Signing wallet for {short(link.trader)}
                <input value={controllerInput[link.trader] ?? link.trader} maxLength={42} disabled={action.busy}
                  onChange={event => {
                    setConsent(null);
                    setControllerInput(current => ({ ...current, [link.trader]: event.target.value }));
                  }} />
              </label>)}
            </div>
          </details>}
          {evidence.decision.qualified && (others.length > 0 || consent) && <>
            {others.length > 0 && <Button variant="secondary" disabled={!canBorrow || !validControllers || action.busy} onClick={() => void action.run(prepare)}>Prepare wallet consents</Button>}
            {consent && <div className="trader-loan-list">
              {consent.proofs.map(proof => <div className="trader-loan-card" key={proof.trader}>
                <div className="trader-inline"><Address value={proof.controller} /><span className="trader-note">Sign this digest</span><Address value={proof.digest} /></div>
                <label className="trader-field">Consent signature for {short(proof.trader)}
                  <input placeholder="0x…" value={proof.signature} maxLength={1026} disabled={action.busy} onChange={event => setSignature(proof.trader, event.target.value)} />
                </label>
                <Button variant="ghost" disabled={action.busy} onClick={() => void action.run(() => sign(proof))}>Sign with browser wallet</Button>
              </div>)}
              {!isPrepared && <p className="trader-note">Switch back to {short(consent.borrower)} to submit the request.</p>}
            </div>}
          </>}
        </>}
        {action.error && <div className="error-box" role="alert">{action.error}</div>}
      </div>
    </Panel>
    <Panel title="Request terms" eyebrow="FIRST-LOSS BOND">
      <div className="trader-panel-body">
        <div className="trader-controls">
          <label>Principal · USDC<input inputMode="decimal" value={principal} onChange={event => setPrincipal(event.target.value)} disabled={action.busy} /></label>
          <label>Bond · USDC<input inputMode="decimal" value={bond} onChange={event => setBond(event.target.value)} disabled={action.busy} /></label>
          <label>Term · days<input type="number" min={1} max={30} value={days} onChange={event => setDays(event.target.value)} disabled={action.busy} /></label>
        </div>
        <dl className="trader-metrics">
          <div><dt>Repayment</dt><dd>{usd(terms?.due)}</dd></div>
          <div><dt>Shortfall after full bond recovery</dt><dd className="trader-loss">{usd(terms ? terms.principal > terms.bond ? terms.principal - terms.bond : 0n : null)}</dd></div>
        </dl>
        {!terms && <p className="trader-note">Enter up to 100 USDC, a bond of 25% to 102% of principal, and a term of 1 to 30 days.</p>}
        {!wallet && <p className="trader-note">Connect the borrower wallet to sign.</p>}
        <Button disabled={action.busy || !canBorrow || !terms || !validControllers || !evidence?.decision.qualified || (others.length > 0 && !signaturesReady)}
          onClick={() => void action.run(request)}><ShieldCheck size={15} /> Escrow bond and request</Button>
      </div>
    </Panel>
  </div>;
}
