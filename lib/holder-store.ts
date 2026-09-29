// Storage for the holder index: Upstash Redis over its REST API in production,
// and an in-memory store with the same command semantics for tests and local
// fork rehearsals. Only the handful of commands the index uses are supported.

export type RedisValue = string | number | null | RedisValue[];
export type RedisCommand = Array<string | number>;

export interface HolderStore {
  /** Runs commands in order; not atomic. */
  pipeline(commands: RedisCommand[]): Promise<RedisValue[]>;
  /**
   * In one atomic step on the server: if `lockKey` still holds `token`, extends it by `ttlMs`
   * and runs `commands`. Returns false, having written nothing, when the lock has expired or
   * belongs to another run.
   */
  commitIfOwner(lockKey: string, token: string, ttlMs: number, commands: RedisCommand[]): Promise<boolean>;
  /** Deletes `lockKey` only if it still holds `token`, in one atomic step. */
  releaseIfOwner(lockKey: string, token: string): Promise<boolean>;
}

/**
 * KEYS[1] is the lock; ARGV is the token, the lease in ms, then each command as its word count
 * followed by its words. The ownership check covers the writes themselves: nothing can run
 * between them, so a run whose lease expired can never write, even after another run took over.
 */
export const COMMIT_IF_OWNER_SCRIPT = `if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("PEXPIRE", KEYS[1], ARGV[2])
local i = 3
while i <= #ARGV do
  local n = tonumber(ARGV[i])
  redis.call(unpack(ARGV, i + 1, i + n))
  i = i + n + 1
end
return 1`;

