import {keccak256,toHex} from 'viem';
import type {ObservationRow} from '@floor/shared';
export const assetLabel=(obs?:ObservationRow)=>obs?.assetId===keccak256(toHex('BTC/USD'))?'BTC / USD':obs?.assetId===keccak256(toHex('ETH/USD'))?'ETH / USD':'Registered asset';
