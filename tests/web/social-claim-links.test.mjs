import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import {
  SOCIAL_PLATFORMS,
  bindingRefusal,
  canonicalAccount,
  claimAccountOf,
  claimLinkMessage,
  claimLinkUrl,
  claimSecretFromText,
  describeAccount,
  isVaultCanonical,
  newClaimSecret,
} from "../../lib/social-fees.ts";
import { readXiaohongshuNote, resolveSocialAccount, verifySocialProof, xiaohongshuNoteRef } from "../../lib/social-verify.ts";
import { CLAIM_LINK_LIMIT, mergeClaimLinks, parseClaimLinks } from "../../lib/claim-link-store.ts";

const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CODE = "fortune-0123456789abcdef01234567";
const NOTE = "698f6e4b0000000028021b4e";
const AUTHOR = "5d1819120000000010037e46";
const platform = (key) => SOCIAL_PLATFORMS.find((item) => item.key === key);
const request = (key, account, proofUrl, extra = {}) => ({ platform: platform(key), account, code: CODE, wallet: WALLET, proofUrl, ...extra });

/** Routes by URL; records each call's URL and redirect mode; 3xx replies carry a Location. */
function routes(table) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, redirect: init?.redirect });
    for (const [pattern, reply] of table) {
      if (pattern.test(url)) {
        const [status, body, location] = typeof reply === "function" ? reply(url) : reply;
        return new Response(status >= 300 && status < 400 ? null : body, { status, headers: location ? { location } : {} });
      }
    }
    return new Response("not found", { status: 404 });
  };
  return { fetcher, calls };
}

// A note page as Xiaohongshu serves it: a JavaScript object literal with `undefined` values.
function notePage({ noteId = NOTE, userId = AUTHOR, title = "探店笔记", desc = "", nickname = "Valley Girl", meta = "" } = {}) {
  const state = {
    global: { desktopPrompt: "__UNDEF__", firstVisitUrl: "__UNDEF__", flags: [1, "__UNDEF__"] },
    note: {
      firstNoteId: noteId,
      noteDetailMap: {
        [noteId]: { comments: { list: [] }, note: { xsecToken: "AB", noteId, title, desc, type: "normal", user: { xsecToken: "AB", userId, nickname }, time: 1771039861000 } },
        // Another note on the page, containing the code, by the right author: it must not count.
        "000000000000000000000001": { note: { noteId: "000000000000000000000001", title: CODE, desc: CODE, user: { userId: AUTHOR } } },
      },
    },
  };
  const literal = JSON.stringify(state).replace(/"__UNDEF__"/g, "undefined");
  return `<!doctype html><html><head><meta name="description" content="${meta}"></head><body><div id="app"></div><script>window.__SSR__=true</script><script>window.__INITIAL_STATE__=${literal}</script></body></html>`;
}

