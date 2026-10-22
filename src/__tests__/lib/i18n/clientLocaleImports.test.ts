/**
 * @jest-environment node
 *
 * clientLocale.ts runs in the browser, in the root error page (global-error) and
 * the precached offline page. It once imported a value from requestLocale.ts,
 * the server helper, which pulls in publicOrigin and reads process.env, and so
 * dragged both into those client bundles. This walks everything clientLocale.ts
 * can reach through its imports and fails if a server-only module is among them.
 */
import fs from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "src");
const ENTRY = path.join(SRC, "lib", "i18n", "clientLocale.ts");

const FORBIDDEN = [path.join(SRC, "lib", "i18n", "requestLocale.ts"), path.join(SRC, "lib", "http", "publicOrigin.ts")];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Module specifiers in `source`, leaving out `import type` / `export type` (erased at build). */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const stripped = stripComments(source);
  const patterns = [
    /\b(?:import|export)\s+(?!type\b)[^"';]*?\sfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** A project file for `@/…` or a relative specifier; null for packages and node built-ins. */
function resolveSpecifier(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of specifiers(fs.readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return seen;
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

describe("clientLocale.ts stays out of the server helpers", () => {
  const reachable = reachableFrom(ENTRY);

  it("walks the real import graph (the check is not vacuous)", () => {
    const names = [...reachable].map(rel);
    expect(names).toContain("lib/i18n/clientLocale.ts");
    expect(names).toContain("lib/i18n/localePath.ts");
    expect(names).toContain("lib/consent/localeCookie.ts");
  });

  it("does not import requestLocale.ts or publicOrigin.ts, directly or through another module", () => {
    expect([...reachable].filter((file) => FORBIDDEN.includes(file)).map(rel)).toEqual([]);
  });

  it("reaches no module that reads process.env", () => {
    const readers = [...reachable].filter((file) => /\bprocess\.env\b/.test(stripComments(fs.readFileSync(file, "utf8")))).map(rel);
    expect(readers).toEqual([]);
  });

  it("the specifier scan sees value imports and ignores type-only ones", () => {
    const sample = [
      'import { a } from "@/x";',
      'import type { B } from "@/y";',
      'import { c, type D } from "./z";',
      'export { e } from "./w";',
      'export type { F } from "./v";',
      '// import { g } from "@/commented";',
      'const h = await import("./lazy");',
    ].join("\n");
    expect(specifiers(sample).sort()).toEqual(["./lazy", "./w", "./z", "@/x"].sort());
  });
});
