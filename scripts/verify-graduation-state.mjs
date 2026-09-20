import { execFileSync } from "node:child_process";

const required = [
  "RPC_URL",
  "CURVE_ADDRESS",
  "TOKEN_ADDRESS",
  "QUOTE_ADDRESS",
  "POOL_ADDRESS",
  "LOCKER_ADDRESS",
  "POSITION_MANAGER_ADDRESS",
  "LP_TOKEN_ID",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env: ${key}`);
    process.exit(1);
  }
}

const rpcUrl = process.env.RPC_URL;
const curve = process.env.CURVE_ADDRESS.toLowerCase();
const token = process.env.TOKEN_ADDRESS.toLowerCase();
const quote = process.env.QUOTE_ADDRESS.toLowerCase();
const pool = process.env.POOL_ADDRESS.toLowerCase();
const locker = process.env.LOCKER_ADDRESS.toLowerCase();
const positionManager = process.env.POSITION_MANAGER_ADDRESS.toLowerCase();
const lpTokenId = BigInt(process.env.LP_TOKEN_ID);
const maxDeviationBps = BigInt(process.env.MAX_PRICE_DEVIATION_BPS || "100");

let rpcId = 1;

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }

  const body = await response.json();
  if (body.error) {
    throw new Error(body.error.message || "RPC error");
  }
  return body.result;
}

function sig(signature) {
  return execFileSync("cast", ["sig", signature], {
    encoding: "utf8",
  }).trim();
}

function uintWord(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function addressWord(value) {
  return value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function word(data, index = 0) {
  const hex = String(data || "").replace(/^0x/, "");
  const start = index * 64;
  const out = hex.slice(start, start + 64);
  if (out.length !== 64) {
    throw new Error(`Short ABI result at word ${index}: ${data}`);
  }
  return out;
}

function asUint(data, index = 0) {
  return BigInt("0x" + word(data, index));
}

function asAddress(data, index = 0) {
  return ("0x" + word(data, index).slice(24)).toLowerCase();
}

async function call(to, signature, args = "") {
  const data = sig(signature) + args;
  return rpc("eth_call", [{ to, data }, "latest"]);
}

async function codeAt(address) {
  return rpc("eth_getCode", [address, "latest"]);
}

const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
}

for (const [name, address] of [
  ["curve bytecode", curve],
  ["token bytecode", token],
  ["quote bytecode", quote],
  ["pool bytecode", pool],
  ["locker bytecode", locker],
  ["position manager bytecode", positionManager],
]) {
  const code = await codeAt(address);
  check(name, code !== "0x" && code !== "0x0", `codeBytes=${Math.max(0, (code.length - 2) / 2)}`);
}

const graduated = asUint(await call(curve, "graduated()")) !== 0n;
check("curve graduated", graduated, String(graduated));

const phase = asUint(await call(curve, "phase()"));
check("curve phase PoolCreated", phase === 2n, `phase=${phase}`);

const anchor = asUint(await call(curve, "graduationAnchorPriceUsd1e18()"));
check("graduation anchor set", anchor > 0n, `anchor=${anchor}`);

const lockedCount = asUint(await call(locker, "lockedPositionCount()"));
check("locker has LP position", lockedCount >= 1n, `count=${lockedCount}`);

const firstLockedId = asUint(
  await call(locker, "lockedTokenIds(uint256)", uintWord(0n))
);
check(
  "expected LP token id locked",
  firstLockedId === lpTokenId,
  `expected=${lpTokenId} actual=${firstLockedId}`
);

const owner = asAddress(
  await call(positionManager, "ownerOf(uint256)", uintWord(lpTokenId))
);
check("locker owns LP NFT", owner === locker, `owner=${owner}`);

const tokenBalance = asUint(
  await call(token, "balanceOf(address)", addressWord(curve))
);
const quoteBalance = asUint(
  await call(quote, "balanceOf(address)", addressWord(curve))
);
check("curve launch-token dust is zero", tokenBalance === 0n, `balance=${tokenBalance}`);
check("curve quote dust is zero", quoteBalance === 0n, `balance=${quoteBalance}`);

const token0 = asAddress(await call(pool, "token0()"));
const token1 = asAddress(await call(pool, "token1()"));
check(
  "pool token pair matches drill",
  (token0 === quote && token1 === token) || (token0 === token && token1 === quote),
  `token0=${token0} token1=${token1}`
);

const slot0 = await call(pool, "slot0()");
const sqrtPriceX96 = asUint(slot0, 0);
const q192 = 1n << 192n;
const one = 10n ** 18n;
let poolLaunchPrice1e18;

if (token0 === quote && token1 === token) {
  poolLaunchPrice1e18 = (q192 * one) / (sqrtPriceX96 * sqrtPriceX96);
} else if (token0 === token && token1 === quote) {
  poolLaunchPrice1e18 = (sqrtPriceX96 * sqrtPriceX96 * one) / q192;
} else {
  poolLaunchPrice1e18 = 0n;
}

const diff =
  poolLaunchPrice1e18 > anchor
    ? poolLaunchPrice1e18 - anchor
    : anchor - poolLaunchPrice1e18;
const deviationBps = anchor > 0n ? (diff * 10_000n) / anchor : 10_000n;

check(
  "Pancake opening price matches graduation anchor",
  deviationBps <= maxDeviationBps,
  `anchor=${anchor} poolPrice=${poolLaunchPrice1e18} deviationBps=${deviationBps}`
);

const report = {
  rpcUrl,
  curve,
  token,
  quote,
  pool,
  locker,
  positionManager,
  lpTokenId: lpTokenId.toString(),
  anchor: anchor.toString(),
  poolLaunchPrice1e18: poolLaunchPrice1e18.toString(),
  deviationBps: deviationBps.toString(),
  checks,
};

console.log("FORTUNE_GRADUATION_STATE_REPORT");
console.log(JSON.stringify(report, null, 2));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`${failed.length} graduation-state checks failed.`);
  process.exit(1);
}

console.log(`All ${checks.length} graduation-state checks passed.`);
