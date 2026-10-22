/**
 * @jest-environment node
 *
 * PECR inventory guard (Task 14). The cookie registry (src/lib/consent/registry.ts)
 * is the single list the banner, the Cookie Policy and the E2E inventory read.
 * Anything the code can put in the browser, or any host it can make the browser
 * contact, must have a row there first. This guard reads the source and fails on:
 *
 *  - a cookie name or storage key written in the code with no matching row;
 *  - a preference key (category "preferences") written to localStorage outside
 *    src/lib/consent/ (preferences must go through prefStorage, which honours an
 *    objection);
 *  - an iframe or injected-script host, a CSP host or an images.remotePatterns
 *    host with no matching thirdPartyHost row;
 *  - a consent.* message key present in one locale but not the other.
 *
 * Known limits (the production-build E2E, e2e/cookie-consent.spec.ts with
 * e2e/support/inventory.ts, inventories the real browser for what this misses):
 *  - Storage an SDK creates internally (Firebase, reCAPTCHA, Serwist, next-intl,
 *    Auth.js cookies) is invisible to a source scan.
 *  - It is a text scan with a small expression reader, not a TypeScript AST: a
 *    key passed through several variables, object properties or another module's
 *    non-exported helper is reported as "only known at run time" (DYNAMIC_SITES),
 *    not resolved. The tree-wide constant lookup uses exported names only, so a
 *    local `storageKey` in one file never resolves a parameter of the same name
 *    in another; two exports with the same name can still be confused.
 *  - Only src/ is scanned (not scripts/, public/ or generated files), and a
 *    cookie written as a raw `Set-Cookie` header string is not read.
 *  - CSP hosts are read from the policies headers.ts builds for production,
 *    development and API responses; a policy set anywhere else is not seen.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import en from "../../../../messages/en.json";
import ar from "../../../../messages/ar.json";
import { REGISTRY } from "@/lib/consent/registry";
import type { RegistryItem } from "@/lib/consent/registry";
import { getSecurityHeaders, SECURITY_HEADERS } from "@/lib/security/headers";
import { PROVIDER_AVATAR_HOSTS } from "@/lib/images/providerAvatarHosts.mjs";
import { serializeRegistry } from "../../../../scripts/lib/consentRegistryExport.mjs";

const ROOT = path.resolve(__dirname, "../../../..");
const SRC = path.join(ROOT, "src");

/** The rows exactly as the Cookie Policy export writes them (one serializer for both). */
const ROWS: RegistryItem[] = JSON.parse(serializeRegistry(REGISTRY));

type Kind = RegistryItem["kind"];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * A registry name ("x", or a prefix "x*") against a key the scan found. A key
 * may hold "*" where its value is only known at run time; from its first "*"
 * on, it is unknown, so it matches only a prefix row its known part extends.
 */
export function nameMatches(pattern: string, key: string): boolean {
  const star = key.indexOf("*");
  const known = star === -1 ? key : key.slice(0, star);
  if (pattern.endsWith("*")) return known.startsWith(pattern.slice(0, -1));
  return star === -1 && key === pattern;
}

function rowFor(kind: Kind, key: string): RegistryItem | undefined {
  return ROWS.find((row) => row.kind === kind && nameMatches(row.name, key));
}

/** "host" or "host/path" (registry form) split in two. */
function splitHostPath(value: string): { host: string; path: string } {
  const slash = value.indexOf("/");
  return slash === -1 ? { host: value.toLowerCase(), path: "" } : { host: value.slice(0, slash).toLowerCase(), path: value.slice(slash) };
}

/** A host (possibly "*.x" from a CSP source) against a registry host ("x" or "*.x"). */
function hostCovered(pattern: string, host: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".x"
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === pattern;
}

/**
 * The thirdPartyHost row covering `host` and `urlPath`. A row that names a path
 * ("www.google.com/recaptcha") only covers addresses, and CSP sources, under that
 * path: a host-wide CSP source ("https://www.google.com", path "") is NOT covered.
 */
export function hostRowFor(host: string, urlPath = ""): RegistryItem | undefined {
  return ROWS.filter((row) => row.kind === "thirdPartyHost").find((row) => {
    const pattern = splitHostPath(row.name);
    if (!hostCovered(pattern.host, host.toLowerCase())) return false;
    return pattern.path === "" || urlPath.startsWith(pattern.path);
  });
}

