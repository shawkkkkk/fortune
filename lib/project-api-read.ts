/** Internal bounded reader for the two fixed public project API projections. */
export async function readProjectApi<T>(url: string, budgetMs: 10000 | 30000,
  options: { fetch?: typeof fetch; now?: () => number }, project: (value: unknown, now: number) => T): Promise<T> {
  const now = options.now ?? Date.now;
  let last = now(), finished = false;
  if (!Number.isSafeInteger(last) || last < 0) throw Error("Invalid project API clock");
  const started = last, controller = new AbortController();
  const check = () => {
    const time = now();
    if (finished || !Number.isSafeInteger(time) || time < last || time - started >= budgetMs) throw Error("Project API observation ended");
    last = time;
    return time;
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  // Best effort only: a non-cooperating cancellation must not extend the deadline.
  const cancel = () => { try { void reader?.cancel().catch(() => {}); } catch {} };
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      finished = true;
      reject(Error("Project API observation timed out"));
      controller.abort(); cancel();
    }, budgetMs);
  });
  const work = async () => {
    check();
    const response = await (options.fetch ?? fetch)(url, {
      method: "GET", redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    check();
    if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw Error("Project API unavailable");
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 32768)) throw Error("Project API response too large");
    if (!response.body) throw Error("Project API response empty");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      check();
      const { value, done } = await reader.read();
      check();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) throw Error("Project API response too large");
      if (chunks.length >= 4096) throw Error("Project API response has too many chunks");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    check();
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const result = project(value, check());
    check();
    return result;
  };
  try { return await Promise.race([work(), deadline]); }
  finally {
    finished = true;
    clearTimeout(timeout!);
    controller.abort(); cancel();
    try { reader?.releaseLock(); } catch {}
  }
}
