import { custom, http, type Address, type Hex } from 'viem';
import { createPublicClient, createWalletClient, defineSchema, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { and, eq } from '@arkiv-network/sdk/query';
import { addr, str, u64 } from '@arkiv-network/sdk/schema';
import { sameWallet, type TraderLoan } from './trader-credit';

const tag = 'aqra.trader.credit.v1';
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
});
const rabdiChain = rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? '' });
export const arkivExplorer = rabdiChain.blockExplorers.default.url;

export async function readPackets(chainId: number, desk: Address) {
  const client = createPublicClient({ chain: rabdiChain, transport: http(undefined, { timeout: 6000, retryCount: 0 }) });
  const result = await client.select({
    $key: true, $owner: true, loanId: true, score: true, fundBy: true, asOf: true, evidence: true, group: true,
  }).from(packets).where(and(eq('app', tag), eq('lendingChain', u64(BigInt(chainId))), eq('desk', addr(desk)))).limit(60).fetch();
  return result.entities;
}

type Packet = Awaited<ReturnType<typeof readPackets>>[number];
export function packetMatches(packet: Packet, loan: TraderLoan, now: bigint) {
  return loan.state === 1 && loan.score >= 60 && loan.fundBy > now
    && sameWallet(packet.$owner, loan.borrower)
    && packet.score.value === BigInt(loan.score)
    && packet.fundBy.value === loan.fundBy && packet.asOf.value === loan.terms.asOf
    && packet.evidence.value === loan.terms.evidenceDigest && packet.group.value === loan.walletSetHash;
}

export async function publishPacket(chainId: number, desk: Address, id: bigint, loan: TraderLoan) {
  const provider = window.ethereum;
  if (!provider) throw new Error('Connect the borrower’s browser wallet to publish on Rabdi.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as Address[];
  if (!sameWallet(accounts[0], loan.borrower)) throw new Error('Select the same borrower wallet that owns the request.');
  if (loan.state !== 1 || loan.score < 60 || loan.fundBy <= BigInt(Math.floor(Date.now() / 1000) + 60)) {
    throw new Error('Only attested requests with more than a minute to fund can be published.');
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
  return wallet.createEntity(packets, {
    app: tag,
    lendingChain: u64(BigInt(chainId)),
    desk: addr(desk),
    loanId: u64(id),
    score: u64(BigInt(loan.score)),
    fundBy: u64(loan.fundBy),
    asOf: u64(loan.terms.asOf),
    evidence: loan.terms.evidenceDigest,
    group: loan.walletSetHash,
  }, { expiration: ExpirationTime.atDate(new Date(Number(loan.fundBy) * 1000)), flags: { readonly: true } });
}
