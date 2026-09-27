import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hashTypedData, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  SOCIAL_FEE_RULES,
  SOCIAL_PLATFORMS,
  bindingTypedData,
  buildFeeShares,
  canonicalAccount,
  challengeCode,
  identityIdOf,
  isVaultCanonical,
  stableIdHash,
  walletIdentityOf,
} from "../../lib/social-fees.ts";
import { htmlToText, proofOrigins, verifySocialProof, xPostId, xSyndicationToken } from "../../lib/social-verify.ts";
import { SOCIAL_FEE_VAULT_ABI, CUSTOM_PAIR_FACTORY_ABI } from "../../lib/custom-pairs-artifacts.ts";

const VAULT = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const platform = (key) => SOCIAL_PLATFORMS.find((item) => item.key === key);

test("ids and the EIP-712 digest match FortuneSocialFeeVault (pinned in the Foundry suite too)", () => {
  const id = identityIdOf(1, "fortunepad");
  assert.equal(id, "0x935b450ef3bbe9c6a7771a42e8197c6f437f2b7d862d50bf7f8986296593dedb");
  assert.equal(walletIdentityOf(WALLET), "0xd3a93e7218b271cb9ca81fec1cdfcf6e7686ea0002660580b37e3bb93bc52785");
  const digest = hashTypedData(
    bindingTypedData({ chainId: 97, vault: VAULT, identityId: id, wallet: WALLET, stableId: `0x${"0".repeat(62)}0c`, nonce: 3n, deadline: 1_900_000_000n })
  );
  assert.equal(digest, "0xd66a5bd92f5a4ed8c1faa95a893b7b551ab27febe7a5d30997195b1dafb2eb71");
});

test("a signed binding recovers to the attestor", async () => {
  const signer = privateKeyToAccount(generatePrivateKey());
  const data = bindingTypedData({
    chainId: 97,
    vault: VAULT,
    identityId: identityIdOf(2, "octocat"),
    wallet: WALLET,
    stableId: stableIdHash("github", "583231"),
    nonce: 0n,
    deadline: 1_900_000_000n,
  });
  const signature = await signer.signTypedData(data);
  assert.equal(await recoverTypedDataAddress({ ...data, signature }), signer.address);
});

test("website constants mirror the vault", () => {
  const vault = readFileSync(new URL("../../contracts-custom-pairs/src/FortuneSocialFeeVault.sol", import.meta.url), "utf8");
  const constant = (name) => vault.match(new RegExp(`${name} = ([0-9_]+(?: (?:hours|days))?);`))?.[1];
  assert.equal(Number(constant("MAX_SHARES")), SOCIAL_FEE_RULES.maxShares);
  assert.equal(Number(constant("MIN_SHARE_BPS")), SOCIAL_FEE_RULES.minShareBps);
  assert.equal(Number(constant("MAX_PLATFORM")), SOCIAL_FEE_RULES.maxPlatform);
  assert.equal(Number(constant("MAX_ACCOUNT_LENGTH")), SOCIAL_FEE_RULES.maxAccountLength);
  assert.equal(constant("FIRST_BIND_DELAY"), "1 hours");
  assert.equal(SOCIAL_FEE_RULES.firstBindDelaySeconds, 3_600);
  assert.equal(constant("REBIND_DELAY"), "3 days");
  assert.equal(SOCIAL_FEE_RULES.rebindDelaySeconds, 259_200);
  // Platform ids are permanent onchain values.
  assert.deepEqual(
    SOCIAL_PLATFORMS.map((item) => [item.id, item.key]),
    [[1, "x"], [2, "github"], [3, "tiktok"], [4, "telegram"], [5, "youtube"], [6, "farcaster"], [7, "bluesky"]]
  );
  for (const item of SOCIAL_PLATFORMS) assert.ok(item.id > 0 && item.id <= SOCIAL_FEE_RULES.maxPlatform);
});

