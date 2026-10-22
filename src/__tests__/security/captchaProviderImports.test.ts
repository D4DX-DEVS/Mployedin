/**
 * @jest-environment node
 *
 * reCAPTCHA sits behind a swappable provider (PECR plan task 11, decision D2:
 * kept behind an abstraction until the solicitor decides). A swap is meant to be
 * one adapter file plus NEXT_PUBLIC_CAPTCHA_PROVIDER, which only holds while no
 * other file reaches past the adapter. This walks every source file and fails
 * when something imports the reCAPTCHA modules, or reads their keys, directly.
 */
import fs from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "src");
const BROWSER_RECAPTCHA = path.join(SRC, "lib", "browser", "recaptcha.ts");
const SERVER_RECAPTCHA = path.join(SRC, "lib", "security", "recaptcha.ts");
const BROWSER_ADAPTER = path.join(SRC, "lib", "browser", "captcha.ts");
const SERVER_ADAPTER = path.join(SRC, "lib", "security", "captcha.ts");

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

/** Product source: everything under src except tests, mocks and test helpers. */
function productFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "__mocks__" || entry.name === "test-utils") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) productFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");
const FILES = productFiles();

function importersOf(target: string): string[] {
  return FILES.filter((file) => specifiers(fs.readFileSync(file, "utf8")).some((s) => resolveSpecifier(file, s) === target)).map(rel);
}

describe("reCAPTCHA is reached only through the captcha adapters", () => {
  it("walks the real source tree (the check is not vacuous)", () => {
    expect(FILES.length).toBeGreaterThan(500);
    expect(FILES.map(rel)).toContain("lib/security/recaptcha.ts");
  });

  it("only lib/browser/captcha.ts imports the browser reCAPTCHA module", () => {
    expect(importersOf(BROWSER_RECAPTCHA)).toEqual(["lib/browser/captcha.ts"]);
  });

  it("only lib/security/captcha.ts imports the server reCAPTCHA module", () => {
    expect(importersOf(SERVER_RECAPTCHA)).toEqual(["lib/security/captcha.ts"]);
  });

  it("the adapters exist where the guard expects them", () => {
    expect(fs.existsSync(BROWSER_ADAPTER)).toBe(true);
    expect(fs.existsSync(SERVER_ADAPTER)).toBe(true);
  });

  it("no other file reads the reCAPTCHA keys or talks to Google's reCAPTCHA endpoints", () => {
    const allowed = new Set([BROWSER_RECAPTCHA, SERVER_RECAPTCHA].map(rel));
    const offenders = FILES.filter((file) => !allowed.has(rel(file)))
      .filter((file) =>
        /RECAPTCHA_SECRET_KEY|NEXT_PUBLIC_RECAPTCHA_SITE_KEY|google\.com\/recaptcha\/api/.test(stripComments(fs.readFileSync(file, "utf8"))),
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("only the shared resolver and the two adapters read the provider switch", () => {
    const allowed = new Set(["lib/captcha/provider.ts", "lib/browser/captcha.ts", "lib/security/captcha.ts"]);
    const readers = FILES.filter((file) => /NEXT_PUBLIC_CAPTCHA_PROVIDER/.test(stripComments(fs.readFileSync(file, "utf8")))).map(rel);
    expect(readers.filter((file) => !allowed.has(file))).toEqual([]);
    expect(readers).toEqual(expect.arrayContaining(["lib/browser/captcha.ts", "lib/security/captcha.ts"]));
  });

  it("the specifier scan sees value imports and ignores type-only ones", () => {
    const sample = [
      'import { a } from "@/lib/browser/recaptcha";',
      'import type { B } from "@/lib/security/recaptcha";',
      '// import { c } from "@/lib/browser/recaptcha";',
    ].join("\n");
    expect(specifiers(sample)).toEqual(["@/lib/browser/recaptcha"]);
  });
});
