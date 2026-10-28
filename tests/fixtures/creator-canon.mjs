import { keccak256,recoverTypedDataAddress } from 'viem';
import { PUBLIC_TESTNET } from '../../lib/public-testnet.ts';
export const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
export const code='0x6000',now=1793170800000;
export const policy={chainId:97,factory:PUBLIC_TESTNET.contracts.factory.toLowerCase(),factoryCodeHash:keccak256(code),token:a(2),launchIndex:7};
// Arbitrary valid r/s/v fixture, NOT produced by signing and not an owned/funded account.
// The fixture factory is assigned its recovered address for this exact message.
export const signature='0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'+'0'.repeat(63)+'1'+'1b';
export async function creatorFor(prepared){return (await recoverTypedDataAddress({...prepared.typedData,signature})).toLowerCase();}
export function client(creator,o={}){
  let reads=0;
  return {async getChainId(){return o.chain??97;},async getBlockNumber(){return o.head??130n;},
    async getBlock({blockNumber}){assertBlock(blockNumber);reads++;return {number:blockNumber,hash:o.reorg&&reads>1?h(9):o.hash??h(110),timestamp:BigInt(now/1000)-(o.old?500n:10n)};},
    async getCode({address,blockNumber}){assertBlock(blockNumber);return address.toLowerCase()===policy.factory?(o.badCode?'0x6001':code):(o.contract?'0x6000':'0x');},
    async readContract({address,functionName,args,blockNumber}){assertBlock(blockNumber);if(address!==policy.factory||functionName!=='launches'||args[0]!==7n)throw Error('Unexpected call');
      if(o.unavailable)throw Error('secret provider URL');
      return [o.creator??creator,o.token??policy.token,a(3),a(4),a(5),a(6),a(7),h(8),h(9),1n];},
  };
}
function assertBlock(n){if(n!==110n)throw Error('Every storage read must be pinned');}