test("pasted handles and profile links become the vault's canonical account", () => {
  const ok = (platformKey, raw, account) => {
    const parsed = canonicalAccount(platformKey, raw);
    assert.ok(parsed.ok, `${platformKey} ${raw}: ${parsed.reason}`);
    assert.equal(parsed.account, account);
    assert.ok(isVaultCanonical(parsed.account));
  };
  ok("x", "@FortunePad", "fortunepad");
  ok("x", "https://x.com/FortunePad", "fortunepad");
  ok("x", "twitter.com/fortunepad/", "fortunepad");
  ok("github", "https://github.com/Octo-Cat", "octo-cat");
  ok("tiktok", "https://www.tiktok.com/@scout2015", "scout2015");
  ok("telegram", "https://t.me/s/FortunePad", "fortunepad");
  ok("youtube", "https://www.youtube.com/@Jawed", "jawed");
  ok("farcaster", "https://farcaster.xyz/dwr", "dwr");
  ok("farcaster", "vitalik.eth", "vitalik.eth");
  ok("bluesky", "https://bsky.app/profile/Alice.bsky.social", "alice.bsky.social");
  ok(1, "alice", "alice");

  const bad = (platformKey, raw) => assert.equal(canonicalAccount(platformKey, raw).ok, false, `${platformKey} ${raw}`);
  bad("x", "");
  bad("x", "has space");
  bad("x", "this_handle_is_too_long");
  bad("x", "https://evil.example/fortunepad");
  bad("github", "-leading-dash");
  bad("telegram", "abc");
  bad("bluesky", "no-dot");
  bad("myspace", "tom");
});

test("fee split rules match checkShares, and a lone creator wallet is a plain launch", () => {
  const creator = WALLET;
  assert.deepEqual(buildFeeShares([{ kind: "wallet", wallet: creator, percent: "100" }], creator), { ok: true, shares: [] });
  const split = buildFeeShares(
    [
      { kind: "wallet", wallet: creator, percent: "50" },
      { kind: "social", platform: 1, account: "@Alice", percent: "30.5" },
      { kind: "social", platform: 2, account: "bob", percent: "19.5" },
    ],
    creator
  );
  assert.ok(split.ok);
  assert.deepEqual(
    split.shares.map((share) => [share.platform, share.account, share.shareBps]),
    [[0, "", 5_000], [1, "alice", 3_050], [2, "bob", 1_950]]
  );
  assert.equal(split.shares[1].wallet, "0x0000000000000000000000000000000000000000");

  const reason = (rows) => buildFeeShares(rows, creator).reason;
  assert.match(reason([{ kind: "social", platform: 1, account: "alice", percent: "99" }]), /99%, not 100%/);
  assert.match(reason([{ kind: "social", platform: 1, account: "alice", percent: "99.5" }, { kind: "social", platform: 2, account: "a", percent: "0.5" }]), /at least 1%/);
  assert.match(reason([{ kind: "social", platform: 1, account: "alice", percent: "50" }, { kind: "social", platform: 1, account: "ALICE", percent: "50" }]), /already listed/);
  assert.match(reason([{ kind: "social", platform: 1, account: "alice", percent: "50.555" }, { kind: "wallet", wallet: creator, percent: "49.445" }]), /two decimals/);
  assert.match(reason(Array.from({ length: 11 }, (_, i) => ({ kind: "wallet", wallet: `0x${String(i + 1).padStart(40, "0")}`, percent: "9.09" }))), /Up to 10/);
});

