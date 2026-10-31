// TEST ONLY. Explicit --import fixture maps the fixed provider onto one loopback server.
import assert from 'node:assert/strict';
const original=globalThis.fetch;
globalThis.fetch=(url,options)=>{
 assert.match(String(url),/^https:\/\/ordinals\.com\/rune\/[0-9]+:[0-9]+$/);
 assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
 assert.equal(new Headers(options.headers).has('authorization'),false);
 return original(`http://127.0.0.1:${process.env.FORTUNE_RUNE_TEST_PORT}${new URL(url).pathname}`,options);
};