test("Xiaohongshu: note links, share text and short links name a note", () => {
  assert.deepEqual(xiaohongshuNoteRef(new URL(`https://www.xiaohongshu.com/explore/${NOTE.toUpperCase()}?xsec_token=AB&xsec_source=pc_share`)), { noteId: NOTE });
  assert.deepEqual(xiaohongshuNoteRef(new URL(`https://xiaohongshu.com/discovery/item/${NOTE}`)), { noteId: NOTE });
  assert.deepEqual(xiaohongshuNoteRef(new URL("http://xhslink.com/m/ARQuOnXIImV")), { short: "/m/ARQuOnXIImV" });
  assert.deepEqual(xiaohongshuNoteRef(new URL("https://xhslink.com/a/AbCd1234")), { short: "/a/AbCd1234" });
  assert.equal(xiaohongshuNoteRef(new URL(`https://www.xiaohongshu.com/user/profile/${AUTHOR}`)), null);
  assert.equal(xiaohongshuNoteRef(new URL(`https://www.xiaohongshu.com/explore/${NOTE}/extra`)), null);
  assert.equal(xiaohongshuNoteRef(new URL(`https://evil.example/explore/${NOTE}`)), null);
  assert.equal(xiaohongshuNoteRef(new URL(`https://xiaohongshu.com.evil.example/explore/${NOTE}`)), null);
  assert.equal(xiaohongshuNoteRef(new URL("https://xhslink.com/m/ab/cd")), null);

  const ok = (raw, account) => {
    const parsed = canonicalAccount("xiaohongshu", raw);
    assert.ok(parsed.ok, `${raw}: ${parsed.reason}`);
    assert.equal(parsed.account, account);
    assert.ok(isVaultCanonical(parsed.account));
  };
  ok(AUTHOR, AUTHOR);
  ok(AUTHOR.toUpperCase(), AUTHOR);
  ok(`https://www.xiaohongshu.com/user/profile/${AUTHOR}?xsec_token=AB`, AUTHOR);
  ok(`xiaohongshu.com/user/profile/${AUTHOR}`, AUTHOR);
  // Note links and short links name the account only through the note: Fortune's server reads it.
  for (const raw of [
    `https://www.xiaohongshu.com/explore/${NOTE}`,
    `https://www.xiaohongshu.com/discovery/item/${NOTE}?source=webshare`,
    "http://xhslink.com/m/ARQuOnXIImV",
    "片源 67 我发现了一篇小红书笔记，快来看吧 😆 3j4CgJqOMZq 😆 http://xhslink.com/m/ARQuOnXIImV ，复制本条信息，打开【小红书】App查看精彩内容！",
    `【探店笔记 - Valley Girl | 小红书】 https://www.xiaohongshu.com/discovery/item/${NOTE}，复制`,
  ]) {
    const parsed = canonicalAccount("xiaohongshu", raw);
    assert.equal(parsed.ok, false, raw);
    assert.equal(parsed.resolvable, true, raw);
  }
  // A 小红书号 cannot be looked up without a login.
  const redId = canonicalAccount("xiaohongshu", "95123456789");
  assert.equal(redId.ok, false);
  assert.match(redId.reason, /小红书号/);
  assert.equal(canonicalAccount("xiaohongshu", `https://evil.example/user/profile/${AUTHOR}`).ok, false);
  assert.equal(describeAccount(11, AUTHOR), "5d1819…7e46");
});

test("Xiaohongshu: only the page's own state script counts, and only the requested note in it", () => {
  const note = readXiaohongshuNote(notePage({ desc: `今天 ${CODE}` }), NOTE);
  assert.deepEqual(note, { noteId: NOTE, title: "探店笔记", desc: `今天 ${CODE}`, userId: AUTHOR, nickname: "Valley Girl" });
  assert.equal(readXiaohongshuNote(notePage(), "0123456789abcdef01234567"), "missing");
  assert.equal(readXiaohongshuNote("<html>请登录</html>", NOTE), null);
  // User text lands in the page escaped, so it can never open a state script of its own.
  const forged = `&lt;script&gt;window.__INITIAL_STATE__={&quot;note&quot;:{&quot;noteDetailMap&quot;:{&quot;${NOTE}&quot;:{&quot;note&quot;:{&quot;noteId&quot;:&quot;${NOTE}&quot;,&quot;desc&quot;:&quot;${CODE}&quot;,&quot;user&quot;:{&quot;userId&quot;:&quot;${"a".repeat(24)}&quot;}}}}}}`;
  assert.equal(readXiaohongshuNote(notePage({ meta: forged }), NOTE).userId, AUTHOR);
  assert.equal(readXiaohongshuNote(notePage({ userId: "not-an-id" }), NOTE), "missing");
});

