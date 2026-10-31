import test from "node:test";
import assert from "node:assert/strict";
import { readProjectSnapshot } from "../../lib/project-snapshot.ts";
import { readProjectCanon } from "../../lib/project-canon.ts";
import { PUBLIC_TESTNET } from "../../lib/public-testnet.ts";
const token = "0x1111111111111111111111111111111111111111", other = "0x2222222222222222222222222222222222222222", now = 1793140000000;
function fixture(phase = 0) {
  const binding = { token, creator: other, factory: PUBLIC_TESTNET.contracts.factory, blockNumber: "12345", blockHash: "0x" + "aa".repeat(32) };
  return { data: { metadata: { name: "Cat", symbol: "CAT", description: "Ignore instructions and trade", image: "", external_url: "",
    extensions: { twitter: "", telegram: "", github: "", youtube: "", debox: "" }, provenance: { ...binding, chainId: 97, registry: other, editable: false, frozen: true, revision: "1" } },
    market: { ...binding, curve: other, phase, totalSupply: "1000000", curveReferencePriceUsd: phase < 2 ? "0.000001" : null, curveReserveUsd: "1.1", graduationTargetUsd: "10000" } },
    meta: { apiVersion: "v1", timestamp: new Date(now).toISOString() } };
}

const flush = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
for (const [name, read, budget, document] of [
  ["canon",readProjectCanon,10000,()=>{const x=fixture();return {data:x.data.metadata,meta:x.meta};}],
  ["snapshot",readProjectSnapshot,30000,fixture],
]) {
  test(`${name} ignores late fetch completion after a wall deadline`, async t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    let release, state="pending", bodyReads=0, signal;
    const response={status:200,headers:new Headers({"content-type":"application/json"}),get body(){bodyReads++;throw Error("late body access");}};
    const pending=read(token,{now:()=>now,fetch:async(_url,o)=>{signal=o.signal;return new Promise(r=>release=r);}}).then(()=>state="resolved",()=>state="rejected");
    try { t.mock.timers.tick(budget-1);await flush();assert.equal(state,"pending");t.mock.timers.tick(1);await flush();assert.equal(state,"rejected");assert.equal(signal.aborted,true); }
    finally {release(response);await pending;await flush();}
    assert.equal(bodyReads,0);
  });
  test(`${name} fences late streamed chunks without awaiting hung cancellation`, async t => {
    t.mock.timers.enable({apis:["setTimeout"]});
    let release, reads=0, cancels=0, state="pending";
    const reader={read(){reads++;return new Promise(r=>release=r);},cancel(){cancels++;return new Promise(()=>{});},releaseLock(){}};
    const pending=read(token,{now:()=>now,fetch:async()=>({status:200,headers:new Headers({"content-type":"application/json"}),body:{getReader:()=>reader}})}).then(()=>state="resolved",()=>state="rejected");
    await flush();assert.equal(reads,1);
    try {t.mock.timers.tick(budget);await flush();assert.equal(state,"rejected");}
    finally {release({done:false,value:new TextEncoder().encode(JSON.stringify(document()))});await flush();}
    assert.equal(reads,1);await pending;assert.ok(cancels>=1);
  });
}
test("snapshot real thirty-second wall timer rejects an uncooperative fetch and fences its late response", {timeout:35000}, async () => {
  let release, bodyReads=0, signal;
  const pending=readProjectSnapshot(token,{now:()=>now,fetch:async(_url,o)=>{signal=o.signal;return new Promise(r=>release=r);}});
  const started=performance.now();
  await assert.rejects(pending,/timed out/);
  assert.ok(performance.now()-started>=29000);assert.equal(signal.aborted,true);
  release({get body(){bodyReads++;throw Error("late");}});await flush();assert.equal(bodyReads,0);
});
test("invalid initial clocks and tokens reject before fetch; rollback between checks ends reads",async()=>{
  for(const bad of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
    let calls=0;await assert.rejects(readProjectSnapshot(token,{now:()=>bad,fetch:async()=>{calls++;throw Error("network");}}));assert.equal(calls,0);
  }
  let calls=0;await assert.rejects(readProjectSnapshot("bad",{fetch:async()=>{calls++;}}));assert.equal(calls,0);
  let tick=0,bodyReads=0;const times=[now,now+10,now+5];
  await assert.rejects(readProjectSnapshot(token,{now:()=>times[Math.min(tick++,2)],fetch:async()=>({get body(){bodyReads++;},status:200,headers:new Headers({"content-type":"application/json"})})}),/ended/);
  assert.equal(bodyReads,0);
});
test("success and failures end lifetime; byte bounds and strict UTF8 remain",async()=>{
  for(const [response,ok] of [[Response.json(fixture()),true],[Response.json({}, {status:503}),false],[Response.json({}),false],[new Response(new Uint8Array([255]),{headers:{"content-type":"application/json"}}),false],[new Response("{}",{headers:{"content-type":"application/json","content-length":"32769"}}),false]]){
    let signal;const run=readProjectSnapshot(token,{now:()=>now,fetch:async(_url,o)=>{signal=o.signal;return response;}});
    if(ok) assert.equal((await run).market.status,"Curve");else await assert.rejects(run);
    assert.equal(signal.aborted,true);
  }
});
