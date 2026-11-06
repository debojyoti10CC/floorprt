import { createPublicClient as createEvmClient, custom, defineChain, http, type Address, type Hex, type Transport } from 'viem';
import { mnemonicToAccount, type HDAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, defineSchema, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { and, eq } from '@arkiv-network/sdk/query';
import { addr, str, u64 } from '@arkiv-network/sdk/schema';
import { positionPledgeHash, quotePositionCredit, type PositionPledge } from '@floor/shared';
import { createArkivDevEntity, queryArkivDevnet } from './arkiv-devnet';
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
  pledge: str().optional(),
  principal: u64().optional(),
  maxDue: str().optional(),
});

const loopback = (host: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(host);
const localEndpoint = process.env.NEXT_PUBLIC_AQRA_LOCAL_ARKIV_URL?.trim();
export const arkivLocal = Boolean(localEndpoint && process.env.NEXT_PUBLIC_ENABLE_LOCAL_DEMO_UI === 'true'
  && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localEndpoint)
  && (typeof window === 'undefined' || loopback(window.location.hostname)));
const arkivChain = arkivLocal ? defineChain({
  id: 1337, name: 'Arkiv local devnet', nativeCurrency: { name: 'Test GLM', symbol: 'tGLM', decimals: 18 },
  rpcUrls: { default: { http: [localEndpoint!] } }, testnet: true,
}) : rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY?.trim() ?? '' });
const RECORD_RETENTION_SECONDS = 90 * 24 * 60 * 60;
export const arkivExplorer = 'https://rabdi.explorer.arkiv.network';
export const arkivAccessKeyConfigured = Boolean(process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY?.trim());
const fields = {
  $key: true, $owner: true, loanId: true, score: true, fundBy: true, asOf: true, evidence: true, group: true,
  reportRef: true, reportHash: true, pledge: true, principal: true, maxDue: true,
} as const;

async function readRabdiPackets(chainId: number, desk: Address, id?: bigint) {
  const client = createPublicClient({ chain: arkivChain, transport: http(undefined, { timeout: 6000, retryCount: 0 }) });
  const scope = and(eq('app', tag), eq('lendingChain', u64(BigInt(chainId))), eq('desk', addr(desk)));
  const filter = id === undefined ? scope : and(scope, eq('loanId', u64(id)));
  const result = await client.select(fields).from(packets).where(filter).limit(id === undefined ? 60 : 10).fetch();
  return result.entities;
}

export type ArkivPacket = Awaited<ReturnType<typeof readRabdiPackets>>[number];

export async function readPackets(chainId: number, desk: Address, id?: bigint): Promise<readonly ArkivPacket[]> {
  if (!arkivLocal) return readRabdiPackets(chainId, desk, id);
  const entries = await queryArkivDevnet(arkivChain, tag, chainId, desk, id);
  return entries.flatMap(({ key, owner, attributes: a }) => {
    try {
      return [{
        $key: key, $owner: owner, loanId: u64(BigInt(a.loanid)), score: u64(BigInt(a.score)), fundBy: u64(BigInt(a.fundby)),
        asOf: u64(BigInt(a.asof)), evidence: str(a.evidence), group: str(a.group), reportRef: str(a.reportref),
        reportHash: str(a.reporthash), pledge: a.pledge ? str(a.pledge) : undefined,
        principal: a.principal ? u64(BigInt(a.principal)) : undefined, maxDue: a.maxdue ? str(a.maxdue) : undefined,
      }];
    } catch {
      return [];
    }
  });
}

function positionCap(loan: TraderLoan, pledge: PositionPledge) {
  const { principal, due, bond } = loan.terms;
  return quotePositionCredit(principal, due, bond, BigInt(pledge.pairs)).maxDue.toString();
}

export function packetMatches(packet: ArkivPacket, loan: TraderLoan, now: bigint, pledge?: PositionPledge | null) {
  const positionMatches = pledge
    ? !pledge.released && packet.pledge?.value.toLowerCase() === positionPledgeHash(pledge)
      && packet.principal?.value === loan.terms.principal && packet.maxDue?.value === positionCap(loan, pledge)
    : !packet.pledge;
  return loan.state === 1 && loan.score >= 60 && loan.fundBy > now && positionMatches
    && sameWallet(packet.$owner, loan.borrower) && packet.score.value === BigInt(loan.score)
    && packet.fundBy.value === loan.fundBy && packet.asOf.value === loan.terms.asOf
    && packet.evidence.value.toLowerCase() === loan.terms.evidenceDigest.toLowerCase()
    && packet.group.value.toLowerCase() === loan.walletSetHash.toLowerCase()
    && /^[0-9a-f]{64}$/i.test(packet.reportRef.value) && /^[0-9a-f]{64}$/i.test(packet.reportHash.value);
}

