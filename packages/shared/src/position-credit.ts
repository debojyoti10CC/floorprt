import { parseAbi } from 'viem';

export const SHARE_UNIT = 1_000_000n;
export const POSITION_DEBT_LTV_BPS = 8_000n;
const BPS = 10_000n;

export const positionTokenAbi = parseAbi([
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) pure returns (bytes32)',
  'function getOutcomeSlotCount(bytes32 conditionId) view returns (uint256)',
  'function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount)',
  'function splitPosition(address collateral, bytes32 parent, bytes32 conditionId, uint256[] partition, uint256 amount)',
]);

export function quotePositionCredit(principal: bigint, due: bigint, bond: bigint, pairs: bigint) {
  const gross = bond + pairs;
  const maxDue = gross * POSITION_DEBT_LTV_BPS / BPS;
  const requiredGross = (due * BPS + POSITION_DEBT_LTV_BPS - 1n) / POSITION_DEBT_LTV_BPS;
  return {
    gross,
    maxDue,
    principalLtvBps: gross > 0n ? principal * BPS / gross : null,
    dueLtvBps: gross > 0n ? due * BPS / gross : null,
    requiredPairs: requiredGross > bond ? requiredGross - bond : 0n,
  };
}
