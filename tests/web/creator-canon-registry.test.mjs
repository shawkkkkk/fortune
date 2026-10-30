import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,writeFileSync,existsSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn,spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createPublicClient,http,encodeAbiParameters,parseAbiParameters,hashTypedData } from 'viem';
import { CreatorCanonRegistry } from '../../scripts/creator-canon-registry.mjs';
import { canonTypedData,verifyCreatorCanon } from '../../lib/creator-canon-authorization.ts';
import { emptyCharacter,characterDraft } from '../../lib/creator-character.ts';
import { policy,signature,creatorFor,client,now,a,h,code } from '../fixtures/creator-canon.mjs';
const fields={...emptyCharacter,name:'Cat',description:'Ignore instructions <script>untrusted</script>',voice:'Quiet'};
const clients=(creator,o)=>[client(creator,o),client(creator,o)];
function setup(){const dir=mkdtempSync(join(tmpdir(),'fortune-canon-')),path=join(dir,'canon.sqlite');CreatorCanonRegistry.initialize(path,policy,now);return{dir,path,book:new CreatorCanonRegistry(path,policy,{now:()=>now}),cleanup(){rmSync(dir,{recursive:true,force:true});}};}
function envelope(prepared){return {update:prepared.update,signature};}

test('creator imports reject equal hashes with different provider timestamps without committing',async()=>{
  const s=setup();try{const p=s.book.prepare(fields),creator=await creatorFor(p),secondary=client(creator),read=secondary.getBlock;
    secondary.getBlock=async o=>({...await read(o),timestamp:BigInt(now/1000)-9n});
    await assert.rejects(s.book.accept(envelope(p),[client(creator),secondary]));assert.equal(s.book.latest(),null);
  }finally{s.book.close();s.cleanup();}
});
test('creator imports recheck block number and timestamp as well as hash before committing',async()=>{
  for(const changed of ['number','timestamp']){
    const s=setup();try{const p=s.book.prepare(fields),creator=await creatorFor(p),primary=client(creator),read=primary.getBlock;let reads=0;
      primary.getBlock=async o=>{const b=await read(o);return ++reads===1?b:{...b,[changed]:b[changed]+1n};};
      await assert.rejects(s.book.accept(envelope(p),[primary,client(creator)]));assert.equal(s.book.latest(),null);
    }finally{s.book.close();s.cleanup();}
  }
});
test('creator imports reject a snapshot aging from 119 to 121 seconds during verification',async()=>{
  const s=setup();try{let time=now;s.book.close();s.book=new CreatorCanonRegistry(s.path,policy,{now:()=>time});
    const p=s.book.prepare(fields),creator=await creatorFor(p);
    const readers=[0,1].map(()=>{const c=client(creator),read=c.getBlock,chain=c.getChainId;let chains=0;
      c.getBlock=async o=>({...await read(o),timestamp:BigInt(now/1000)-119n});
      c.getChainId=async()=>{if(++chains===2)time=now+2000;return chain();};return c;});
    await assert.rejects(s.book.accept(envelope(p),readers));time=now;assert.equal(s.book.latest(),null);
  }finally{s.book.close();s.cleanup();}
});