test("challenge codes commit to the wallet and the nonce", () => {
  const identityId = identityIdOf(1, "alice");
  const base = { chainId: 97, vault: VAULT, identityId, wallet: WALLET, nonce: 0 };
  const code = challengeCode(base);
  assert.match(code, /^fortune-[0-9a-f]{24}$/);
  assert.equal(challengeCode({ ...base }), code);
  assert.notEqual(challengeCode({ ...base, nonce: 1 }), code);
  assert.notEqual(challengeCode({ ...base, wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" }), code);
  assert.notEqual(challengeCode({ ...base, chainId: 56 }), code);
});

function fakeFetch(routes) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    for (const [pattern, response] of routes) {
      if (pattern.test(url)) {
        const [status, body] = typeof response === "function" ? response(url) : response;
        return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
      }
    }
    return new Response("not found", { status: 404 });
  };
  return { fetcher, calls };
}

const request = (key, account, proofUrl, code = "fortune-0123456789abcdef01234567") => ({
  platform: platform(key),
  account,
  code,
  wallet: WALLET,
  proofUrl,
});

test("X: the post author and text decide, whatever handle the link uses", async () => {
  assert.equal(xPostId(new URL("https://twitter.com/whoever/status/20")), "20");
  assert.equal(xPostId(new URL("https://x.com/i/web/status/1234567890123")), "1234567890123");
  assert.equal(xPostId(new URL("https://evil.com/alice/status/20")), null);
  assert.equal(xSyndicationToken("20"), ((20 / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""));

  const post = { __typename: "Tweet", text: "Verifying: fortune-0123456789abcdef01234567", user: { screen_name: "Alice", id_str: "42" } };
  const good = fakeFetch([[/cdn\.syndication\.twimg\.com\/tweet-result\?id=777&token=/, [200, post]]]);
  const outcome = await verifySocialProof(request("x", "alice", "https://x.com/somebody_else/status/777"), { fetcher: good.fetcher, env: {} });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.stableRawId, "42");

  const wrong = fakeFetch([[/tweet-result/, [200, { ...post, user: { screen_name: "mallory", id_str: "9" } }]]]);
  const wrongOutcome = await verifySocialProof(request("x", "alice", "https://x.com/alice/status/777"), { fetcher: wrong.fetcher, env: {} });
  assert.equal(wrongOutcome.code, "WRONG_ACCOUNT");

  const missing = fakeFetch([[/tweet-result/, [200, { ...post, text: "gm" }]]]);
  assert.equal((await verifySocialProof(request("x", "alice", "https://x.com/alice/status/777"), { fetcher: missing.fetcher, env: {} })).code, "CODE_MISSING");

  // Syndication down: the oEmbed author and only the post paragraph count; no permanent id.
  const html = '<blockquote class="twitter-tweet"><p lang="en">Verifying &amp; claiming: fortune-0123456789abcdef01234567</p>&mdash; Alice (@alice) <a href="https://x.com/alice/status/777">May 1</a></blockquote>';
  const fallback = fakeFetch([
    [/tweet-result/, [500, "oops"]],
    [/publish\.twitter\.com\/oembed\?url=https%3A%2F%2Ftwitter\.com%2Fi%2Fstatus%2F777/, [200, { author_url: "https://x.com/alice", html }]],
  ]);
  const fallbackOutcome = await verifySocialProof(request("x", "alice", "https://x.com/alice/status/777"), { fetcher: fallback.fetcher, env: {} });
  assert.equal(fallbackOutcome.ok, true);
  assert.equal(fallbackOutcome.stableRawId, null);
  const bylineOnly = fakeFetch([
    [/tweet-result/, [500, "oops"]],
    [/publish\.twitter\.com/, [200, { author_url: "https://x.com/alice", html: '<blockquote><p>gm</p>&mdash; fortune-0123456789abcdef01234567</blockquote>' }]],
  ]);
  assert.equal((await verifySocialProof(request("x", "alice", "https://x.com/alice/status/777"), { fetcher: bylineOnly.fetcher, env: {} })).code, "CODE_MISSING");
  assert.equal((await verifySocialProof(request("x", "alice", "https://x.com/alice"), { fetcher: good.fetcher, env: {} })).code, "PROOF_URL");
});

test("GitHub: gist owner and content, with the numeric id pinned", async () => {
  const gist = { owner: { login: "Octocat", id: 583231 }, description: "", files: { "fortune.txt": { content: "fortune-0123456789abcdef01234567" } } };
  const { fetcher, calls } = fakeFetch([[/api\.github\.com\/gists\/aa5a315d61ae9438b18d$/, [200, gist]]]);
  const outcome = await verifySocialProof(request("github", "octocat", "https://gist.github.com/octocat/aa5a315d61ae9438b18d"), { fetcher, env: {} });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.stableRawId, "583231");
  assert.equal(calls[0], "https://api.github.com/gists/aa5a315d61ae9438b18d");
  const other = await verifySocialProof(request("github", "hubot", "https://gist.github.com/aa5a315d61ae9438b18d"), { fetcher, env: {} });
  assert.equal(other.code, "WRONG_ACCOUNT");
  const limited = fakeFetch([[/gists/, [403, { message: "API rate limit exceeded" }]]]);
  assert.equal((await verifySocialProof(request("github", "octocat", "https://gist.github.com/octocat/aa5a315d61ae9438b18d"), { fetcher: limited.fetcher, env: {} })).code, "SOURCE_UNAVAILABLE");
  assert.equal((await verifySocialProof(request("github", "octocat", "https://github.com/octocat"), { fetcher, env: {} })).code, "PROOF_URL");
});

