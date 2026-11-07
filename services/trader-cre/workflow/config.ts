import { isAddress, zeroAddress, type Address } from 'viem';
import { z } from 'zod';
import { ARC_TESTNET_CHAIN_ID } from '../../../packages/shared/src/arc.js';
import { PnlApiOrigin } from '../../underwriting/pnl-wire.js';

const contractAddress = z.string().refine(value => isAddress(value) && value.toLowerCase() !== zeroAddress).transform(value => value as Address);
export const configSchema = z.object({
  desk: contractAddress,
  chainId: z.union([z.literal(31337), z.literal(11155111), z.literal(ARC_TESTNET_CHAIN_ID)]),
  arcSimulation: z.literal(true).optional(),
  keeper: contractAddress.optional(),
  pnlApiUrl: PnlApiOrigin.optional(),
  replayAt: z.number().int().positive().optional(),
  replayRelayPort: z.number().int().min(1024).max(65535).optional(),
}).refine(config => config.arcSimulation === undefined || config.chainId === ARC_TESTNET_CHAIN_ID)
  .refine(config => config.chainId !== ARC_TESTNET_CHAIN_ID || config.arcSimulation === true,
    'The pinned Arc operator relay supports CRE simulation only, not DON writeReport delivery.')
  .refine(config => config.replayAt === undefined
    ? config.replayRelayPort === undefined
    : (config.chainId === 31337 || config.arcSimulation) && config.keeper !== undefined,
    'Historical price replay is restricted to simulation with a configured keeper.')
  .refine(config => config.chainId === 31337 || config.arcSimulation || config.pnlApiUrl?.startsWith('https://'),
    'Configure an HTTPS AQRA read API for public CRE delivery.');
export type Config = z.infer<typeof configSchema>;
