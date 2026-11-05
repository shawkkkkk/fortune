import {
  concatHex, encodeAbiParameters, encodePacked, getAddress, isAddress,
  keccak256, parseAbi, parseAbiParameters, type Address, type Hex, type PublicClient,
} from "viem";

const uint256Max = (1n << 256n) - 1n;
const zeroAddress = "0x0000000000000000000000000000000000000000";
const maximumBytecodeBytes = 128 * 1024;
const searchLimit = 4096;
const readTimeoutMs = 20_000;
const manifestTypes = parseAbiParameters(
  "uint256, address, address, address, address, address, address, address, address, address, address, address, uint256, " +
  "string, string, uint256, address[], uint16[], address, uint256, uint256, uint256, bool, uint16[6], address, bool, " +
  "string, string, string, string, string, string, string, string",
);
const constructorTypes = parseAbiParameters("address, string, string, uint256, bytes32");
const factoryAbi = parseAbi([
  "struct LaunchParams { string name; string symbol; uint256 totalSupply; address[] quoteAssets; uint16[] weightsBps; address primaryQuote; uint256 basePriceUsd1e18; uint256 slopeUsd1e18; uint256 graduationUsd1e18; bool adaptiveGraduation; uint16[6] feeBps; address treasury; bool metadataEditable; string description; string imageURI; string website; string xProfile; string telegram; string github; string youtube; string debox; }",
  "function previewPreparedVanity(address creator, LaunchParams p) view returns (bytes32, address, bytes32, uint256)",
  "function creatorLaunchNonce(address creator) view returns (uint256)",
  "function tokenDeployer() view returns (address)",
]);
const deployerAbi = parseAbi([
  "function predict(address factory, string name, string symbol, uint256 supply, bytes32 manifest, bytes32 salt) view returns (address)",
]);

type FactoryContext = {
  chainId: 97; factory: Address; registry: Address; automationRegistry: Address;
  metadataRegistry: Address; tokenDeployer: Address; vaultDeployer: Address;
  feeRouterDeployer: Address; curveDeployer: Address; automationExecutor: Address;
  graduationAdapter: Address;
};
type LaunchParams = {
  name: string; symbol: string; totalSupply: bigint; quoteAssets: readonly Address[];
  weightsBps: readonly number[]; primaryQuote: Address; basePriceUsd1e18: bigint;
  slopeUsd1e18: bigint; graduationUsd1e18: bigint; adaptiveGraduation: boolean;
  feeBps: readonly [number, number, number, number, number, number]; treasury: Address;
  metadataEditable: boolean; description: string; imageURI: string; website: string;
  xProfile: string; telegram: string; github: string; youtube: string; debox: string;
};
type Preparation = {
  context: FactoryContext; creator: Address; launchNonce: bigint; params: LaunchParams;
  tokenCreationCode: Hex; expectedCreationCodeHash: Hex;
};
type ObservationPolicy = Preparation & {
  blockNumber: bigint; blockHash: Hex; factoryRuntimeHash: Hex; deployerRuntimeHash: Hex;
};
type ReadClient = Pick<PublicClient, "getChainId" | "getBlock" | "getCode" | "getTransactionCount" | "readContract">;

function addr(value: Address, allowZero = false): Address {
  if (typeof value !== "string" || !isAddress(value) || (!allowZero && value.toLowerCase() === zeroAddress))
    throw Error("Invalid Standard vanity address input");
  return getAddress(value);
}
function hash(value: Hex): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value) || /^0x0{64}$/i.test(value))
    throw Error("Invalid Standard vanity hash pin");
  return value.toLowerCase() as Hex;
}
function uint(value: bigint): bigint {
  if (typeof value !== "bigint" || value < 0n || value > uint256Max) throw Error("Invalid Standard vanity uint256");
  return value;
}
function uint16(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 65535) throw Error("Invalid Standard vanity uint16");
  return value;
}
function literal(value: string, maxBytes: number, required = false): string {
  if (typeof value !== "string" || value.length > maxBytes || (required && !value.length))
    throw Error("Invalid Standard vanity text");
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength > maxBytes || new TextDecoder("utf-8", { ignoreBOM: true }).decode(encoded) !== value)
    throw Error("Invalid Standard vanity text");
  return value;
}
function dense<T, U>(arr: readonly T[], min: number, max: number, normalize: (value: T) => U): U[] {
  if (!Array.isArray(arr) || arr.length < min || arr.length > max) throw Error("Invalid Standard vanity array");
  return Array.from({ length: arr.length }, (_, index) => {
    if (!Object.hasOwn(arr, index)) throw Error("Invalid Standard vanity array");
    return normalize(arr[index]);
  });
}
function bytecode(value: Hex): Hex {
  if (typeof value !== "string" || value.length > 2 + 2 * maximumBytecodeBytes || !/^0x(?:[0-9a-f]{2})+$/i.test(value))
    throw Error("Invalid Standard vanity bytecode");
  return value.toLowerCase() as Hex;
}