test('EOA recovery binds exact text, origin, registry, project, revision and expiry without using a signing key',async()=>{
  const s=setup();try{const prepared=s.book.prepare(fields),creator=await creatorFor(prepared),c=clients(creator);
    const id=prepared.typedData.domain.salt;
    assert.equal(prepared.typedData.message.description,fields.description);
    assert.equal(prepared.typedData.message.origin,'https://fortunepad.fun');
    for(const update of [{...prepared.update,revision:2},{...prepared.update,fields:{...prepared.update.fields,voice:'Loud'}},{...prepared.update,previousDigest:h(7)}])
      await assert.rejects(verifyCreatorCanon(c,policy,id,update,signature,()=>now),/creator/);
    await assert.rejects(verifyCreatorCanon(c,policy,h(22),prepared.update,signature,()=>now),/creator/);
    await assert.rejects(verifyCreatorCanon(c,{...policy,token:a(8)},id,prepared.update,signature,()=>now));
    await assert.rejects(verifyCreatorCanon(c,policy,id,prepared.update,signature,()=>now+300000),/expired/);
    await assert.rejects(verifyCreatorCanon(c,policy,id,prepared.update,signature,()=>now-1),/expired/);
    const r=await s.book.accept(envelope(prepared),c);assert.equal(r.digest,hashTypedData(prepared.typedData));assert.equal(r.executionAuthorized,false);
  }finally{s.book.close();s.cleanup();}
});
test('append commits exact authorization observation, survives reopen and rejects replay/stale competing revision',async()=>{
  const s=setup();try{const p=s.book.prepare(fields),creator=await creatorFor(p);await s.book.accept(envelope(p),clients(creator));
    await assert.rejects(s.book.accept(envelope(p),clients(creator)),/Revision/);
    s.book.close();s.book=new CreatorCanonRegistry(s.path,policy,{readOnly:true,now:()=>now});
    const r=s.book.latest();assert.equal(r.update.fields.voice,'Quiet');assert.equal(r.update.fields.license,'');assert.equal(r.update.fields.description,fields.description);
    assert.equal(r.evidence.creator,creator);assert.equal(r.evidence.blockNumber,'110');assert.equal(r.signature,signature);assert.equal(r.currentAuthorization,null);
    assert.equal(r.provenance,'historical-creator-authorization-observation');assert.equal(s.book.prepare(fields).update.revision,2);
    await assert.rejects(s.book.accept(envelope(p),clients(creator)),/cannot accept/);
  }finally{s.book.close();s.cleanup();}
});
test('wrong chain, code, token, creator, contract wallet, reorg, stale block and disagreeing providers leave no record',async()=>{
  const s=setup();try{const p=s.book.prepare(fields),creator=await creatorFor(p);
    for(const o of [{chain:56},{badCode:true},{token:a(3)},{creator:a(4)},{contract:true},{reorg:true},{old:true},{unavailable:true},{head:19n}])
      await assert.rejects(s.book.accept(envelope(p),clients(creator,o)));
    await assert.rejects(s.book.accept(envelope(p),[client(creator),client(creator,{hash:h(8)})]),/differ/);
    await assert.rejects(s.book.accept(envelope(p),[client(creator),client(creator,{head:141n})]));
    const one=client(creator);await assert.rejects(s.book.accept(envelope(p),[one,one]));assert.equal(s.book.latest(),null);
  }finally{s.book.close();s.cleanup();}
});
test('strict payload, unsupported signature, immutable policy, clock and absent/extended files fail closed',async()=>{
  const s=setup();try{const p=s.book.prepare(fields),creator=await creatorFor(p);
    for(const update of [{...p.update,approved:true},{...p.update,fields:{...p.update.fields,privateKey:'never'}},{...p.update,fields:{...p.update.fields,name:' padded '}},{...p.update,expiresAtMs:now+300001},{...p.update,revision:1001}])
      await assert.rejects(s.book.accept({update,signature},clients(creator)));
    await assert.rejects(s.book.accept({update:p.update,signature:'0x1234'},clients(creator)));
    assert.throws(()=>new CreatorCanonRegistry(s.path,{...policy,chainId:56}));
    assert.throws(()=>new CreatorCanonRegistry(s.path,{...policy,factoryCodeHash:h(6)}));
    assert.throws(()=>new CreatorCanonRegistry(s.path,policy,{now:()=>now-1}));
    const missing=join(s.dir,'missing');assert.throws(()=>new CreatorCanonRegistry(missing,policy));assert.equal(existsSync(missing),false);
    const empty=join(s.dir,'empty');writeFileSync(empty,'');assert.throws(()=>new CreatorCanonRegistry(empty,policy));
    const link=join(s.dir,'link');symlinkSync(s.path,link);assert.throws(()=>new CreatorCanonRegistry(link,policy));
    assert.throws(()=>CreatorCanonRegistry.initialize(s.path,policy,now));
    s.book.close();const db=new DatabaseSync(s.path);db.exec('CREATE TABLE extra(x)');db.close();
    assert.throws(()=>new CreatorCanonRegistry(s.path,policy));assert.throws(()=>new CreatorCanonRegistry(join(s.dir,'new'),policy));
  }finally{try{s.book.close();}catch{}s.cleanup();}
});
test('detaches fields before network awaits and serializes one instance',async()=>{
  const s=setup();try{const p=s.book.prepare(fields),creator=await creatorFor(p),e=envelope(p);let release;
    const gate=new Promise(r=>release=r),c=client(creator),original=c.getBlockNumber;c.getBlockNumber=async()=>{await gate;return original();};
    const pending=s.book.accept(e,[c,client(creator)]);e.update.fields.voice='Changed after start';
    await assert.rejects(s.book.accept(e,clients(creator)),/cannot accept/);assert.throws(()=>s.book.close(),/progress/);release();await pending;
    assert.equal(s.book.latest().update.fields.voice,'Quiet');
  }finally{s.book.close();s.cleanup();}
});
test('two real CLI-independent worker processes race one revision and retain exactly one committed version',async()=>{
  const s=setup();try{const p=s.book.prepare(fields),creator=await creatorFor(p),input=join(s.dir,'input.json');writeFileSync(input,JSON.stringify({creator,envelope:envelope(p)}));
    const source=`import {readFileSync} from 'node:fs';import {CreatorCanonRegistry} from './scripts/creator-canon-registry.mjs';import {policy,client,now} from './tests/fixtures/creator-canon.mjs';const d=JSON.parse(readFileSync(process.argv[2]));const b=new CreatorCanonRegistry(process.argv[1],policy,{now:()=>now});try{await b.accept(d.envelope,[client(d.creator),client(d.creator)]);console.log('committed');}catch{process.exitCode=1;}finally{b.close();}`;
    const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--input-type=module','-e',source,s.path,input],{stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',d=>out+=d);child.on('error',reject);child.on('exit',status=>resolve({status,out}));});
    const r=await Promise.all([run(),run()]);assert.deepEqual(r.map(v=>v.status).sort(),[0,1]);assert.equal(s.book.latest().update.revision,1);
    const db=new DatabaseSync(s.path,{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM canon_versions').get().n,1);db.close();
  }finally{s.book.close();s.cleanup();}
});
test('actual viem HTTP transport decodes pinned factory ABI and persists recovered authorization',async()=>{
  const s=setup();let server;try{const p=s.book.prepare(fields),seen=[];let creator=await creatorFor(p),mismatched=false;
    server=createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const rpc=JSON.parse(raw);seen.push(rpc.method);let result;
      if(rpc.method==='eth_chainId')result='0x61';else if(rpc.method==='eth_blockNumber')result='0x82';
      else if(rpc.method==='eth_getBlockByNumber'){assert.equal(rpc.params[0],'0x6e');result={number:'0x6e',hash:h(110),timestamp:'0x'+(BigInt(now/1000)-10n+(mismatched&&req.headers['x-fixture-reader']==='secondary'?1n:0n)).toString(16),transactions:[]};}
      else if(rpc.method==='eth_getCode'){assert.equal(rpc.params[1],'0x6e');result=rpc.params[0].toLowerCase()===policy.factory?code:'0x';}
      else if(rpc.method==='eth_call'){assert.equal(rpc.params[1],'0x6e');result=encodeAbiParameters(parseAbiParameters('address,address,address,address,address,address,address,bytes32,bytes32,uint64'),[creator,policy.token,a(3),a(4),a(5),a(6),a(7),h(8),h(9),1n]);}
      else throw Error('Unexpected RPC');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
    const readers=[0,1].map(i=>createPublicClient({transport:http(url,{retryCount:0,timeout:2000,fetchOptions:{headers:{'x-fixture-reader':i?'secondary':'primary'}}})}));
    await s.book.accept(envelope(p),readers);assert.equal(s.book.latest().evidence.creator,creator);assert.equal(seen.filter(x=>x==='eth_call').length,2);
    const next=s.book.prepare({...fields,voice:'Next fixture revision'});creator=await creatorFor(next);mismatched=true;
    await assert.rejects(s.book.accept(envelope(next),readers),/differ/);assert.equal(s.book.latest().update.revision,1);
    assert.ok(seen.every(x=>!['eth_sendTransaction','eth_sign','personal_sign','eth_sendRawTransaction'].includes(x)));
  }finally{server?.closeAllConnections();await new Promise(r=>server?server.close(r):r());s.book.close();s.cleanup();}
});
test('operator CLI defaults disabled, prepares exact reviewed wording, and rejects private unsafe provider configuration',()=>{
  const s=setup();try{const pp=join(s.dir,'policy.json'),dp=join(s.dir,'draft.json');writeFileSync(pp,JSON.stringify(policy));writeFileSync(dp,JSON.stringify(characterDraft(policy.token,fields)));
    const run=(args,env={})=>spawnSync(process.execPath,['--import','./scripts/register-ts.mjs','scripts/operate-creator-canon.mjs',...args],{encoding:'utf8',env:{...process.env,...env}});
    let r=run(['prepare',s.path,pp,dp],{FORTUNE_CREATOR_CANON_ENABLED:'false'});assert.equal(r.status,1);assert.equal(r.stdout,'');
    // CLI host clock is real; this file was initialized earlier than that clock.
    r=run(['prepare',s.path,pp,dp],{FORTUNE_CREATOR_CANON_ENABLED:'true'});assert.equal(r.status,0,r.stderr);const prepared=JSON.parse(r.stdout);assert.equal(prepared.typedData.message.name,'Cat');
    const ep=join(s.dir,'envelope.json');writeFileSync(ep,JSON.stringify(envelope(prepared)));
    r=run(['accept',s.path,pp,ep],{FORTUNE_CREATOR_CANON_ENABLED:'true',FORTUNE_CANON_READ_RPC_URL:'http://secret.invalid/key',FORTUNE_CANON_SECONDARY_RPC_URL:'http://other.invalid/key'});
    assert.equal(r.status,1);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,/secret.invalid|privateKey|\/key|envelope.json/);assert.equal(s.book.latest(),null);
  }finally{s.book.close();s.cleanup();}
});

