// Test-only mapping: two synthetic HTTPS origins share ONE loopback fixture.
const target = new URL(process.env.FORTUNE_TEST_WORK_RPC || '');
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw Error('Local fixture required');
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
  if (!['https://work-one.invalid','https://work-two.invalid'].includes(url.origin)) throw Error('Unexpected test origin');
  if (init?.redirect !== 'error' || init?.credentials !== 'omit') throw Error('Read transport restrictions missing');
  return original(target, init);
};
