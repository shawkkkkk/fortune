// TEST ONLY: two synthetic HTTPS origins use ONE loopback fixture, not independent providers.
const target=new URL(process.env.FORTUNE_TEST_COUNTER_OBSERVATION_RPC||'');
if(target.protocol!=='http:'||target.hostname!=='127.0.0.1')throw Error('Local fixture required');
const original=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url??input.href);
 if(!['https://counter-one.invalid','https://counter-two.invalid'].includes(url.origin))throw Error('Unexpected test origin');
 if(init?.redirect!=='error'||init?.credentials!=='omit')throw Error('Read transport restrictions missing');
 return original(target,init);
};
