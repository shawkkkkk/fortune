import { readFileSync } from "node:fs";
const artifact = JSON.parse(readFileSync(new URL("../out/FortuneOmnichainToken.sol/FortuneOmnichainToken.json", import.meta.url), "utf8"));
const size = object => {
  const hex = object.replace(/^0x/, "");
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2) throw Error("Invalid compiled bytecode");
  return hex.length / 2;
};
const runtimeBytes = size(artifact.deployedBytecode.object);
const creationBytes = size(artifact.bytecode.object);
// Eight constructor heads plus max 64-byte name and 16-byte ticker tails.
const maxConstructorBytes = 8 * 32 + (32 + 64) + (32 + 32);
if (runtimeBytes > 24_576 || creationBytes + maxConstructorBytes > 49_152) throw Error("Omnichain token exceeds EIP-170/EIP-3860 size limits");
console.log(JSON.stringify({ runtimeBytes, creationBytes, maxConstructorBytes, withinLimits: true }));
