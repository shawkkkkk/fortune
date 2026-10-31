import { readFileSync } from "node:fs";
const size = object => {
  const hex = object.replace(/^0x/, "");
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2) throw Error("Invalid compiled bytecode");
  return hex.length / 2;
};
for (const [name, maxConstructorBytes] of [
  // Eight constructor heads plus max 64-byte name and 16-byte ticker tails.
  ["FortuneOmnichainToken", 8 * 32 + (32 + 64) + (32 + 32)],
  // Three governance addresses, seven infrastructure fields, and two five-field asset tuples.
  ["FortuneTestnetStrategyVault", 20 * 32],
  ["FortuneTestnetPositionCustody", 18 * 32],
  ["FortuneTestnetBurnVault", 6 * 32],
  ["FortuneTestnetWorkEscrow", (4 + 1 + 10 * 3) * 32],
  // Five heads, two dynamic lengths, ten asset tuples and 32 exclusions.
  ["FortuneTestnetCounterEscrow", (5 + 2 + 10 * 2 + 32) * 32],
]) {
  const artifact = JSON.parse(readFileSync(new URL(`../out/${name}.sol/${name}.json`, import.meta.url), "utf8"));
  const runtimeBytes = size(artifact.deployedBytecode.object);
  const creationBytes = size(artifact.bytecode.object);
  if (runtimeBytes > 24_576 || creationBytes + maxConstructorBytes > 49_152) throw Error(`${name} exceeds EIP-170/EIP-3860 size limits`);
  console.log(JSON.stringify({ name, runtimeBytes, creationBytes, maxConstructorBytes, withinLimits: true }));
}