export const RELEASE_IF_OWNER_SCRIPT = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
return 0`;

// Lua's unpack() stops at about 8,000 values, so long commands are split into
// equivalent shorter ones: HSET and ZADD keep their field/value and score/member pairs.
const MAX_WORDS = 1_000;
const PAIRED = new Set(["HSET", "ZADD"]);
const SPLITTABLE = new Set(["HSET", "ZADD", "HDEL", "ZREM", "SADD"]);

export function splitCommand(command: RedisCommand, maxWords = MAX_WORDS): RedisCommand[] {
  const name = String(command[0]).toUpperCase();
  if (command.length <= maxWords || !SPLITTABLE.has(name)) return [command];
  const [verb, key, ...rest] = command;
  const step = PAIRED.has(name) ? 2 : 1;
  const per = Math.max(step, Math.floor((maxWords - 2) / step) * step);
  const out: RedisCommand[] = [];
  for (let i = 0; i < rest.length; i += per) out.push([verb, key, ...rest.slice(i, i + per)]);
  return out;
}

/** The EVAL command for `commitIfOwner`, with every key it touches declared. */
export function commitIfOwnerCommand(lockKey: string, token: string, ttlMs: number, commands: RedisCommand[]): RedisCommand {
  const keys = new Set<string>();
  const words: Array<string | number> = [];
  for (const command of commands.flatMap((command) => splitCommand(command))) {
    if (String(command[0]).toUpperCase() === "DEL") command.slice(1).forEach((key) => keys.add(String(key)));
    else keys.add(String(command[1]));
    words.push(command.length, ...command);
  }
  keys.delete(lockKey);
  return ["EVAL", COMMIT_IF_OWNER_SCRIPT, keys.size + 1, lockKey, ...keys, token, ttlMs, ...words];
}

const UPSTASH_HOST = /^https:\/\/[a-zA-Z0-9-]+\.upstash\.io\/?$/;

export class UpstashStore implements HolderStore {
  private readonly url: string;

  constructor(url: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch, allowUrl = UPSTASH_HOST) {
    if (!allowUrl.test(url) || !token) throw new Error("Invalid Upstash Redis configuration.");
    this.url = url.replace(/\/$/, "");
  }

  private async send(path: "/pipeline", commands: RedisCommand[]) {
    if (!commands.length) return [];
    const response = await this.fetcher(this.url + path, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((command) => command.map(String))),
    });
    if (!response.ok) throw new Error(`Upstash request failed with HTTP ${response.status}.`);
    const body = (await response.json()) as Array<{ result?: RedisValue; error?: string }>;
    if (!Array.isArray(body) || body.length !== commands.length) throw new Error("Unexpected Upstash response.");
    return body.map((row) => {
      if (row.error) throw new Error("Upstash command failed: " + row.error);
      return row.result ?? null;
    });
  }

  pipeline(commands: RedisCommand[]) {
    return this.send("/pipeline", commands);
  }

  async commitIfOwner(lockKey: string, token: string, ttlMs: number, commands: RedisCommand[]) {
    const [result] = await this.send("/pipeline", [commitIfOwnerCommand(lockKey, token, ttlMs, commands)]);
    return Number(result) === 1;
  }

  async releaseIfOwner(lockKey: string, token: string) {
    const [result] = await this.send("/pipeline", [["EVAL", RELEASE_IF_OWNER_SCRIPT, 1, lockKey, token]]);
    return Number(result) === 1;
  }
}

type Entry = { kind: "string"; value: string; expires: number | null } | { kind: "hash"; value: Map<string, string> } | { kind: "zset"; value: Map<string, number> } | { kind: "set"; value: Set<string> };

/** Redis semantics for the commands the index uses, in process memory. */
export class MemoryStore implements HolderStore {
  private readonly data = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  private get(key: string, kind: Entry["kind"]) {
    const entry = this.data.get(key);
    if (entry?.kind === "string" && entry.expires !== null && entry.expires <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    if (entry && entry.kind !== kind) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    return entry;
  }

  private hash(key: string, create: boolean) {
    const entry = this.get(key, "hash") as Extract<Entry, { kind: "hash" }> | undefined;
    if (entry || !create) return entry?.value;
    const value = new Map<string, string>();
    this.data.set(key, { kind: "hash", value });
    return value;
  }

  private zset(key: string, create: boolean) {
    const entry = this.get(key, "zset") as Extract<Entry, { kind: "zset" }> | undefined;
    if (entry || !create) return entry?.value;
    const value = new Map<string, number>();
    this.data.set(key, { kind: "zset", value });
    return value;
  }

  private set(key: string, create: boolean) {
    const entry = this.get(key, "set") as Extract<Entry, { kind: "set" }> | undefined;
    if (entry || !create) return entry?.value;
    const value = new Set<string>();
    this.data.set(key, { kind: "set", value });
    return value;
  }

  private prune(key: string) {
    const entry = this.data.get(key);
    if (entry && entry.kind !== "string" && entry.value.size === 0) this.data.delete(key);
  }

  private run(command: RedisCommand): RedisValue {
    const [name, ...raw] = command.map(String);
    const args = raw;
    switch (name.toUpperCase()) {
      case "GET": {
        const entry = this.get(args[0], "string") as Extract<Entry, { kind: "string" }> | undefined;
        return entry ? entry.value : null;
      }
      case "SET": {
        const [key, value, ...options] = args;
        const upper = options.map((option) => option.toUpperCase());
        const existing = this.get(key, "string");
        if (upper.includes("NX") && existing) return null;
        const px = upper.indexOf("PX");
        this.data.set(key, { kind: "string", value, expires: px >= 0 ? this.now() + Number(options[px + 1]) : null });
        return "OK";
      }
      case "PEXPIRE": {
        const entry = this.get(args[0], "string") as Extract<Entry, { kind: "string" }> | undefined;
        if (!entry) return 0;
        entry.expires = this.now() + Number(args[1]);
        return 1;
      }
      case "DEL": {
        let removed = 0;
        for (const key of args) if (this.data.delete(key)) removed += 1;
        return removed;
      }
      case "HGET":
        return this.hash(args[0], false)?.get(args[1]) ?? null;
      case "HMGET": {
        const hash = this.hash(args[0], false);
        return args.slice(1).map((field) => hash?.get(field) ?? null);
      }
      case "HSET": {
        const hash = this.hash(args[0], true)!;
        let added = 0;
        for (let i = 1; i + 1 < args.length; i += 2) {
          if (!hash.has(args[i])) added += 1;
          hash.set(args[i], args[i + 1]);
        }
        return added;
      }
      case "HDEL": {
        const hash = this.hash(args[0], false);
        let removed = 0;
        for (const field of args.slice(1)) if (hash?.delete(field)) removed += 1;
        this.prune(args[0]);
        return removed;
      }
      case "HGETALL": {
        const hash = this.hash(args[0], false);
        return hash ? [...hash.entries()].flat() : [];
      }
      case "ZADD": {
        const zset = this.zset(args[0], true)!;
        let added = 0;
        for (let i = 1; i + 1 < args.length; i += 2) {
          if (!zset.has(args[i + 1])) added += 1;
          zset.set(args[i + 1], Number(args[i]));
        }
        return added;
      }
      case "ZREM": {
        const zset = this.zset(args[0], false);
        let removed = 0;
        for (const member of args.slice(1)) if (zset?.delete(member)) removed += 1;
        this.prune(args[0]);
        return removed;
      }
      case "ZCARD":
        return this.zset(args[0], false)?.size ?? 0;
      case "ZSCORE": {
        const score = this.zset(args[0], false)?.get(args[1]);
        return score === undefined ? null : String(score);
      }
      case "ZREVRANGE": {
        const zset = this.zset(args[0], false);
        if (!zset) return [];
        const sorted = [...zset.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
        const start = Number(args[1]);
        const stop = Number(args[2]);
        const slice = sorted.slice(start, stop < 0 ? sorted.length + stop + 1 : stop + 1);
        return args[3]?.toUpperCase() === "WITHSCORES" ? slice.flatMap(([member, score]) => [member, String(score)]) : slice.map(([member]) => member);
      }
      case "SADD": {
        const set = this.set(args[0], true)!;
        let added = 0;
        for (const member of args.slice(1)) if (!set.has(member)) { set.add(member); added += 1; }
        return added;
      }
      case "SMEMBERS":
        return [...(this.set(args[0], false) ?? [])];
      case "SCARD":
        return this.set(args[0], false)?.size ?? 0;
      default:
        throw new Error("Unsupported command " + name);
    }
  }

  async pipeline(commands: RedisCommand[]) {
    return commands.map((command) => this.run(command));
  }

  // Single-threaded: with no await between the check and the writes, nothing can run in between.
  async commitIfOwner(lockKey: string, token: string, ttlMs: number, commands: RedisCommand[]) {
    if (this.run(["GET", lockKey]) !== token) return false;
    this.run(["PEXPIRE", lockKey, ttlMs]);
    for (const command of commands) this.run(command);
    return true;
  }

  async releaseIfOwner(lockKey: string, token: string) {
    if (this.run(["GET", lockKey]) !== token) return false;
    this.run(["DEL", lockKey]);
    return true;
  }
}

let memory: MemoryStore | null = null;

/**
 * The configured store, or null when holder analytics are off. The in-memory
 * store is for local rehearsals only and is refused on Vercel, where each
 * function instance would keep its own copy.
 */
export function holderStore(env: Record<string, string | undefined> = process.env): HolderStore | null {
  if (env.FORTUNE_HOLDER_INDEX_STORE === "memory") {
    if (env.VERCEL) return null;
    return (memory ??= new MemoryStore());
  }
  if (env.FORTUNE_HOLDER_INDEX_ENABLED === "false") return null;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !UPSTASH_HOST.test(url)) return null;
  return new UpstashStore(url, token);
}
