// Lets `node --experimental-strip-types` scripts import app code that uses the
// "@/..." alias and extensionless .ts imports (no tsx in this repo).
// Usage: node --experimental-strip-types --import ./scripts/lib/ts-alias-register.mjs script.mjs
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(new URL("../../src/", import.meta.url)));
const EXTS = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"];

function withExt(base) {
  if (existsSync(base) && !existsSync(base + "/index.ts") && path.extname(base)) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const hit = withExt(path.join(SRC, specifier.slice(2)));
    if (hit) return next(pathToFileURL(hit).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.includes("/src/")) {
    const hit = withExt(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (hit) return next(pathToFileURL(hit).href, context);
  }
  return next(specifier, context);
}