// ---------------------------------------------------------------------------
// Source reading
// ---------------------------------------------------------------------------

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "__mocks__" || name === "test-utils" || name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (file: string): string => path.relative(ROOT, file).replace(/\\/g, "/");

/**
 * From `start` (just after an opening bracket, or the start of an expression),
 * returns the text up to the first top-level `,` or the closing bracket, or a
 * top-level `;` / end of text. Skips strings, templates (with their ${...}) and
 * nested brackets.
 */
export function readExpression(text: string, start: number): string {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = skipString(text, i);
      continue;
    }
    if (ch === "`") {
      i = skipTemplate(text, i);
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth -= 1;
    } else if ((ch === "," || ch === ";") && depth === 0) break;
    i += 1;
  }
  return text.slice(start, i).trim();
}

function skipString(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length && text[i] !== quote) i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

function skipTemplate(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length && text[i] !== "`") {
    if (text[i] === "\\") i += 2;
    else if (text[i] === "$" && text[i + 1] === "{") {
      const inner = readExpression(text, i + 2);
      i = i + 2 + inner.length;
      while (i < text.length && text[i] !== "}") i += 1;
      i += 1;
    } else i += 1;
  }
  return i + 1;
}

/** Splits `a ? b : c` at the top level; returns null when it is not a conditional. */
function splitConditional(expr: string): [string, string] | null {
  let depth = 0;
  let question = -1;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === '"' || ch === "'") {
      i = skipString(expr, i) - 1;
      continue;
    }
    if (ch === "`") {
      i = skipTemplate(expr, i) - 1;
      continue;
    }
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) depth -= 1;
    else if (depth === 0 && ch === "?" && expr[i + 1] !== "?" && expr[i + 1] !== "." && expr[i - 1] !== "?") {
      if (question === -1) question = i;
    } else if (depth === 0 && ch === ":" && question !== -1) {
      return [expr.slice(question + 1, i).trim(), expr.slice(i + 1).trim()];
    }
  }
  return null;
}

interface Definitions {
  /** const NAME = <expr> */
  values: Map<string, string[]>;
  /** const NAME = (params) => <expr>, or function NAME(params) { return <expr> } */
  functions: Map<string, Array<{ params: string[]; returns: string[] }>>;
}

const IDENT = "[A-Za-z_$][\\w$]*";

/** Definitions in `text`; with `exportedOnly`, only `export const` / `export function` (the tree-wide lookup). */
function collectDefinitions(text: string, into: Definitions, exportedOnly = false): void {
  const add = <T>(map: Map<string, T[]>, key: string, value: T) => map.set(key, [...(map.get(key) ?? []), value]);
  const constRe = new RegExp(`(\\bexport\\s+)?\\bconst\\s+(${IDENT})\\s*(?::[^=;\\n]+)?=\\s*`, "g");
  for (const match of text.matchAll(constRe)) {
    if (exportedOnly && !match[1]) continue;
    const start = (match.index ?? 0) + match[0].length;
    const expr = readExpression(text, start);
    const arrow = expr.match(new RegExp(`^\\(([^)]*)\\)\\s*(?::\\s*[^=]+)?=>\\s*([\\s\\S]+)$`));
    if (arrow) {
      const params = arrow[1].split(",").map((p) => p.replace(/[:=][\s\S]*$/, "").trim()).filter(Boolean);
      add(into.functions, match[2], { params, returns: [arrow[2].trim()] });
    } else {
      add(into.values, match[2], expr);
    }
  }
  const fnRe = new RegExp(`(\\bexport\\s+)?\\bfunction\\s+(${IDENT})\\s*\\(([^)]*)\\)[^{]*\\{`, "g");
  for (const match of text.matchAll(fnRe)) {
    if (exportedOnly && !match[1]) continue;
    const bodyStart = (match.index ?? 0) + match[0].length;
    const body = readExpression(text, bodyStart);
    const returns = [...body.matchAll(/\breturn\s+/g)].map((r) => readExpression(body, (r.index ?? 0) + r[0].length));
    const params = match[3].split(",").map((p) => p.replace(/[:=][\s\S]*$/, "").trim()).filter(Boolean);
    add(into.functions, match[2], { params, returns });
  }
}

