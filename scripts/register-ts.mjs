// Node 22.15+ test/operations loader. Application production builds still use Next.js.
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const path = resolve(root, specifier.slice(2));
      const target = existsSync(path) ? path : path + ".ts";
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(pathToFileURL(root).href) && url.endsWith(".ts")) {
      return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, esModuleInterop: true },
      }).outputText };
    }
    if (url.startsWith(pathToFileURL(root).href) && url.endsWith(".json")) {
      return { format: "module", shortCircuit: true, source: "export default " + readFileSync(fileURLToPath(url), "utf8") };
    }
    return nextLoad(url, context);
  },
});
