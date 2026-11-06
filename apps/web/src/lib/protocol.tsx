'use client';

import React,{createContext,useContext,useEffect,useState,useCallback,useRef} from 'react';

import {createWalletClient,custom,http,type Abi,type Address,type EIP1193Provider,type Hash,type Hex,keccak256,isAddress,numberToHex,type TransactionReceipt} from 'viem';

import {abis,MockUSDCAbi,chainFor,publicClientFor,readSnapshot,contractNames,latestEligiblePair,type Deployment,type Snapshot,type ContractName} from '@floor/shared';

declare global{interface Window{ethereum?:EIP1193Provider}}

export type TransactionState={label:string;status:'signing'|'pending'|'confirmed'|'error';hash?:Hash;error?:string};

type Draft={lower:string;upper:string;lowerUnits:string;upperUnits:string};

type ProtocolContext={deployment:Deployment|null;data:Snapshot|null;online:boolean;loading:boolean;error:string|null;address:Address|null;mode:'local'|'injected'|null;tx:TransactionState|null;rpcUrl:string;draft:Draft;setDraft:React.Dispatch<React.SetStateAction<Draft>>;refresh:()=>Promise<void>;connectLocal:(role:'borrower'|'lender'|'resolver')=>Promise<void>;connectInjected:()=>Promise<void>;disconnect:()=>void;signMessage:(message:string,expected:Address)=>Promise<Hex>;transact:(label:string,name:ContractName,fn:string,args:unknown[],blockTag?:'pending')=>Promise<TransactionReceipt>;dismissTx:()=>void;configure:(rpc:string,manifest?:Deployment)=>void};

const Ctx=createContext<ProtocolContext|null>(null);

const loopback=(url:string)=>{try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)}catch{return false}};
const localDemoUi=process.env.NEXT_PUBLIC_ENABLE_LOCAL_DEMO_UI==='true';

async function switchSigningChain(provider: EIP1193Provider, deployment: Deployment, rpcUrl: string) {
  const chainId = ('0x' + deployment.chainId.toString(16)) as Hex;
  if (Number(BigInt(await provider.request({ method: 'eth_chainId' }))) === deployment.chainId) return;
  const switchChain = () => provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  try {
    await switchChain();
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    const chain = chainFor(deployment.chainId, rpcUrl);
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId, chainName: deployment.chainName, nativeCurrency: chain.nativeCurrency, rpcUrls: [rpcUrl],
    }] });
    await switchChain();
  }
}

