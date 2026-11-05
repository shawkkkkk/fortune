import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { market, TX } from "../fixtures/arbitrage-receipts.mjs";

const run = (entry, args) => spawnSync(process.execPath,
  ["--import", "./scripts/register-ts.mjs", `scripts/${entry}.mjs`, ...args],
  { encoding: "utf8", timeout: 3000 });
for (const entry of ["run-receipt-observer", "journal-arbitrage-fill"]) {
  test(`${entry} rejects writerless policy pipes before opening durable files`, {skip: process.platform === "win32"}, () => {
    const d = mkdtempSync(join(tmpdir(), "receipt-policy-"));
    try {
      const fifo = join(d, "private-policy"), link = join(d, "policy-link");
      const queue = join(d, "queue.sqlite"), journal = join(d, "journal.sqlite");
      assert.equal(spawnSync("mkfifo", [fifo]).status, 0);
      symlinkSync(fifo, link);
      for (const path of [fifo, link]) {
        const result = run(entry, entry === "run-receipt-observer"
          ? [path, queue, journal, "enqueue", TX] : [path, journal, TX]);
        assert.equal(result.error?.code, undefined);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.doesNotMatch(result.stderr, /private-policy|policy-link|\.sqlite/);
        assert.equal(existsSync(queue) || existsSync(journal), false);
      }
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
}
test("receipt queue accepts the exact byte ceiling and regular symlinks; rejects oversize and invalid UTF-8", () => {
  const d = mkdtempSync(join(tmpdir(), "receipt-policy-"));
  try {
    const manifest = join(d, "manifest"), alias = join(d, "alias");
    const queue = join(d, "queue.sqlite"), journal = join(d, "journal.sqlite");
    const json = JSON.stringify(market()), padded = json.padEnd(16_384);
    assert.equal(Buffer.byteLength(padded), 16_384);
    writeFileSync(manifest, padded);
    symlinkSync(manifest, alias);
    const invoke = path => run("run-receipt-observer", [path, queue, journal, "enqueue", TX]);
    assert.equal(invoke(alias).status, 0);
    writeFileSync(manifest, padded + " ");
    assert.equal(invoke(manifest).status, 1);
    const invalid = Buffer.concat([Buffer.from('{"ignored":"'), Buffer.from([255]), Buffer.from('",'+json.slice(1))]);
    writeFileSync(manifest, invalid);
    assert.equal(invoke(manifest).status, 1);
    assert.equal(invoke(d).status, 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

for (const kind of ["symlink", "hardlink", "future path through symlinked directory"]) {
  test(`receipt queue rejects aliased database roles before initialization: ${kind}`, {skip: process.platform === "win32"}, () => {
    const d = mkdtempSync(join(tmpdir(), "receipt-db-roles-"));
    try {
      const manifest = join(d, "manifest.json"), parent = join(d, "stores"), alias = join(d, "alias");
      mkdirSync(parent);
      const queue = join(parent, "worker.sqlite");
      let journal = alias;
      const original = Buffer.alloc(0);
      if (kind === "future path through symlinked directory") {
        symlinkSync(parent, alias);
        journal = join(alias, "worker.sqlite");
      } else {
        writeFileSync(queue, original);
        if (kind === "hardlink") linkSync(queue, journal);
        else symlinkSync(queue, journal);
      }
      writeFileSync(manifest, JSON.stringify(market()));
      const result = run("run-receipt-observer", [manifest, queue, journal, "enqueue", TX]);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      if (kind === "future path through symlinked directory") assert.equal(existsSync(queue), false);
      else assert.ok(readFileSync(queue).equals(original), "preflight must leave the existing file unchanged");
      assert.equal(existsSync(queue + "-wal"), false);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
}
