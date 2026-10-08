#!/usr/bin/env node
/**
 * Static check for literal next-intl keys that are missing from messages/*.json.
 *
 * Finds translator bindings such as
 *   const t = useTranslations("ns")
 *   const t = await getTranslations("ns")
 *   const t = await getTranslations({ locale, namespace: "ns" })
 * and the literal calls on them — t("key"), t.rich("key"), t.raw("key"),
 * t.markup("key") — then reports every `ns.key` absent from a locale file.
 * A call resolves to the nearest preceding binding with the same name in the
 * file (good enough for one-component-per-file code). Dynamic keys (t(var),
 * template strings) are out of scope; t.has("key") is ignored on purpose.
 *
 * Usage: node scripts/qa/i18n-literal-check.mjs [--json]
 * Exit code 1 when anything is missing.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SRC = path.join(ROOT, "src");
const LOCALES = ["en", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(ROOT, "messages", `${l}.json`), "utf8"))]),
);

function has(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split(".")) {
    if (cur == null || typeof cur !== "object" || !(part in cur)) return false;
    cur = cur[part];
  }
  return true;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(ent.name) && !/\.(test|spec)\./.test(ent.name)) out.push(p);
  }
  return out;
}

const BINDING =
  /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:["'`]([\w.-]*)["'`]|\{[^}]*?namespace\s*:\s*["'`]([\w.-]+)["'`][^}]*\})?\s*\)/g;

const missing = [];
for (const file of walk(SRC)) {
  const code = fs.readFileSync(file, "utf8");
  const bindings = [];
  for (const m of code.matchAll(BINDING)) bindings.push({ name: m[1], ns: m[2] ?? m[3] ?? "", index: m.index });
  if (!bindings.length) continue;

  for (const name of new Set(bindings.map((b) => b.name))) {
    const esc = name.replace(/\$/g, "\\$");
    const call = new RegExp(`(?<![\\w$.])${esc}(?:\\.(?:rich|raw|markup))?\\(\\s*["']([\\w.-]+)["']`, "g");
    for (const m of code.matchAll(call)) {
      const candidates = bindings.filter((b) => b.name === name && b.index < m.index);
      const binding = candidates.at(-1);
      if (!binding) continue;
      const full = binding.ns ? `${binding.ns}.${m[1]}` : m[1];
      // Another binding of the same name (e.g. a sibling component) may own the key.
      const others = bindings.filter((b) => b.name === name && b !== binding);
      const altOk = (l) => others.some((b) => has(messages[l], b.ns ? `${b.ns}.${m[1]}` : m[1]));
      const absent = LOCALES.filter((l) => !has(messages[l], full) && !altOk(l));
      if (absent.length) {
        const line = code.slice(0, m.index).split("\n").length;
        missing.push({ key: full, locales: absent, file: path.relative(ROOT, file), line });
      }
    }
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(missing, null, 2));
} else if (!missing.length) {
  console.log("i18n-literal-check: no missing literal keys");
} else {
  for (const m of missing) console.log(`${m.key}  [missing: ${m.locales.join(",")}]  ${m.file}:${m.line}`);
  console.log(`\n${missing.length} missing key reference(s), ${new Set(missing.map((m) => m.key)).size} unique`);
}
process.exit(missing.length ? 1 : 0);