test("TikTok, YouTube and Bluesky read the author from the platform", async () => {
  const tiktok = fakeFetch([[/tiktok\.com\/oembed/, [200, { author_unique_id: "Scout2015", title: "gm fortune-0123456789abcdef01234567" }]]]);
  assert.equal((await verifySocialProof(request("tiktok", "scout2015", "https://www.tiktok.com/@scout2015/video/6718335390845095173"), { fetcher: tiktok.fetcher, env: {} })).ok, true);
  assert.equal((await verifySocialProof(request("tiktok", "other", "https://www.tiktok.com/@other/video/6718335390845095173"), { fetcher: tiktok.fetcher, env: {} })).code, "WRONG_ACCOUNT");

  const youtube = fakeFetch([[/youtube\.com\/oembed/, [200, { author_url: "https://www.youtube.com/@Jawed", title: "Me at the zoo fortune-0123456789abcdef01234567" }]]]);
  assert.equal((await verifySocialProof(request("youtube", "jawed", "https://youtu.be/jNQXAC9IVRw"), { fetcher: youtube.fetcher, env: {} })).ok, true);
  const noHandle = fakeFetch([[/youtube\.com\/oembed/, [200, { author_url: "https://www.youtube.com/channel/UC123", title: "fortune-0123456789abcdef01234567" }]]]);
  assert.equal((await verifySocialProof(request("youtube", "jawed", "https://www.youtube.com/shorts/jNQXAC9IVRw"), { fetcher: noHandle.fetcher, env: {} })).code, "WRONG_ACCOUNT");

  const bluesky = fakeFetch([
    [/resolveHandle\?handle=alice\.bsky\.social/, [200, { did: "did:plc:abcdefghijklmnopqrstuvwx" }]],
    [/getPosts\?uris=at%3A%2F%2Fdid%3Aplc%3Aabcdefghijklmnopqrstuvwx%2Fapp\.bsky\.feed\.post%2F3k2abcdefgh2a/, [200, { posts: [{ author: { did: "did:plc:abcdefghijklmnopqrstuvwx", handle: "alice.bsky.social" }, record: { text: "fortune-0123456789abcdef01234567" } }] }]],
  ]);
  const outcome = await verifySocialProof(request("bluesky", "alice.bsky.social", "https://bsky.app/profile/alice.bsky.social/post/3k2abcdefgh2a"), { fetcher: bluesky.fetcher, env: {} });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.stableRawId, "did:plc:abcdefghijklmnopqrstuvwx");
});

test("Telegram: only a post published by the channel itself counts", async () => {
  const page = (owner, text) =>
    `<div class="tgme_widget_message" data-post="fortunepad/12"><a class="tgme_widget_message_owner_name" href="https://t.me/${owner}"><span>Fortune</span></a>` +
    `<div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div></div>`;
  const channel = fakeFetch([[/t\.me\/fortunepad\/12\?embed=1/, [200, page("fortunepad", "Claiming: <b>fortune-0123456789abcdef01234567</b>")]]]);
  assert.equal((await verifySocialProof(request("telegram", "fortunepad", "https://t.me/fortunepad/12"), { fetcher: channel.fetcher, env: {} })).ok, true);
  const member = fakeFetch([[/t\.me\/fortunepad\/12/, [200, page("mallory", "fortune-0123456789abcdef01234567")]]]);
  assert.equal((await verifySocialProof(request("telegram", "fortunepad", "https://t.me/fortunepad/12"), { fetcher: member.fetcher, env: {} })).code, "WRONG_ACCOUNT");
  const gone = fakeFetch([[/t\.me/, [200, '<div class="tgme_widget_message_error">Post not found</div>']]]);
  assert.equal((await verifySocialProof(request("telegram", "fortunepad", "https://t.me/fortunepad/12"), { fetcher: gone.fetcher, env: {} })).code, "PROOF_NOT_FOUND");
  assert.equal(htmlToText("a&amp;b <i>c</i>&#39;&#x41;"), "a&b c'A");
});

