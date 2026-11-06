import { custom, http, type Address, type Hex } from 'viem';
import { createPublicClient, createWalletClient, defineSchema, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { and, eq } from '@arkiv-network/sdk/query';
import { addr, str, u64 } from '@arkiv-network/sdk/schema';
import { sameWallet, type TraderLoan } from './trader-credit';

const tag = 'aqra.trader.credit.v2';
const packets = defineSchema(tag, {
  app: str().indexed(),
  lendingChain: u64().indexed(),
  desk: addr().indexed(),
  loanId: u64().indexed(),
  score: u64().indexed(),
  fundBy: u64().indexed(),
  asOf: u64(),
  evidence: str(),
  group: str(),
  reportRef: str(),
  reportHash: str(),
});
const rabdiChain = rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? '' });
const RECORD_RETENTION_SECONDS = 90 * 24 * 60 * 60;
export const arkivExplorer = rabdiChain.blockExplorers.default.url;

export async function readPackets(chainId: number, desk: Address) {
  const client = createPublicClient({ chain: rabdiChain, transport: http(undefined, { timeout: 6000, retryCount: 0 }) });
  const result = await client.select({
    $key: true, $owner: true, loanId: true, score: true, fundBy: true, asOf: true, evidence: true, group: true,
    reportRef: true, reportHash: true,
  }).from(packets).where(and(eq('app', tag), eq('lendingChain', u64(BigInt(chainId))), eq('desk', addr(desk)))).limit(60).fetch();
  return result.entities;
}

async function readLoanPackets(chainId: number, desk: Address, id: bigint) {
  const client = createPublicClient({ chain: rabdiChain, transport: http(undefined, { timeout: 6000, retryCount: 0 }) });
  const result = await client.select({
    $key: true, $owner: true, loanId: true, score: true, fundBy: true, asOf: true, evidence: true, group: true,
    reportRef: true, reportHash: true,
  }).from(packets).where(and(
    eq('app', tag), eq('lendingChain', u64(BigInt(chainId))), eq('desk', addr(desk)), eq('loanId', u64(id)),
  )).limit(10).fetch();
  return result.entities;
}

export type ArkivPacket = Awaited<ReturnType<typeof readPackets>>[number];
export function packetMatches(packet: ArkivPacket, loan: TraderLoan, now: bigint) {
  return loan.state === 1 && loan.score >= 60 && loan.fundBy > now
    && sameWallet(packet.$owner, loan.borrower)
    && packet.score.value === BigInt(loan.score)
    && packet.fundBy.value === loan.fundBy && packet.asOf.value === loan.terms.asOf
    && packet.evidence.value.toLowerCase() === loan.terms.evidenceDigest.toLowerCase()
    && packet.group.value.toLowerCase() === loan.walletSetHash.toLowerCase()
    && /^[0-9a-f]{64}$/i.test(packet.reportRef.value)
    && /^[0-9a-f]{64}$/i.test(packet.reportHash.value);
}

export type AssessmentPointer = { reference: string; sha256: string };

export async function publishPacket(chainId: number, desk: Address, id: bigint, loan: TraderLoan, report: AssessmentPointer) {
  const provider = window.ethereum;
  if (!provider) throw new Error('Connect the borrower’s browser wallet to publish on Rabdi.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as Address[];
  if (!sameWallet(accounts[0], loan.borrower)) throw new Error('Select the same borrower wallet that owns the request.');
  const originalChainId = Number(BigInt(await provider.request({ method: 'eth_chainId' }) as string));
  if (loan.state !== 1 || loan.score < 60 || loan.fundBy <= BigInt(Math.floor(Date.now() / 1000) + 60)) {
    throw new Error('Only attested requests with more than a minute to fund can be published.');
  }
  if (!/^[0-9a-f]{64}$/i.test(report.reference) || !/^[0-9a-f]{64}$/i.test(report.sha256)) {
    throw new Error('The verified Swarm assessment reference or hash is invalid.');
  }
  const existing = (await readLoanPackets(chainId, desk, id)).filter(packet => packet.loanId.value === id
    && sameWallet(packet.$owner, loan.borrower));
  if (existing.length) {
    const exact = existing.find(packet => packet.evidence.value.toLowerCase() === loan.terms.evidenceDigest.toLowerCase()
      && packet.reportHash.value.toLowerCase() === report.sha256.toLowerCase()
      && packet.reportRef.value.toLowerCase() === report.reference.toLowerCase());
    if (exact) return { entityKey: exact.$key, txHash: null as Hex | null };
    throw new Error('This borrower already published a different report for this request.');
  }
  const chainIdHex = ('0x' + rabdiChain.id.toString(16)) as Hex;
  if (Number(BigInt(await provider.request({ method: 'eth_chainId' }) as string)) !== rabdiChain.id) {
    const switchChain = () => provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
    try {
      await switchChain();
    } catch (error) {
      if ((error as { code?: number }).code !== 4902) throw error;
      const publicChain = rabdi({ accessKey: '' });
      await provider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: chainIdHex, chainName: 'Arkiv Rabdi', nativeCurrency: publicChain.nativeCurrency,
        rpcUrls: [...publicChain.rpcUrls.default.http], blockExplorerUrls: [arkivExplorer],
      }] });
      await switchChain();
    }
  }
  if (Number(BigInt(await provider.request({ method: 'eth_chainId' }) as string)) !== rabdiChain.id) {
    throw new Error('Switch the browser wallet to Arkiv Rabdi.');
  }
  const wallet = createWalletClient({ chain: rabdiChain, account: loan.borrower, transport: custom(provider) });
  try {
    return await wallet.createEntity(packets, {
      app: tag,
      lendingChain: u64(BigInt(chainId)),
      desk: addr(desk),
      loanId: u64(id),
      score: u64(BigInt(loan.score)),
      fundBy: u64(loan.fundBy),
      asOf: u64(loan.terms.asOf),
      evidence: loan.terms.evidenceDigest,
      group: loan.walletSetHash,
      reportRef: report.reference.toLowerCase(),
      reportHash: report.sha256.toLowerCase(),
    }, { expiration: ExpirationTime.atDate(new Date((Number(loan.fundBy) + RECORD_RETENTION_SECONDS) * 1000)), flags: { readonly: true } });
  } finally {
    if (originalChainId !== rabdiChain.id) {
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${originalChainId.toString(16)}` }] });
      } catch {
        // Preserve the publication result if the wallet refuses to switch back.
      }
    }
  }
}