export type AssessmentPointer = { reference: string; sha256: string; pledge?: PositionPledge | null };
export async function publishPacket(
  chainId: number, desk: Address, id: bigint, loan: TraderLoan, report: AssessmentPointer, mode: 'local' | 'injected' | null,
) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (loan.state !== 1 || loan.score < 60 || loan.fundBy <= now + 60n) {
    throw new Error('Only attested requests with more than a minute to fund can be published.');
  }
  if (!/^[0-9a-f]{64}$/i.test(report.reference) || !/^[0-9a-f]{64}$/i.test(report.sha256)) {
    throw new Error('The verified Swarm reference or hash is invalid.');
  }
  const matches = (packet: ArkivPacket) => packet.loanId.value === id && packetMatches(packet, loan, now, report.pledge)
    && packet.reportHash.value.toLowerCase() === report.sha256.toLowerCase()
    && packet.reportRef.value.toLowerCase() === report.reference.toLowerCase();
  const existing = (await readPackets(chainId, desk, id)).find(matches);
  if (existing) return { entityKey: existing.$key, txHash: null as Hex | null, readBack: true };

  const save = async (account: Address | HDAccount, transport: Transport) => {
    if (await createEvmClient({ chain: arkivChain, transport }).getChainId() !== arkivChain.id) {
      throw new Error('Switch the wallet to the configured Arkiv chain.');
    }
    const data = {
      app: tag, lendingChain: BigInt(chainId), desk: desk.toLowerCase(), loanId: id,
      score: BigInt(loan.score), fundBy: loan.fundBy, asOf: loan.terms.asOf,
      evidence: loan.terms.evidenceDigest, group: loan.walletSetHash,
      reportRef: report.reference.toLowerCase(), reportHash: report.sha256.toLowerCase(),
      ...(report.pledge ? {
        pledge: positionPledgeHash(report.pledge), principal: loan.terms.principal, maxDue: positionCap(loan, report.pledge),
      } : {}),
    };
    const expiresAt = loan.fundBy + BigInt(RECORD_RETENTION_SECONDS);
    const receipt = arkivLocal ? await createArkivDevEntity(arkivChain, transport, account, data, expiresAt)
      : await createWalletClient({ chain: arkivChain, account, transport }).createEntity(packets, {
        ...data, lendingChain: u64(data.lendingChain), desk: addr(desk), loanId: u64(data.loanId),
        score: u64(data.score), fundBy: u64(data.fundBy), asOf: u64(data.asOf),
        principal: data.principal === undefined ? undefined : u64(data.principal),
      }, { expiration: ExpirationTime.atDate(new Date(Number(expiresAt) * 1000)), flags: { readonly: true } });
    let readBack = false;
    try {
      const entities = await readPackets(chainId, desk, id);
      readBack = entities.some(packet => packet.$key === receipt.entityKey && matches(packet));
    } catch {
      // The confirmed write remains available if the query endpoint is temporarily unavailable.
    }
    return { ...receipt, readBack };
  };

  if (mode === 'local') {
    if (!arkivLocal || chainId !== 31337 || !loopback(window.location.hostname)) {
      throw new Error('A demo account can publish only to the loopback Arkiv devnet.');
    }
    // The documented public Anvil test mnemonic also funds the local Arkiv genesis.
    const account = mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: 1 });
    if (!sameWallet(account.address, loan.borrower)) throw new Error('Use the funded demo borrower.');
    return save(account, http());
  }

  const provider = window.ethereum;
  if (mode !== 'injected' || !provider) throw new Error('Connect the borrower wallet to publish.');
  const [selected] = await provider.request({ method: 'eth_accounts' });
  if (!sameWallet(selected, loan.borrower)) throw new Error('Select the borrower wallet that owns the request.');
  const originalChainId = Number(BigInt(await provider.request({ method: 'eth_chainId' })));
  const chainIdHex = ('0x' + arkivChain.id.toString(16)) as Hex;
  const switchChain = () => provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
  try {
    if (originalChainId !== arkivChain.id) {
      try {
        await switchChain();
      } catch (error) {
        if ((error as { code?: number }).code !== 4902) throw error;
        const walletChain = arkivLocal ? arkivChain : rabdi({ accessKey: '' });
        await provider.request({ method: 'wallet_addEthereumChain', params: [{
          chainId: chainIdHex, chainName: walletChain.name, nativeCurrency: walletChain.nativeCurrency,
          rpcUrls: [...walletChain.rpcUrls.default.http],
        }] });
        await switchChain();
      }
    }
    return await save(loan.borrower, custom(provider));
  } finally {
    if (originalChainId !== arkivChain.id) {
      const original = ('0x' + originalChainId.toString(16)) as Hex;
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: original }] });
      } catch {
        // Preserve the publication receipt if the wallet declines to switch back.
      }
    }
  }
}