/**
 * Every value `expr` can take, with "*" for parts only known at run time, or
 * null when the expression cannot be read statically (a property, a parameter).
 */
export function resolveExpression(expr: string, local: Definitions, global: Definitions, depth = 0, unknown: Set<string> = new Set()): string[] | null {
  if (depth > 8) return null;
  let e = expr.trim();
  e = e.replace(/\s+as\s+const$/, "").replace(/!$/, "").trim();
  while (e.startsWith("(") && readExpression(e, 1).length === e.length - 2) e = e.slice(1, -1).trim();
  // `cond ? key : null` writes nothing on the null branch.
  if (e === "null" || e === "undefined") return [];

  const conditional = splitConditional(e);
  if (conditional) {
    const a = resolveExpression(conditional[0], local, global, depth + 1, unknown);
    const b = resolveExpression(conditional[1], local, global, depth + 1, unknown);
    return a && b ? [...a, ...b] : null;
  }
  // a + b (string concatenation)
  const plus = topLevelSplit(e, "+");
  if (plus.length > 1) {
    let acc: string[] = [""];
    for (const part of plus) {
      const values = resolveExpression(part, local, global, depth + 1, unknown) ?? ["*"];
      acc = acc.flatMap((prefix) => values.map((value) => prefix + value));
    }
    return acc;
  }
  if (/^(["'])(?:\\[\s\S]|(?!\1)[\s\S])*\1$/.test(e)) return [e.slice(1, -1)];
  if (e.startsWith("`") && skipTemplate(e, 0) === e.length) return resolveTemplate(e, local, global, depth, unknown);
  if (unknown.has(e)) return ["*"];
  if (new RegExp(`^${IDENT}$`).test(e)) {
    const defs = local.values.get(e) ?? global.values.get(e);
    if (!defs) return null;
    const out: string[] = [];
    for (const def of defs) {
      const values = resolveExpression(def, local, global, depth + 1, unknown);
      if (!values) return null;
      out.push(...values);
    }
    return [...new Set(out)];
  }
  const call = e.match(new RegExp(`^(${IDENT})\\s*\\(([\\s\\S]*)\\)$`));
  if (call) {
    const defs = local.functions.get(call[1]) ?? global.functions.get(call[1]);
    if (!defs) return null;
    const out: string[] = [];
    for (const def of defs) {
      for (const ret of def.returns) {
        const values = resolveExpression(ret, local, global, depth + 1, new Set([...unknown, ...def.params]));
        if (!values) return null;
        out.push(...values);
      }
    }
    return [...new Set(out)];
  }
  return null;
}

function topLevelSplit(expr: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === '"' || ch === "'") {
      i = skipString(expr, i) - 1;
      continue;
    }
    if (ch === "`") {
      i = skipTemplate(expr, i) - 1;
      continue;
    }
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) depth -= 1;
    else if (depth === 0 && ch === sep) {
      parts.push(expr.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(expr.slice(last));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function resolveTemplate(template: string, local: Definitions, global: Definitions, depth: number, unknown: Set<string>): string[] {
  let acc: string[] = [""];
  let i = 1;
  let literal = "";
  const flush = () => {
    acc = acc.map((prefix) => prefix + literal);
    literal = "";
  };
  while (i < template.length - 1) {
    if (template[i] === "\\") {
      literal += template[i + 1];
      i += 2;
    } else if (template[i] === "$" && template[i + 1] === "{") {
      flush();
      const inner = readExpression(template, i + 2);
      const values = resolveExpression(inner, local, global, depth + 1, unknown) ?? ["*"];
      acc = acc.flatMap((prefix) => values.map((value) => prefix + value));
      i = i + 2 + inner.length;
      while (template[i] !== "}") i += 1;
      i += 1;
    } else {
      literal += template[i];
      i += 1;
    }
  }
  flush();
  // Everything after the first unknown part is unknown too.
  return [...new Set(acc.map((value) => (value.includes("*") ? value.slice(0, value.indexOf("*") + 1) : value)))];
}

/** anyStorage: `.setItem(` on a receiver that is not literally localStorage / sessionStorage (a variable, a conditional). */
type Store = "localStorage" | "sessionStorage" | "anyStorage" | "prefStorage" | "tabStorage" | "cookie";

interface WriteSite {
  file: string;
  line: number;
  store: Store;
  expr: string;
  /** Possible keys / cookie names; null when the expression cannot be read statically. */
  keys: string[] | null;
}

const WRITE_CALLS: Array<{ re: RegExp; store: Store | ((m: RegExpMatchArray) => Store) }> = [
  // Any receiver: `x.setItem(` where x is not literally localStorage / sessionStorage counts as either.
  { re: /\.\s*setItem\s*\(/g, store: "anyStorage" },
  { re: /\bprefStorage\s*\.\s*(?:set|getWithLegacy)\s*\(/g, store: "prefStorage" },
  { re: /\btabStorage\s*\.\s*set\s*\(/g, store: "tabStorage" },
  { re: /(?:\.cookies|\bcookies\(\)\)?|\bcookieStore)\s*\.\s*set\s*\(/g, store: "cookie" },
];

const lineOf = (text: string, index: number): number => text.slice(0, index).split("\n").length;

/** True when a cookies.set(name, value, ...) call only clears the cookie (empty value). */
function isClearingSet(text: string, argsStart: number, nameExpr: string): boolean {
  const afterName = argsStart + text.slice(argsStart).indexOf(nameExpr) + nameExpr.length;
  const rest = text.slice(afterName).replace(/^\s*,\s*/, "");
  return /^(""|''|``)/.test(rest);
}

export function findWriteSites(text: string, file: string, global: Definitions): WriteSite[] {
  const local: Definitions = { values: new Map(), functions: new Map() };
  collectDefinitions(text, local);
  const sites: WriteSite[] = [];
  for (const { re, store } of WRITE_CALLS) {
    for (const match of text.matchAll(re)) {
      const argsStart = (match.index ?? 0) + match[0].length;
      const expr = readExpression(text, argsStart);
      let kind = typeof store === "function" ? store(match) : store;
      if (kind === "anyStorage") {
        const receiver = text.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0).match(/\b(localStorage|sessionStorage)\s*$/);
        if (receiver) kind = receiver[1] as Store;
      }
      if (kind === "cookie" && isClearingSet(text, argsStart, expr)) continue;
      sites.push({ file, line: lineOf(text, match.index ?? 0), store: kind, expr, keys: resolveExpression(expr, local, global) });
    }
  }
  for (const match of text.matchAll(/\bdocument\.cookie\s*=\s*/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const expr = readExpression(text, start);
    // "name=; Max-Age=0" only deletes the cookie (read from the source text: the name may be a property).
    if (/^[`"'][^=`"']*=\s*;[^`"']*max-age=0\b/i.test(expr)) continue;
    const values = resolveExpression(expr, local, global);
    const names = values?.map((value) => value.split("=")[0].trim());
    sites.push({ file, line: lineOf(text, match.index ?? 0), store: "cookie", expr, keys: names ?? null });
  }
  return sites;
}

const STORE_KINDS: Record<Store, Kind[]> = {
  localStorage: ["localStorage"],
  sessionStorage: ["sessionStorage"],
  anyStorage: ["localStorage", "sessionStorage"],
  prefStorage: ["localStorage"], // localStorage while preferences are allowed, the tab's sessionStorage otherwise
  tabStorage: ["sessionStorage"],
  cookie: ["cookie"],
};

const rowForStore = (store: Store, key: string): RegistryItem | undefined =>
  STORE_KINDS[store].map((kind) => rowFor(kind, key)).find(Boolean);

/**
 * Write sites whose key is only known at run time (a parameter or a property).
 * Each one is mapped here, by hand, to the registry row its keys fall under;
 * the guard checks the row exists and that the site is still there.
 */
const DYNAMIC_SITES: Array<{ file: string; store: Store; expr: string; row: string; why: string }> = [
  { file: "src/lib/consent/tabStorage.ts", store: "sessionStorage", expr: "key", row: "", why: "the tabStorage helper's own setItem; its callers are checked" },
  { file: "src/lib/consent/prefStorage.ts", store: "anyStorage", expr: "key", row: "", why: "prefStorage.set: `(persistent() ? localStorage : sessionStorage).setItem(key, value)`; its callers are checked" },
  { file: "src/lib/consent/prefStorage.ts", store: "prefStorage", expr: "key", row: "", why: "getWithLegacy moving a value to its caller's key" },
  { file: "src/components/features/employer/job-form/jobDraftStorage.ts", store: "anyStorage", expr: "storageKey", row: "job-draft-*", why: "migrateLegacyDraft(storageKey, ...): its caller passes `${JOB_DRAFT_PREFIX}${userId}`" },
];

/** Writes that only run in development (`next dev`), never in a production build. */
const DEV_ONLY_SITES: Array<{ file: string; key: string; guard: RegExp }> = [
  { file: "src/components/shared/ServiceWorkerRegistration.tsx", key: "sw-dev-cleanup-reloaded", guard: /process\.env\.NODE_ENV\s*!==\s*"production"/ },
];

function scanSource(): { sites: WriteSite[]; files: string[]; texts: Map<string, string> } {
  const files = sourceFiles(SRC);
  const texts = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const global: Definitions = { values: new Map(), functions: new Map() };
  for (const text of texts.values()) collectDefinitions(text, global, true);
  const sites = files.flatMap((file) => findWriteSites(texts.get(file) ?? "", rel(file), global));
  return { sites, files, texts };
}

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

export interface CspSource {
  directive: string;
  source: string;
  host: string;
  path: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The host sources of a Content-Security-Policy value, and what it allows that
 * no registry row could cover: a scheme source other than data: / blob: (`*`,
 * `https:`, `http:`, `ws:`, `wss:` allow every host), a wildcard broader than
 * `*.x.y`, a plain http / ws host, and localhost outside the development policy.
 */
export function cspSources(policy: string, options: { dev?: boolean } = {}): { sources: CspSource[]; problems: string[] } {
  const sources: CspSource[] = [];
  const problems: string[] = [];
  for (const raw of policy.split(";")) {
    const [directive, ...list] = raw.trim().split(/\s+/);
    if (!directive) continue;
    for (const source of list) {
      if (source.startsWith("'")) continue; // 'self', 'nonce-...', 'sha256-...', 'strict-dynamic', 'none'
      if (/^(data|blob):$/i.test(source)) continue;
      if (source === "*" || /^[a-z][a-z0-9+.-]*:$/i.test(source)) {
        problems.push(`${directive} ${source}: allows every host`);
        continue;
      }
      const match = source.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/:]+)(?::(\d+|\*))?(\/.*)?$/i);
      if (!match) {
        problems.push(`${directive} ${source}: unreadable source`);
        continue;
      }
      const scheme = (match[1] ?? "").toLowerCase();
      const host = match[2].toLowerCase();
      const path = match[4] ?? "";
      if (LOCAL_HOSTS.has(host)) {
        if (!options.dev) problems.push(`${directive} ${source}: localhost outside the development policy`);
        continue;
      }
      if (host.includes("*") && !/^\*\.[a-z0-9-]+\.[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host)) {
        problems.push(`${directive} ${source}: wildcard broader than *.x.y`);
        continue;
      }
      if (scheme === "http" || scheme === "ws") problems.push(`${directive} ${source}: not encrypted`);
      sources.push({ directive, source, host, path });
    }
  }
  return { sources, problems };
}

/** `hostname: "..."` entries inside images.remotePatterns of a next.config source. */
export function remotePatternHosts(configSource: string): string[] {
  const start = configSource.indexOf("remotePatterns");
  if (start === -1) return [];
  const open = configSource.indexOf("[", start);
  const block = readExpression(configSource, open + 1);
  return [...block.matchAll(/hostname:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1].toLowerCase());
}

/**
 * URLs the browser loads as a frame or script: any ".../embed/..." address, an
 * element's `src` set to an absolute URL, and `src="https://..."` in JSX.
 */
export function frameAndScriptUrls(text: string): string[] {
  const urls = new Set<string>();
  const patterns = [
    /https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/embed\/[^"'`\s]*/gi,
    /\.src\s*=\s*[`"'](https:\/\/[^"'`\s]+)/gi,
    /<(?:iframe|script|frame|embed|object)\b[^>]*\b(?:src|data)=\{?\s*[`"'](https:\/\/[^"'`\s]+)/gi,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) urls.add(m[1] ?? m[0]);
  return [...urls];
}

function policies(): Array<{ policy: string; dev: boolean }> {
  const env = process.env as Record<string, string | undefined>;
  const original = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    const prod = getSecurityHeaders("nonce")["Content-Security-Policy"];
    env.NODE_ENV = "development";
    const dev = getSecurityHeaders("nonce")["Content-Security-Policy"];
    return [
      { policy: prod, dev: false },
      { policy: dev, dev: true },
      { policy: SECURITY_HEADERS["Content-Security-Policy"], dev: false },
    ];
  } finally {
    env.NODE_ENV = original;
  }
}

/** Hosts in remotePatterns that only our server fetches (the /api/proxy-image avatar proxy and next/image). */
const SERVER_FETCHED_HOSTS: readonly string[] = PROVIDER_AVATAR_HOSTS;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function leafKeys(node: unknown, prefix: string, out: string[] = []): string[] {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) leafKeys(value, prefix ? `${prefix}.${key}` : key, out);
  } else out.push(prefix);
  return out;
}

export function parityGaps(a: unknown, b: unknown): { onlyInFirst: string[]; onlyInSecond: string[] } {
  const ka = new Set(leafKeys(a, "consent"));
  const kb = new Set(leafKeys(b, "consent"));
  return { onlyInFirst: [...ka].filter((k) => !kb.has(k)).sort(), onlyInSecond: [...kb].filter((k) => !ka.has(k)).sort() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("inventory guard: the matchers themselves", () => {
  const empty = (): Definitions => ({ values: new Map(), functions: new Map() });

  it("matches exact names and prefix rows, and treats run-time parts as unknown", () => {
    expect(nameMatches("csrf-token", "csrf-token")).toBe(true);
    expect(nameMatches("csrf-token", "csrf-token-2")).toBe(false);
    expect(nameMatches("poster-edit:*", "poster-edit:*")).toBe(true);
    expect(nameMatches("job-ai-*", "job-ai-prefill")).toBe(true);
    expect(nameMatches("ui:*", "*")).toBe(false);
    expect(nameMatches("csrf-token", "csrf-*")).toBe(false);
  });

  it("resolves literals, constants, templates, conditionals and one-return helpers", () => {
    const text = [
      'const PREFIX = "poster-edit:";',
      "const key = (id: string) => `${PREFIX}${id}`;",
      'function name(): string { return secure ? "__Secure-authjs.session-token" : "authjs.session-token"; }',
      "const A = `ai_insights_${role}_${day}`;",
    ].join("\n");
    const defs = empty();
    collectDefinitions(text, defs);
    expect(resolveExpression('"x"', defs, empty())).toEqual(["x"]);
    expect(resolveExpression("key(id)", defs, empty())).toEqual(["poster-edit:*"]);
    expect(resolveExpression("name()", defs, empty())).toEqual(["__Secure-authjs.session-token", "authjs.session-token"]);
    expect(resolveExpression("A", defs, empty())).toEqual(["ai_insights_*"]);
    expect(resolveExpression("item.name", defs, empty())).toBeNull();
  });

  it("finds storage and cookie writes, and skips deletions", () => {
    const text = [
      'localStorage.setItem("planted_key", "1");',
      "window.sessionStorage.setItem(\n  `job-draft-${id}`,\n  v);",
      'res.cookies.set("planted_cookie", token, { path: "/" });',
      'res.cookies.set("mpl_ref", "", { maxAge: 0 });',
      'document.cookie = `NEXT_LOCALE=${l};path=/`;',
      'document.cookie = "old=; Max-Age=0; Path=/";',
    ].join("\n");
    const sites = findWriteSites(text, "x.ts", empty());
    expect(sites.map((s) => [s.store, s.keys])).toEqual([
      ["localStorage", ["planted_key"]],
      ["sessionStorage", ["job-draft-*"]],
      ["cookie", ["planted_cookie"]],
      ["cookie", ["NEXT_LOCALE"]],
    ]);
    expect(rowFor("localStorage", "planted_key")).toBeUndefined();
    expect(rowFor("sessionStorage", "job-draft-*")).toBeDefined();
  });

  it("reads CSP hosts, remotePatterns hosts and frame/script URLs", () => {
    const read = cspSources("img-src 'self' data: blob: https://a.example *.b.example; frame-src https://c.example/path");
    expect(read.sources.map((s) => [s.host, s.path])).toEqual([
      ["a.example", ""],
      ["*.b.example", ""],
      ["c.example", "/path"],
    ]);
    expect(read.problems).toEqual([]);
    expect(remotePatternHosts('images: { remotePatterns: [ { protocol: "https", hostname: "planted.example" } ] }')).toEqual(["planted.example"]);
    expect(frameAndScriptUrls('s.src = `https://planted.example/x.js`; <iframe src="https://frame.example/a" />; const u = `https://v.example/embed/${id}`;').sort()).toEqual([
      "https://frame.example/a",
      "https://planted.example/x.js",
      "https://v.example/embed/${id}",
    ]);
    expect(hostRowFor("planted.example")).toBeUndefined();
    expect(hostRowFor("www.google.com", "/recaptcha/api.js")).toBeDefined();
    expect(hostRowFor("www.google.com", "/maps")).toBeUndefined();
    expect(hostRowFor("www.google.com")).toBeUndefined(); // a host-wide source is not covered by a row that names a path
    expect(hostRowFor("d4dx-storage.blr1.cdn.digitaloceanspaces.com")).toBeDefined();
  });

  it("flags CSP sources that allow every host, broad wildcards, plain http and stray localhost", () => {
    const { problems } = cspSources(
      "img-src * https:; connect-src http: ws: wss: https://*.com http://plain.example ws://localhost:3888; frame-src https://ok.example/x",
    );
    expect(problems).toEqual([
      "img-src *: allows every host",
      "img-src https:: allows every host",
      "connect-src http:: allows every host",
      "connect-src ws:: allows every host",
      "connect-src wss:: allows every host",
      "connect-src https://*.com: wildcard broader than *.x.y",
      "connect-src http://plain.example: not encrypted",
      "connect-src ws://localhost:3888: localhost outside the development policy",
    ]);
    expect(cspSources("connect-src ws://localhost:3888", { dev: true }).problems).toEqual([]);
  });

  it("checks a setItem on any receiver against both storage kinds", () => {
    const sites = findWriteSites('const s: Storage = pick();\ns.setItem("planted_any_receiver", "1");\n(x ? localStorage : sessionStorage).setItem("job-ai-x", v);', "x.ts", empty());
    expect(sites.map((site) => [site.store, site.keys])).toEqual([
      ["anyStorage", ["planted_any_receiver"]],
      ["anyStorage", ["job-ai-x"]],
    ]);
    expect(rowForStore("anyStorage", "planted_any_receiver")).toBeUndefined();
    expect(rowForStore("anyStorage", "job-ai-x")).toBeDefined();
  });

  it("reports consent keys present in one locale only", () => {
    expect(parityGaps({ a: "1", b: { c: "2" } }, { a: "1" })).toEqual({ onlyInFirst: ["consent.b.c"], onlyInSecond: [] });
  });
});

describe("inventory guard: every cookie and storage key the code writes has a registry row", () => {
  const { sites, files, texts } = scanSource();

  it("reads the source tree and finds the known writers", () => {
    expect(files.length).toBeGreaterThan(500);
    // Non-vacuous: a few writers this guard must see.
    const seen = (file: string, store: Store) => sites.some((s) => s.file === file && s.store === store);
    expect(seen("src/hooks/useIdleTimeout.ts", "localStorage")).toBe(true);
    expect(seen("src/lib/security/csrf.ts", "cookie")).toBe(true);
    expect(seen("src/lib/consent/client.ts", "cookie")).toBe(true);
    expect(seen("src/hooks/useCurrencyPreference.ts", "prefStorage")).toBe(true);
    expect(sites.length).toBeGreaterThan(25);
  });

  it("every statically readable key matches a row of the same kind", () => {
    const offenders = sites
      .filter((site) => site.keys !== null)
      .flatMap((site) => (site.keys ?? []).map((key) => ({ site, key })))
      .filter(({ site, key }) => !DEV_ONLY_SITES.some((d) => d.file === site.file && d.key === key))
      .filter(({ site, key }) => !rowForStore(site.store, key))
      .map(({ site, key }) => `${site.file}:${site.line} ${site.store} "${key}" (from ${site.expr})`);
    expect(offenders).toEqual([]);
  });

  it("a key that is only known at run time is mapped to a registry row in DYNAMIC_SITES", () => {
    const unreadable = sites.filter((site) => site.keys === null);
    const unmapped = unreadable
      .filter((site) => !DYNAMIC_SITES.some((d) => d.file === site.file && d.store === site.store && d.expr === site.expr))
      .map((site) => `${site.file}:${site.line} ${site.store} ${site.expr}`);
    expect(unmapped).toEqual([]);
    // Each mapping names a real row (or is a helper whose callers are checked), and the site still exists.
    for (const entry of DYNAMIC_SITES) {
      if (entry.row) expect(ROWS.some((row) => row.name === entry.row)).toBe(true);
      const label = `${entry.file} ${entry.store} ${entry.expr}`;
      expect({ label, present: sites.some((site) => site.file === entry.file && site.store === entry.store && site.expr === entry.expr) }).toEqual({ label, present: true });
    }
  });

  it("development-only writes are still inside their development branch", () => {
    for (const entry of DEV_ONLY_SITES) {
      const text = texts.get(path.join(ROOT, entry.file)) ?? "";
      const guardAt = text.search(entry.guard);
      const writeAt = text.indexOf(`setItem("${entry.key}"`);
      expect({ file: entry.file, guardAt: guardAt >= 0, writeAfterGuard: writeAt > guardAt }).toEqual({ file: entry.file, guardAt: true, writeAfterGuard: true });
    }
  });

  it("preference keys reach localStorage only through src/lib/consent (prefStorage honours an objection)", () => {
    const offenders = sites
      .filter((site) => (site.store === "localStorage" || site.store === "anyStorage") && !site.file.startsWith("src/lib/consent/"))
      .filter((site) => (site.keys ?? []).some((key) => rowFor("localStorage", key)?.category === "preferences"))
      .map((site) => `${site.file}:${site.line} localStorage.setItem(${site.expr})`);
    expect(offenders).toEqual([]);
  });
});

describe("inventory guard: every host the browser may contact has a registry row", () => {
  it("every CSP host source (production, development and API policies), path included when the row names one", () => {
    const read = policies().map(({ policy, dev }) => cspSources(policy, { dev }));
    const sources = read.flatMap((r) => r.sources);
    expect(sources.length).toBeGreaterThan(5);
    expect(read.flatMap((r) => r.problems)).toEqual([]);
    expect([...new Set(sources.filter((s) => !hostRowFor(s.host, s.path)).map((s) => `${s.directive} ${s.source}`))]).toEqual([]);
  });

  it("every images.remotePatterns host, or a provider-avatar host our server fetches (never listed in the CSP)", () => {
    const hosts = remotePatternHosts(readFileSync(path.join(ROOT, "next.config.ts"), "utf8"));
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.filter((host) => !hostRowFor(host) && !SERVER_FETCHED_HOSTS.includes(host))).toEqual([]);
    // The exception is only safe while the browser cannot load those hosts itself.
    const csp = new Set(policies().flatMap(({ policy, dev }) => cspSources(policy, { dev }).sources.map((s) => s.host)));
    expect(SERVER_FETCHED_HOSTS.filter((host) => csp.has(host) || [...csp].some((h) => h.startsWith("*.") && host.endsWith(h.slice(1))))).toEqual([]);
  });

  it("every iframe / injected-script host in the source", () => {
    const urls = sourceFiles(SRC).flatMap((file) => frameAndScriptUrls(readFileSync(file, "utf8")).map((url) => ({ file: rel(file), url })));
    expect(urls.length).toBeGreaterThanOrEqual(2); // youtube-nocookie embed + reCAPTCHA api.js
    const offenders = urls.filter(({ url }) => {
      const parsed = new URL(url.replace(/\$\{[^}]*\}/g, "x"));
      return !hostRowFor(parsed.hostname, parsed.pathname);
    });
    expect(offenders).toEqual([]);
  });
});

describe("inventory guard: consent.* messages exist in both locales", () => {
  it("en and ar have the same consent.* keys", () => {
    expect(parityGaps((en as Record<string, unknown>).consent, (ar as Record<string, unknown>).consent)).toEqual({ onlyInFirst: [], onlyInSecond: [] });
  });

  it("no consent.* message is empty in either locale", () => {
    for (const messages of [en, ar] as Array<Record<string, unknown>>) {
      const empty = leafKeys(messages.consent, "consent").filter((key) => {
        const value = key.split(".").slice(1).reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages.consent);
        return typeof value !== "string" || value.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });
});
