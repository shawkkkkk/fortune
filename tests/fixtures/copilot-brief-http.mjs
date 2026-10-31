// TEST ONLY: redirect the fixed public project endpoint to one loopback HTTP fixture.
const original = globalThis.fetch;
globalThis.fetch = (url, options) => {
 const actual = new URL(url), base = new URL(process.env.FORTUNE_TEST_BRIEF_HTTP);
 if(actual.origin !== 'https://fortunepad.fun' || !/^\/api\/public\/v1\/tokens\/0x[a-f0-9]{40}\/project$/.test(actual.pathname)
  || base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || options.redirect !== 'error' || options.credentials !== 'omit')throw Error('Fixture unexpected request');
 return original(new URL(actual.pathname,base),options);
};
