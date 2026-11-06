import { encodeAbiParameters, encodePacked, keccak256, parseAbiParameters, stringToHex, type Address, type Hex } from 'viem';
import { POLICY_ID, type Evidence } from './policy';

export const CREDIT_POLICY_HASH = keccak256(stringToHex(POLICY_ID));

export const walletSetHash = (wallets: readonly Address[]) =>
  keccak256(encodeAbiParameters(parseAbiParameters('address[]'), [wallets]));

export const linkContext = (evidence: Evidence, ensNode: Hex, linkExpires: bigint) =>
  keccak256(encodeAbiParameters(parseAbiParameters('bytes32, bytes32, uint64, uint64'), [
    evidence.digest, ensNode, BigInt(evidence.asOf), linkExpires,
  ]));

export type ReportTarget = {
  desk: Address;
  chainId: number;
  id: bigint;
  borrower: Address;
  walletSetHash: Hex;
  evidenceDigest: Hex;
  asOf: bigint;
};

export function scoreReport(target: ReportTarget, evidence: Evidence): Hex {
  if (!evidence.decision.qualified || evidence.digest !== target.evidenceDigest
    || BigInt(evidence.asOf) !== target.asOf || walletSetHash(evidence.wallets as Address[]) !== target.walletSetHash) {
    throw new Error('The current source history no longer qualifies or differs from the signed evidence. Cancel and prepare a new request.');
  }
  return encodeAbiParameters(
    parseAbiParameters('address, uint256, uint256, address, bytes32, bytes32, uint64, uint8, bytes32'),
    [
      target.desk, BigInt(target.chainId), target.id, target.borrower, target.walletSetHash,
      evidence.digest, target.asOf, evidence.decision.score, CREDIT_POLICY_HASH,
    ],
  );
}

export const localReportMetadata = (id: Hex, owner: Address) =>
  encodePacked(['bytes32', 'bytes10', 'address'], [id, '0x00000000000000000000', owner]);
