import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

const MAX_POLICY_BYTES = 16_384;

/** Read one regular file, bounded even if the file grows after fstat. */
export function readReceiptPolicy(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_POLICY_BYTES) throw Error("Invalid receipt policy file");
    const bytes = Buffer.alloc(MAX_POLICY_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > MAX_POLICY_BYTES) throw Error("Invalid receipt policy file");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length)));
  } finally {
    closeSync(fd);
  }
}