function prepare(input: Preparation) {
  const c = input.context;
  if (c.chainId !== 97) throw Error("Standard vanity is BSC testnet only");
  const factory = addr(c.factory), deployer = addr(c.tokenDeployer), creator = addr(input.creator);
  if (deployer === factory) throw Error("Standard vanity requires the separate token deployer");
  const launchNonce = uint(input.launchNonce);
  const creationCode = bytecode(input.tokenCreationCode), creationCodeHash = keccak256(creationCode);
  if (creationCodeHash !== hash(input.expectedCreationCodeHash)) throw Error("Standard token creation-code pin mismatch");
  const p = input.params;
  if (typeof p.adaptiveGraduation !== "boolean" || typeof p.metadataEditable !== "boolean")
    throw Error("Invalid Standard vanity boolean");
  const quoteAssets = dense(p.quoteAssets, 1, 5, (item) => addr(item));
  const params = {
    name: literal(p.name, 64, true), symbol: literal(p.symbol, 16, true),
    totalSupply: uint(p.totalSupply), quoteAssets,
    weightsBps: dense(p.weightsBps, quoteAssets.length, quoteAssets.length, uint16), primaryQuote: addr(p.primaryQuote),
    basePriceUsd1e18: uint(p.basePriceUsd1e18), slopeUsd1e18: uint(p.slopeUsd1e18), graduationUsd1e18: uint(p.graduationUsd1e18),
    adaptiveGraduation: p.adaptiveGraduation,
    feeBps: dense(p.feeBps, 6, 6, uint16) as [number, number, number, number, number, number],
    treasury: addr(p.treasury, true), metadataEditable: p.metadataEditable,
    description: literal(p.description, 4096), imageURI: literal(p.imageURI, 512), website: literal(p.website, 512),
    xProfile: literal(p.xProfile, 512), telegram: literal(p.telegram, 512), github: literal(p.github, 512),
    youtube: literal(p.youtube, 512), debox: literal(p.debox, 512),
  };
  const manifestHash = keccak256(encodeAbiParameters(manifestTypes, [
    97n, factory, addr(c.registry), addr(c.automationRegistry), addr(c.metadataRegistry), deployer,
    addr(c.vaultDeployer), addr(c.feeRouterDeployer), addr(c.curveDeployer), addr(c.automationExecutor, true),
    addr(c.graduationAdapter, true), creator, launchNonce,
    params.name, params.symbol, params.totalSupply, params.quoteAssets, params.weightsBps,
    params.primaryQuote, params.basePriceUsd1e18, params.slopeUsd1e18, params.graduationUsd1e18,
    params.adaptiveGraduation, params.feeBps, params.treasury, params.metadataEditable,
    params.description, params.imageURI, params.website, params.xProfile, params.telegram, params.github,
    params.youtube, params.debox,
  ]));
  const initCodeHash = keccak256(concatHex([creationCode, encodeAbiParameters(constructorTypes, [
    factory, params.name, params.symbol, params.totalSupply, manifestHash,
  ])]));
  for (let searchIndex = 0; searchIndex < searchLimit; ++searchIndex) {
    const vanitySalt = keccak256(encodePacked(["address", "bytes32", "uint256"], [creator, manifestHash, BigInt(searchIndex)]));
    const predicted = keccak256(concatHex(["0xff", deployer, vanitySalt, initCodeHash]));
    if (predicted.endsWith("fe")) {
      return {
        params, candidate: {
          chainId: 97, factory, deployer, creator, launchNonce, creationCodeHash, manifestHash, initCodeHash,
          searchIndex, vanitySalt, predictedToken: getAddress(`0x${predicted.slice(-40)}`),
          currentAuthorization: null, executionAuthorized: false,
        } as const,
      };
    }
  }
  throw Error("No Standard vanity candidate in the frozen search range");
}