export function ProtocolProvider({children}:{children:React.ReactNode}){

  const [deployment,setDeployment]=useState<Deployment|null>(null),[data,setData]=useState<Snapshot|null>(null);

  const [online,setOnline]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);

  const [address,setAddress]=useState<Address|null>(null),[mode,setMode]=useState<'local'|'injected'|null>(null);

  const [rpcUrl,setRpcUrl]=useState('http://127.0.0.1:8545'),[tx,setTx]=useState<TransactionState|null>(null);

  const [draft,setDraft]=useState<Draft>({lower:'2',upper:'3',lowerUnits:'1',upperUnits:'1'});

  const pending=useRef(false),refreshing=useRef(false),initialized=useRef(false),draftTouched=useRef(false);

  useEffect(()=>{let cancelled=false;(async()=>{

    try{

      const saved=localStorage.getItem('floor-connection');

      const settings=saved?JSON.parse(saved):null;

      const manifestFile = process.env.NEXT_PUBLIC_AQRA_POSITIONS_DEV === 'true' ? '/deployment.positions.local.json' : '/deployment.json';
      const response=await fetch(manifestFile,{cache:'no-store'});

      if(!response.ok)throw new Error('Deployment manifest is missing. Run pnpm deploy:local.');

      let manifest=await response.json();
      if(settings?.manifest){try{validateManifest(settings.manifest);manifest=settings.manifest}catch{localStorage.removeItem('floor-connection')}}

      validateManifest(manifest);

      if(cancelled)return;

      setDeployment(manifest);setRpcUrl(settings?.rpcUrl??manifest.rpcUrl);

      if(manifest.defaultPair&&!draftTouched.current)setDraft(current=>({...current,lower:manifest.defaultPair.lower,upper:manifest.defaultPair.upper}));

    }catch(e){if(!cancelled){setError(message(e));setLoading(false);}}

  })();return()=>{cancelled=true}},[]);

  const refresh=useCallback(async()=>{

    if(!deployment||refreshing.current)return;refreshing.current=true;

    try{const snapshot=await readSnapshot(deployment,address??undefined,rpcUrl);setData(snapshot);if(!initialized.current){initialized.current=true;const pair=latestEligiblePair(snapshot);if(pair&&!draftTouched.current)setDraft(current=>({...current,...pair}));}setOnline(true);setError(null);}

    catch(e){setOnline(false);setError(message(e));setData(null);}

    finally{refreshing.current=false;setLoading(false);}

  },[deployment,address,rpcUrl]);

  useEffect(()=>{void refresh();const interval=setInterval(()=>void refresh(),6000);return()=>clearInterval(interval)},[refresh]);

  const validateCode=useCallback(async()=>{

    if(!deployment)throw new Error('No deployment configured');

    const client=publicClientFor(deployment,rpcUrl);

    if(await client.getChainId()!==deployment.chainId)throw new Error('ERR_CHAIN_MISMATCH');

    const optional = (['ChainlinkObservationResolver', 'TraderCreditDesk', 'PositionTokenLedger'] as const).filter(name => deployment.contracts[name]);
    await Promise.all([...contractNames, ...optional].map(async name=>{const code=await client.getCode({address:deployment.contracts[name]!});if(!code||keccak256(code)!==deployment.codeHashes[name])throw new Error(`ERR_CONTRACT_CODE_MISMATCH: ${name}. Redeploy and refresh the manifest.`);}));

  },[deployment,rpcUrl]);

  const connectLocal=async(role:'borrower'|'lender'|'resolver')=>{

    if(!localDemoUi||!deployment?.mockCollateral||deployment.chainId!==31337||!loopback(rpcUrl)||!loopback(window.location.href))throw new Error('Local wallets require the loopback demo on chain 31337.');

    await validateCode();

    const wallet=createWalletClient({chain:chainFor(31337,rpcUrl),transport:http(rpcUrl)});

    const accounts=await wallet.getAddresses();const selected=deployment.roles[role];

    if(!accounts.some(a=>a.toLowerCase()===selected.toLowerCase()))throw new Error('Local devnet account is not available');

    setAddress(selected);setMode('local');localStorage.setItem('floor-wallet',JSON.stringify({mode:'local',role,chainId:deployment.chainId,desk:deployment.contracts.CreditDesk}));

  };

  const connectInjected=async()=>{

    if(!deployment)throw new Error('Deployment is not configured');

    if(!window.ethereum)throw new Error('Install an Ethereum wallet to continue.');

    const accounts=await window.ethereum.request({method:'eth_requestAccounts'}) as Address[];

    if(!accounts[0]||!isAddress(accounts[0]))throw new Error('The wallet did not return an account.');

    await validateCode();setAddress(accounts[0]);setMode('injected');localStorage.setItem('floor-wallet',JSON.stringify({mode:'injected',chainId:deployment.chainId,desk:deployment.contracts.CreditDesk}));

  };

  useEffect(()=>{
    if(!deployment||!online||address)return;
    let cancelled=false;
    void(async()=>{try{
      const saved=JSON.parse(localStorage.getItem('floor-wallet')??'null');
      if(!saved||saved.chainId!==deployment.chainId||saved.desk!==deployment.contracts.CreditDesk)return;
      await validateCode();if(cancelled)return;
      if(saved.mode==='local'&&localDemoUi&&deployment.chainId===31337&&loopback(rpcUrl)&&['borrower','lender','resolver'].includes(saved.role)){
        const accounts=await createWalletClient({transport:http(rpcUrl)}).getAddresses();const selected=deployment.roles[saved.role as 'borrower'|'lender'|'resolver'];
        if(!cancelled&&accounts.some(a=>a.toLowerCase()===selected.toLowerCase())){setAddress(selected);setMode('local');}
      }else if(saved.mode==='injected'&&window.ethereum){
        const accounts=await window.ethereum.request({method:'eth_accounts'}) as Address[];
        if(!cancelled&&accounts[0]){setAddress(accounts[0]);setMode('injected');}
      }
    }catch{localStorage.removeItem('floor-wallet')}})();return()=>{cancelled=true};
  },[deployment,online,address,rpcUrl,validateCode]);
  useEffect(()=>{

    if(mode!=='injected'||!window.ethereum)return;

    const provider=window.ethereum as EIP1193Provider & {on?:(name:string,cb:(a:unknown)=>void)=>void;removeListener?:(name:string,cb:(a:unknown)=>void)=>void};

    const changed=(accounts:unknown)=>{const next=(accounts as Address[])[0];setAddress(next??null);if(!next)setMode(null)};

    provider.on?.('accountsChanged',changed);
    return()=>provider.removeListener?.('accountsChanged',changed);

  },[mode]);

  useEffect(()=>{

    if(!deployment)return;

    const stored=localStorage.getItem('floor-pending-transaction');if(!stored)return;

    const receipt=JSON.parse(stored) as {hash:Hash;chainId:number;label:string};

    if(receipt.chainId!==deployment.chainId)return;

    pending.current=true;setTx({label:receipt.label,hash:receipt.hash,status:'pending'});

    publicClientFor(deployment,rpcUrl).waitForTransactionReceipt({hash:receipt.hash,timeout:120000}).then(r=>{

      localStorage.removeItem('floor-pending-transaction');setTx({label:receipt.label,hash:receipt.hash,status:r.status==='success'?'confirmed':'error',error:r.status==='success'?undefined:'Transaction reverted onchain'});void refresh();

    }).catch(e=>setTx({label:receipt.label,hash:receipt.hash,status:'error',error:message(e)})).finally(()=>{pending.current=false});

    // Receipt recovery is tied to the configured deployment, not wallet balance refresh.

    // eslint-disable-next-line react-hooks/exhaustive-deps

  },[deployment,rpcUrl]);

  const signMessage = async (text: string, expected: Address) => {
    if (!deployment || !address || !mode || address.toLowerCase() !== expected.toLowerCase()) {
      throw new Error('Connect the wallet that owns this request.');
    }
    if (mode === 'local') {
      if (!localDemoUi || deployment.chainId !== 31337 || !deployment.mockCollateral || !loopback(rpcUrl) || !loopback(window.location.href)) {
        throw new Error('The local signer requires the loopback demo.');
      }
      await validateCode();
      return createWalletClient({ account: address, transport: http(rpcUrl) }).signMessage({ message: text });
    }
    const provider = window.ethereum;
    if (!provider) throw new Error('Reconnect your browser wallet.');
    const wallet = createWalletClient({ account: address, transport: custom(provider) });
    const [selected] = await wallet.getAddresses();
    if (selected?.toLowerCase() !== address.toLowerCase()) throw new Error('Select the request owner in your wallet.');
    return wallet.signMessage({ message: text });
  };

  const transact=async(label:string,name:ContractName,fn:string,args:unknown[],blockTag?:'pending')=>{

    if(!deployment||!address||!mode)throw new Error('Connect a wallet before signing.');

    if(!online)throw new Error('RPC disconnected. Transactions are paused until the live chain connection returns.');

    if(pending.current)throw new Error('A transaction is still pending. Wait for its receipt.');

    if(localStorage.getItem('floor-pending-transaction'))throw new Error('A submitted transaction still needs receipt verification. Reload to recover its status before sending another.');

    pending.current=true;setTx({label,status:'signing'});

    try{

      if(fn==='faucet'&&(!deployment.mockCollateral||deployment.chainId!==31337))throw new Error('Local faucet is unavailable on this deployment.');
      if(!deployment.contracts[name])throw new Error('Module is unavailable on this deployment.');
      await validateCode();const chain=chainFor(deployment.chainId,rpcUrl);const client=publicClientFor(deployment,rpcUrl);

      if(mode==='local'&&(deployment.chainId!==31337||!loopback(rpcUrl)))throw new Error('Local signer is restricted to loopback devnet.');

      const provider = window.ethereum;
      if (mode === 'injected') {
        if (!provider) throw new Error('Reconnect your browser wallet.');
        const [selected] = await provider.request({ method: 'eth_accounts' });
        if (selected?.toLowerCase() !== address.toLowerCase()) throw new Error('The wallet account changed. Select the correct signer.');
        await switchSigningChain(provider, deployment, rpcUrl);
        if (deployment.chainId === 31337) {
          const blockNumber = BigInt(deployment.traderCredit?.deploymentBlock ?? deployment.deploymentBlock);
          const [walletBlock, expectedBlock] = await Promise.all([
            provider.request({ method: 'eth_getBlockByNumber', params: [numberToHex(blockNumber), false] }),
            client.getBlock({ blockNumber }),
          ]);
          if (!walletBlock?.hash || walletBlock.hash.toLowerCase() !== expectedBlock.hash.toLowerCase()) {
            throw new Error('Set the local test network RPC in your wallet to ' + rpcUrl + ' before signing.');
          }
        }
      }
      const wallet=createWalletClient({account:address,chain,transport:mode==='local'?http(rpcUrl):custom(provider!)});

      if(await wallet.getChainId()!==deployment.chainId)throw new Error('ERR_CHAIN_MISMATCH');

      const simulation=await client.simulateContract({account:address,address:deployment.contracts[name]!,abi:(fn==='faucet'?MockUSDCAbi:abis[name]) as Abi,functionName:fn,args,blockTag});

      const hash=await wallet.writeContract({...simulation.request,account:address,chain});

      localStorage.setItem('floor-pending-transaction',JSON.stringify({hash,chainId:deployment.chainId,label}));

      setTx({label,status:'pending',hash});

      const receipt=await client.waitForTransactionReceipt({hash,timeout:120000});

      localStorage.removeItem('floor-pending-transaction');

      if(receipt.status!=='success')throw new Error(`Transaction reverted: ${hash}`);

      setTx({label,status:'confirmed',hash});await refresh();return receipt;

    }catch(e){setTx(current=>({...current,label,status:'error',error:message(e)}));throw e;}

    finally{pending.current=false;}

  };

  const configure=(rpc:string,manifest?:Deployment)=>{

    const url=new URL(rpc);if(!['https:','http:'].includes(url.protocol))throw new Error('RPC must use HTTP(S)');

    if(manifest){validateManifest(manifest);setDeployment(manifest);}

    setRpcUrl(rpc);localStorage.setItem('floor-connection',JSON.stringify({rpcUrl:rpc,manifest:manifest??deployment}));setAddress(null);setMode(null);

  };

  return <Ctx.Provider value={{deployment,data,online,loading,error,address,mode,tx,rpcUrl,draft,setDraft:next=>{draftTouched.current=true;setDraft(next)},refresh,connectLocal,connectInjected,disconnect:()=>{localStorage.removeItem('floor-wallet');setAddress(null);setMode(null)},signMessage,transact,dismissTx:()=>setTx(null),configure}}>{children}</Ctx.Provider>;

}

