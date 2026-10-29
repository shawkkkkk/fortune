// Test-process-only HTTPS origin rewrite. Never imported by production code.
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const base=process.env.FORTUNE_TEST_CHARACTER_RPC;
  if(!['https://reviewed-one.invalid','https://reviewed-two.invalid'].includes(url.origin)||!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(base||''))throw Error('Fixture RPC only');
  return original(base,options);
};
