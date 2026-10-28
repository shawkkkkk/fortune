import {readProjectSnapshot} from '../lib/project-snapshot.ts';
import {projectToken} from '../lib/project-canon.ts';
import {ProjectResearchNotebook} from './project-research-notebook.mjs';

/** Explicit operator capture: API attestation -> deterministic local note, never model instructions. */
export async function captureProjectObservation({path,token,id,expectedHead},{fetch:fetcher=fetch,now=Date.now}={}){
 token=projectToken(token);
 if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{16,64}$/.test(id)||typeof expectedHead!=='string'||! /^[0-9a-f]{64}$/.test(expectedHead))throw Error('Capture request');
 let book=new ProjectResearchNotebook(path,token,{readOnly:true,now});
 try{if(book.read().head!==expectedHead)throw Error('Capture head changed');}finally{book.close();}
 // The reader enforces the official origin, response bounds, age and common block/factory binding.
 const snapshot=await readProjectSnapshot(token,{fetch:fetcher,now});
 const m=snapshot.market,p=m.provenance;
 const observation={source:'Fortune public project API attestation',chainId:97,token,factory:p.factory,creator:p.creator,
  blockNumber:p.blockNumber,blockHash:p.blockHash,curve:m.curve,phase:m.phase,status:m.status,
  totalSupply:m.totalSupply,tokenDecimals:m.tokenDecimals,curveAccounting:m.curveAccounting,
  marketCapUsd:null,volume24hUsd:null,holderCount:null,treasuryBalance:null,tradeQuote:null,
  independentRpcVerified:false,executionAuthorized:false};
 const document={kind:'observation',title:`Project API observation at block ${p.blockNumber}`,
  body:JSON.stringify({observation,limitations:snapshot.limitations}),
  sources:[`https://fortunepad.fun/api/public/v1/tokens/${token}/project`],corrects:0};
 book=new ProjectResearchNotebook(path,token,{now});
 try{return {...book.append({id,expectedHead,document}),blockNumber:p.blockNumber,blockHash:p.blockHash,executionAuthorized:false};}
 finally{book.close();}
}