export function useProtocol(){const value=useContext(Ctx);if(!value)throw new Error('Missing protocol context');return {...value,walletReady:!!value.address&&value.online&&value.data?.walletAddress?.toLowerCase()===value.address.toLowerCase()};}

export function message(e:unknown):string{return (e as {shortMessage?:string})?.shortMessage??(e instanceof Error?e.message:String(e));}

export function short(value:string|undefined|null){return value?value.slice(0,6)+'…'+value.slice(-4):'—';}

export function validateManifest(d:Deployment){

  if(d.schema!=='floor-deployment/v1'||![31337,11155111].includes(d.chainId)||typeof d.mockCollateral!=='boolean'||!['TRUSTED_TEST_RESOLVER','CHAINLINK_HISTORICAL'].includes(d.oracleMode))throw new Error('Unsupported Floor deployment manifest.');

  for(const name of contractNames)if(!isAddress(d.contracts?.[name])||!/^0x[0-9a-fA-F]{64}$/.test(d.codeHashes?.[name]??''))throw new Error(`Invalid ${name} address or code hash`);
  if (d.traderCredit || d.contracts.TraderCreditDesk) {
    const mode = d.chainId === 31337 ? 'LOCAL_FORWARDER' : 'CHAINLINK_CRE';
    if (d.traderCredit?.mode !== mode || !/^\d+$/.test(d.traderCredit.deploymentBlock)
      || !isAddress(d.contracts.TraderCreditDesk ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(d.codeHashes.TraderCreditDesk ?? '')) {
      throw new Error('Invalid trader credit deployment.');
    }
  }
  if (d.traderCredit?.positionCollateral || d.contracts.PositionTokenLedger) {
    const position = d.traderCredit?.positionCollateral;
    if (d.chainId !== 31337 || !d.mockCollateral || !position || !isAddress(d.contracts.PositionTokenLedger ?? '')
      || !/^0x[0-9a-f]{64}$/i.test(d.codeHashes.PositionTokenLedger ?? '')
      || !/^0x[0-9a-f]{64}$/i.test(position.conditionId)
      || !/^\d{1,78}$/.test(position.yesTokenId) || !/^\d{1,78}$/.test(position.noTokenId)) {
      throw new Error('Invalid position collateral deployment.');
    }
  }

  if(d.chainId===11155111&&(d.mockCollateral||d.oracleMode!=='CHAINLINK_HISTORICAL'||!d.oracle||!isAddress(d.contracts.ChainlinkObservationResolver??'')))throw new Error('Sepolia requires external collateral and the feed resolver.');
  for(const role of ['curator','resolver','borrower','lender'] as const)if(!isAddress(d.roles?.[role]))throw new Error('Invalid or missing role address');

}