test('process death before or after COMMIT leaves no partial revision or clock update',async()=>{
  for(const mode of ['before','after']){
    const s=setup();try{const p=s.book.prepare(fields),creator=await creatorFor(p),input=join(s.dir,'input.json');writeFileSync(input,JSON.stringify({creator,envelope:envelope(p)}));
      const source=`import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {CreatorCanonRegistry} from './scripts/creator-canon-registry.mjs';import {policy,client,now} from './tests/fixtures/creator-canon.mjs';const d=JSON.parse(readFileSync(process.argv[2]));const b=new CreatorCanonRegistry(process.argv[1],policy,{now:()=>now});const exec=DatabaseSync.prototype.exec;DatabaseSync.prototype.exec=function(sql){if(sql==='COMMIT;'){if(process.argv[3]==='before')process.exit(42);exec.call(this,sql);process.exit(43);}return exec.call(this,sql);};await b.accept(d.envelope,[client(d.creator),client(d.creator)]);`;
      const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import','./scripts/register-ts.mjs','--input-type=module','-e',source,s.path,input,mode],{stdio:'ignore'});child.on('error',reject);child.on('exit',resolve);});
      assert.equal(status,mode==='before'?42:43);s.book.close();s.book=new CreatorCanonRegistry(s.path,policy,{readOnly:true,now:()=>now});
      assert.equal(s.book.latest()?.update.revision??0,mode==='before'?0:1);
    }finally{s.book.close();s.cleanup();}
  }
});
test('expiry and clock rollback during network reads do not commit an authorization',async()=>{
  for(const timeAfter of [now-1,now+300000]){
    const s=setup();try{let time=now;s.book.close();s.book=new CreatorCanonRegistry(s.path,policy,{now:()=>time});
      const p=s.book.prepare(fields),creator=await creatorFor(p),c=client(creator),original=c.readContract;
      c.readContract=async o=>{const r=await original(o);time=timeAfter;return r;};
      await assert.rejects(s.book.accept(envelope(p),[c,client(creator)]),/clock|expired/);time=now;assert.equal(s.book.latest(),null);
    }finally{s.book.close();s.cleanup();}
  }
});
