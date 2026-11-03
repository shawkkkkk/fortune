// TEST ONLY: official API plus two synthetic HTTPS RPC origins -> ONE loopback fixture.
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),base=process.env.FORTUNE_TEST_CHARACTER_BRIEF_HTTP;
 if(!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(base||''))throw Error('Loopback fixture only');
 if(u.origin==='https://fortunepad.fun'&&/^\/api\/public\/v1\/tokens\/0x[a-f0-9]{40}\/project$/.test(u.pathname)&&options.credentials==='omit'&&options.redirect==='error')return original(base+u.pathname,options);
 if(['https://reviewed-one.invalid','https://reviewed-two.invalid'].includes(u.origin)&&options.redirect==='error')return original(base+'/rpc',options);
 throw Error('Unexpected fixture request');
};
