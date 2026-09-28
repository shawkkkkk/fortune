// Storage for the holder index: Upstash Redis over its REST API in production,
// and an in-memory store with the same command semantics for tests and local
// fork rehearsals. Only the handful of commands the index uses are supported.

export type RedisValue = string | number | null | RedisValue[];
export type RedisCommand = Array<string | number>;

export interface HolderStore {
  /** Runs commands in order; not atomic. */
  pipeline(commands: RedisCommand[]): Promise<RedisValue[]>;
  /** Runs commands atomically (MULTI/EXEC). */
  transaction(commands: RedisCommand[]): Promise<RedisValue[]>;
}

const UPSTASH_HOST = /^https:\/\/[a-zA-Z0-9-]+\.upstash\.io\/?$/;

export class UpstashStore implements HolderStore {
  private readonly url: string;

  constructor(url: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch, allowUrl = UPSTASH_HOST) {
    if (!allowUrl.test(url) || !token) throw new Error("Invalid Upstash Redis configuration.");
    this.url = url.replace(/\/$/, "");
  }

  private async send(path: "/pipeline" | "/multi-exec", commands: RedisCommand[]) {
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

  transaction(commands: RedisCommand[]) {
    return this.send("/multi-exec", commands);
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

  async transaction(commands: RedisCommand[]) {
    // Single-threaded: running the batch without awaiting between commands is atomic.
    return commands.map((command) => this.run(command));
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
