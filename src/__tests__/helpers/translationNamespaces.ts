/**
 * Walks the import graph from a set of entry files and collects the message
 * namespaces their components ask for with useTranslations("ns"). Used to keep
 * each route group's client message subset complete: next-intl only sees the
 * messages a NextIntlClientProvider was handed, so a namespace missing from the
 * subset breaks every string under it.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // package
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTS) {
    const p = base + ext;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
const NS_RE = /useTranslations\(\s*(?:["'`]([\w.-]+)["'`])?\s*\)/g;
const DYNAMIC_NS_RE = /useTranslations\(\s*[A-Za-z_$][\w$.]*\s*\)/g;

export interface NamespaceScan {
  namespaces: Set<string>;
  /** Files that call useTranslations() with no namespace or a variable one — a subset cannot cover them. */
  unscannable: string[];
  files: number;
}

export function scanNamespaces(entries: string[]): NamespaceScan {
  const seen = new Set<string>();
  const namespaces = new Set<string>();
  const unscannable: string[] = [];
  const stack = entries.map((e) => path.resolve(e));
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
    for (const m of src.matchAll(NS_RE)) {
      if (m[1]) namespaces.add(m[1].split(".")[0]);
      else unscannable.push(path.relative(process.cwd(), file));
    }
    if (DYNAMIC_NS_RE.test(src)) unscannable.push(path.relative(process.cwd(), file));
    DYNAMIC_NS_RE.lastIndex = 0;
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      const resolved = spec ? resolveImport(file, spec) : null;
      if (resolved && /\.(tsx?|jsx?)$/.test(resolved) && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return { namespaces, unscannable: [...new Set(unscannable)], files: seen.size };
}

/** Every route file (page/layout/template/error/loading/not-found) under a directory. */
export function routeEntries(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^(page|layout|template|error|loading|not-found|default)\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}