test("Farcaster: the wallet must be a verified externally owned address of that fid", async () => {
  const hub = (verifications) =>
    fakeFetch([
      [/userNameProofByName\?name=dwr/, [200, { fid: 3, owner: "0x74232bf61e994655592747e20bdf6fa9b9476f79" }]],
      [/verificationsByFid\?fid=3/, [200, { messages: verifications }]],
    ]);
  const eoa = { data: { fid: 3, verificationAddAddressBody: { address: WALLET.toLowerCase(), protocol: "PROTOCOL_ETHEREUM" } } };
  const contract = { data: { fid: 3, verificationAddAddressBody: { address: WALLET.toLowerCase(), protocol: "PROTOCOL_ETHEREUM", verificationType: 1, chainId: 1 } } };
  const ok = await verifySocialProof(request("farcaster", "dwr", null), { fetcher: hub([eoa]).fetcher, env: {} });
  assert.equal(ok.ok, true);
  assert.equal(ok.stableRawId, "3");
  assert.equal((await verifySocialProof(request("farcaster", "dwr", null), { fetcher: hub([contract]).fetcher, env: {} })).code, "WALLET_NOT_VERIFIED");
  assert.equal((await verifySocialProof(request("farcaster", "dwr", null), { fetcher: hub([]).fetcher, env: {} })).code, "WALLET_NOT_VERIFIED");
});

test("proof sources can only be redirected to a loopback test server", () => {
  assert.equal(proofOrigins({ FORTUNE_SOCIAL_PROOF_MOCK_ORIGIN: "http://127.0.0.1:4545" }).github, "http://127.0.0.1:4545/github");
  assert.equal(proofOrigins({ FORTUNE_SOCIAL_PROOF_MOCK_ORIGIN: "https://evil.example" }).github, "https://api.github.com");
  assert.equal(proofOrigins({ FORTUNE_SOCIAL_PROOF_MOCK_ORIGIN: "http://10.0.0.1:80" }).xSyndication, "https://cdn.syndication.twimg.com");
  assert.equal(proofOrigins({ FORTUNE_FARCASTER_HUB_URL: "http://insecure.example" }).farcaster, "https://hub.pinata.cloud");
});

function filesUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, out);
    else if (/\.(tsx?|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

test("the attestor key stays server-only", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const files = [...filesUnder(join(root, "app")), ...filesUnder(join(root, "components")), ...filesUnder(join(root, "lib"))];
  const users = files.filter((file) => readFileSync(file, "utf8").includes("FORTUNE_SOCIAL_ATTESTOR_PRIVATE_KEY"));
  assert.deepEqual(users.map((file) => file.slice(root.length)), ["lib/social-fees-server.ts"]);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.ok(!source.includes("NEXT_PUBLIC_FORTUNE_SOCIAL_ATTESTOR"), file);
    if (source.startsWith('"use client"')) assert.ok(!source.includes("social-fees-server") && !source.includes("social-verify"), file);
  }
});

test("generated ABIs expose what the website calls", () => {
  const names = (abi) => new Set(abi.filter((item) => item.type === "function").map((item) => item.name));
  const vault = names(SOCIAL_FEE_VAULT_ABI);
  for (const name of ["bind", "cancelPendingBinding", "collect", "claim", "collectAndClaim", "identityOf", "curveRecipients", "curvesOf", "tokensOf", "identitiesOfWallet", "claimable", "owed", "attestor", "bindingsPaused", "bindingDigest"]) {
    assert.ok(vault.has(name), name);
  }
  assert.ok(names(CUSTOM_PAIR_FACTORY_ABI).has("socialFeeVault"));
  const params = CUSTOM_PAIR_FACTORY_ABI.find((item) => item.name === "createLaunch").inputs[0].components;
  const shares = params.find((field) => field.name === "feeShares");
  assert.deepEqual(shares.components.map((field) => field.name), ["platform", "account", "wallet", "shareBps"]);
});