/** Deterministic offline calculation only; does not check launch validity or address availability. */
export function prepareStandardVanity(input: Preparation) {
  return { ...prepare(input).candidate, factoryAgreement: null, addressOccupied: null };
}

/** Read-only point-in-time comparison against a caller-pinned BSC testnet block. */
export async function observeStandardVanity(input: ObservationPolicy, client: ReadClient) {
  const blockNumber = uint(input.blockNumber), blockHash = hash(input.blockHash);
  const factoryRuntimeHash = hash(input.factoryRuntimeHash), deployerRuntimeHash = hash(input.deployerRuntimeHash);
  const { params, candidate } = prepare(input);
  const { factory, deployer, creator, launchNonce, manifestHash, vanitySalt, predictedToken } = candidate;
  const started = performance.now();
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function fence() {
    if (!active || performance.now() - started >= readTimeoutMs) throw Error("Standard vanity observation deadline");
  }
  async function read<T>(work: () => Promise<T>) {
    fence();
    let result: T;
    try { result = await work(); }
    catch { throw Error("Standard vanity RPC read failed"); }
    fence();
    return result;
  }
  async function header() {
    const h = await read(() => client.getBlock({ blockNumber }));
    if (h.number !== blockNumber || h.hash?.toLowerCase() !== blockHash) throw Error("Standard vanity block pin mismatch");
    return uint(h.timestamp);
  }
  async function observe() {
    if (await read(() => client.getChainId()) !== 97) throw Error("Standard vanity chain mismatch");
    const blockTimestamp = await header();
    for (const [address, expected] of [[factory, factoryRuntimeHash], [deployer, deployerRuntimeHash]] as const) {
      const code = await read(() => client.getCode({ address, blockNumber }));
      if (!code || keccak256(bytecode(code)) !== expected) throw Error("Standard vanity runtime pin mismatch");
    }
    const actualDeployer = await read(() => client.readContract({
      address: factory, abi: factoryAbi, functionName: "tokenDeployer", blockNumber,
    }));
    if (addr(actualDeployer) !== deployer) throw Error("Standard vanity deployer mismatch");
    const actualNonce = await read(() => client.readContract({
      address: factory, abi: factoryAbi, functionName: "creatorLaunchNonce", args: [creator], blockNumber,
    }));
    if (actualNonce !== launchNonce) throw Error("Standard vanity creator nonce mismatch");
    const [salt, token, manifest, nonce] = await read(() => client.readContract({
      address: factory, abi: factoryAbi, functionName: "previewPreparedVanity", args: [creator, params], blockNumber,
    }));
    if (hash(salt) !== vanitySalt || addr(token) !== predictedToken || hash(manifest) !== manifestHash || nonce !== launchNonce)
      throw Error("Standard vanity factory preview mismatch");
    const prediction = await read(() => client.readContract({
      address: deployer, abi: deployerAbi, functionName: "predict",
      args: [factory, params.name, params.symbol, params.totalSupply, manifestHash, vanitySalt], blockNumber,
    }));
    if (addr(prediction) !== predictedToken) throw Error("Standard vanity deployer prediction mismatch");
    const code = await read(() => client.getCode({ address: predictedToken, blockNumber }));
    const hasCode = code !== undefined && code !== "0x";
    if (hasCode) bytecode(code);
    const txCount = await read(() => client.getTransactionCount({ address: predictedToken, blockNumber }));
    if (!Number.isSafeInteger(txCount) || txCount < 0) throw Error("Invalid Standard vanity account nonce");
    if (await read(() => client.getChainId()) !== 97 || await header() !== blockTimestamp)
      throw Error("Standard vanity final header mismatch");
    fence();
    return {
      ...candidate, blockNumber, blockHash, blockTimestamp, factoryAgreement: true,
      addressOccupied: hasCode || txCount !== 0, deploymentGuaranteed: false, finalityVerified: false,
    } as const;
  }
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Standard vanity observation deadline")), readTimeoutMs); }),
      observe(),
    ]);
  } finally {
    active = false;
    clearTimeout(timer);
  }
}