test("Xiaohongshu: the note's author and text decide, and redirects are read, never followed", async () => {
  const page = (options) => routes([[new RegExp(`^https://www\\.xiaohongshu\\.com/explore/${NOTE}$`), [200, notePage(options)]]]);
  const link = `https://www.xiaohongshu.com/discovery/item/${NOTE}?xsec_token=AB`;

  const good = page({ title: "绑定钱包", desc: `代码 ${CODE}` });
  const outcome = await verifySocialProof(request("xiaohongshu", AUTHOR, link), { fetcher: good.fetcher, env: {} });
  assert.equal(outcome.ok, true, outcome.message);
  assert.equal(outcome.stableRawId, AUTHOR);
  assert.deepEqual(outcome.evidence, { url: `https://www.xiaohongshu.com/explore/${NOTE}`, author: "Valley Girl", excerpt: "绑定钱包" });
  // The share token is never forwarded, and nothing is followed.
  assert.deepEqual(good.calls, [{ url: `https://www.xiaohongshu.com/explore/${NOTE}`, redirect: "manual" }]);

  const titleOnly = await verifySocialProof(request("xiaohongshu", AUTHOR, link), { fetcher: page({ title: CODE }).fetcher, env: {} });
  assert.equal(titleOnly.ok, true);
  assert.equal((await verifySocialProof(request("xiaohongshu", AUTHOR, link), { fetcher: page({ desc: "没有代码" }).fetcher, env: {} })).code, "CODE_MISSING");
  const wrong = await verifySocialProof(request("xiaohongshu", "0123456789abcdef01234567", link), { fetcher: page({ desc: CODE }).fetcher, env: {} });
  assert.equal(wrong.code, "WRONG_ACCOUNT");
  assert.match(wrong.message, /Valley Girl/);

  const redirect = (location) => routes([[/xiaohongshu\.com\/explore\//, [302, null, location]]]);
  const gone = redirect(`https://www.xiaohongshu.com/404/sec_x?redirectPath=%2Fexplore%2F${NOTE}&error_code=300031`);
  assert.equal((await verifySocialProof(request("xiaohongshu", AUTHOR, link), { fetcher: gone.fetcher, env: {} })).code, "PROOF_NOT_FOUND");
  assert.equal(gone.calls.length, 1);
  const login = redirect("https://www.xiaohongshu.com/login?redirectPath=x");
  assert.equal((await verifySocialProof(request("xiaohongshu", AUTHOR, link), { fetcher: login.fetcher, env: {} })).code, "SOURCE_UNAVAILABLE");
  assert.equal(login.calls.length, 1);
  const unreadable = routes([[/xiaohongshu\.com\/explore\//, [200, "<html>安全验证</html>"]]]);
  assert.equal((await verifySocialProof(request("xiaohongshu", AUTHOR, link), { fetcher: unreadable.fetcher, env: {} })).code, "SOURCE_UNAVAILABLE");

  const elsewhere = routes([]);
  assert.equal((await verifySocialProof(request("xiaohongshu", AUTHOR, `https://evil.example/explore/${NOTE}`), { fetcher: elsewhere.fetcher, env: {} })).code, "PROOF_URL");
  assert.equal(elsewhere.calls.length, 0);
});

test("Xiaohongshu short links: only a note on xiaohongshu.com counts, fetched from the fixed origin", async () => {
  const via = (location) =>
    routes([
      [/^https:\/\/xhslink\.com\/m\/ARQuOnXIImV$/, [302, null, location]],
      [new RegExp(`^https://www\\.xiaohongshu\\.com/explore/${NOTE}$`), [200, notePage({ desc: CODE })]],
    ]);
  const share = "片源 67 我发现了一篇小红书笔记，快来看吧 😆 3j4CgJqOMZq 😆 http://xhslink.com/m/ARQuOnXIImV ，复制本条信息，打开【小红书】App查看精彩内容！";

  const good = via(`https://www.xiaohongshu.com/discovery/item/${NOTE}?app_platform=ios&xsec_token=AB&xsec_source=app_share`);
  const outcome = await verifySocialProof(request("xiaohongshu", AUTHOR, share), { fetcher: good.fetcher, env: {} });
  assert.equal(outcome.ok, true, outcome.message);
  assert.deepEqual(good.calls, [
    { url: "https://xhslink.com/m/ARQuOnXIImV", redirect: "manual" },
    { url: `https://www.xiaohongshu.com/explore/${NOTE}`, redirect: "manual" },
  ]);

  for (const location of ["https://www.xiaohongshu.com", `https://evil.example/explore/${NOTE}`, `https://www.xiaohongshu.com/user/profile/${AUTHOR}`, null]) {
    const bad = via(location);
    const result = await verifySocialProof(request("xiaohongshu", AUTHOR, "http://xhslink.com/m/ARQuOnXIImV"), { fetcher: bad.fetcher, env: {} });
    assert.equal(result.code, "PROOF_NOT_FOUND", String(location));
    assert.equal(bad.calls.length, 1, String(location));
  }
});

test("Xiaohongshu resolve: a profile link needs no request; a note link gives the id and the name", async () => {
  const none = routes([]);
  assert.deepEqual(await resolveSocialAccount(platform("xiaohongshu"), `https://www.xiaohongshu.com/user/profile/${AUTHOR}`, { fetcher: none.fetcher, env: {} }), { ok: true, account: AUTHOR, name: null });
  assert.deepEqual(await resolveSocialAccount(platform("xiaohongshu"), AUTHOR.toUpperCase(), { fetcher: none.fetcher, env: {} }), { ok: true, account: AUTHOR, name: null });
  assert.equal(none.calls.length, 0);
  const page = routes([[/xiaohongshu\.com\/explore\//, [200, notePage()]]]);
  assert.deepEqual(await resolveSocialAccount(platform("xiaohongshu"), `https://www.xiaohongshu.com/explore/${NOTE}`, { fetcher: page.fetcher, env: {} }), { ok: true, account: AUTHOR, name: "Valley Girl" });
  const bad = await resolveSocialAccount(platform("xiaohongshu"), "95123456789", { fetcher: none.fetcher, env: {} });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "PROOF_URL");
});

test("private claim links: the account is keccak256 of the secret, and only its canonical spelling counts", () => {
  const zero = "A".repeat(43);
  assert.equal(claimAccountOf(zero), keccak256(new Uint8Array(32)).slice(2));
  assert.equal(claimAccountOf(zero), "290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563");
  // "B" differs only in padding bits: the same bytes, but a second spelling of the link.
  assert.equal(claimAccountOf(`${"A".repeat(42)}B`), null);
  assert.equal(claimAccountOf("A".repeat(44)), null);
  assert.equal(claimAccountOf(`${"A".repeat(42)}+`), null);

  const secrets = new Set(Array.from({ length: 50 }, () => newClaimSecret()));
  assert.equal(secrets.size, 50);
  for (const secret of secrets) {
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
    const account = claimAccountOf(secret);
    assert.match(account, /^[0-9a-f]{64}$/);
    assert.ok(isVaultCanonical(account));
  }

  const secret = [...secrets][0];
  const account = claimAccountOf(secret);
  const link = claimLinkUrl("https://fortunepad.fun/", secret);
  assert.equal(link, `https://fortunepad.fun/claims#claim=${secret}`);
  for (const text of [link, `#claim=${secret}`, secret, `Open ${link} in your wallet`, `https://preview.example/claims?x=1&claim=${secret}`]) {
    assert.equal(claimSecretFromText(text), secret, text);
  }
  for (const text of [null, "", "#claim=short", `#xclaim=${secret}`, `#claim=${secret}A`]) assert.equal(claimSecretFromText(text), null, String(text));

  for (const raw of [link, secret, account, account.toUpperCase()]) {
    const parsed = canonicalAccount("link", raw);
    assert.ok(parsed.ok, raw);
    assert.equal(parsed.account, account);
  }
  assert.equal(canonicalAccount("link", `0x${account}`).ok, false);
  assert.equal(canonicalAccount("link", "douyin:someone").ok, false);
  assert.equal(describeAccount(12, account), `${account.slice(0, 6)}…${account.slice(-4)}`);

  const message = claimLinkMessage(link, "CAT");
  assert.equal(message.split(link).length, 3, "the link appears in both languages");
  assert.match(message, /\$CAT on Fortune/);
  assert.match(message, /请勿外传/);
  assert.match(claimLinkMessage(link, null), /a Fortune launch/);
});

test("private claim links: the verifier checks the secret offline and never fetches anything", async () => {
  const secret = newClaimSecret();
  const account = claimAccountOf(secret);
  const fetcher = async () => {
    throw new Error("a claim link must not reach the network");
  };
  const ok = await verifySocialProof(request("link", account, null, { secret }), { fetcher, env: {} });
  assert.equal(ok.ok, true);
  assert.equal(ok.stableRawId, account);
  assert.equal(ok.evidence.url, null);
  assert.ok(!JSON.stringify(ok).includes(secret), "the secret is never echoed");
  assert.equal((await verifySocialProof(request("link", account, null, { secret: newClaimSecret() }), { fetcher, env: {} })).code, "WRONG_ACCOUNT");
  assert.equal((await verifySocialProof(request("link", account, null), { fetcher, env: {} })).code, "PROOF_URL");
  assert.equal((await verifySocialProof(request("link", account, null, { secret: `${secret}x` }), { fetcher, env: {} })).code, "PROOF_URL");
});

test("a claim link binds once; other accounts keep the delayed rebind", () => {
  const other = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const free = { wallet: null, pendingWallet: null };
  assert.equal(bindingRefusal("link", free, WALLET), null);
  assert.equal(bindingRefusal("link", { wallet: null, pendingWallet: other }, WALLET)?.reason, "LINK_USED");
  assert.equal(bindingRefusal("link", { wallet: other, pendingWallet: null }, WALLET)?.reason, "LINK_USED");
  assert.match(bindingRefusal("link", { wallet: WALLET.toLowerCase(), pendingWallet: null }, WALLET)?.message, /already receives/);
  // Platforms with a public proof can still move to a new wallet, after the rebind delay.
  assert.equal(bindingRefusal("xiaohongshu", { wallet: other, pendingWallet: null }, WALLET), null);
  assert.equal(bindingRefusal("x", { wallet: null, pendingWallet: other }, WALLET), null);
  assert.match(bindingRefusal("x", { wallet: null, pendingWallet: WALLET }, WALLET)?.message, /already waiting/);
});

test("claim links saved in the browser: valid, distinct, newest first, capped", () => {
  const [a, b, c] = [newClaimSecret(), newClaimSecret(), newClaimSecret()];
  const curve = "0x" + "ab".repeat(20);
  const stored = JSON.stringify([
    { secret: a, note: "Douyin @cat", createdAt: 1, curve, symbol: "CAT" },
    { secret: a, note: "duplicate" },
    { secret: "not-a-secret" },
    { secret: b, curve: "0xnot", note: 7 },
    null,
  ]);
  const parsed = parseClaimLinks(stored);
  assert.deepEqual(parsed.map((link) => [link.note, link.curve, link.symbol]), [["Douyin @cat", curve, "CAT"], ["", null, null]]);
  assert.equal(parsed[0].account, claimAccountOf(a));
  assert.deepEqual(parseClaimLinks("{broken"), []);
  assert.deepEqual(parseClaimLinks(null), []);

  // A launch confirming fills in the curve without losing the note; new links go first.
  const merged = mergeClaimLinks(parsed, [{ secret: b, curve, symbol: "CAT" }, { secret: c, note: "Zhihu" }], 99);
  assert.deepEqual(merged.map((link) => [link.account, link.note, link.curve]), [
    [claimAccountOf(b), "", curve],
    [claimAccountOf(c), "Zhihu", null],
    [claimAccountOf(a), "Douyin @cat", curve],
  ]);
  assert.equal(merged[1].createdAt, 99);
  const many = mergeClaimLinks([], Array.from({ length: CLAIM_LINK_LIMIT + 5 }, () => ({ secret: newClaimSecret() })));
  assert.equal(many.length, CLAIM_LINK_LIMIT);
});
