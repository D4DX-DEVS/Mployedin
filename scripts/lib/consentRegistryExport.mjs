/**
 * Turns src/lib/consent/registry.ts into src/lib/consent/registry.json, the
 * copy plain Node can read (the Cookie Policy script cannot import a .ts file).
 *
 * No tsx / ts-node needed: the TypeScript compiler (already a devDependency)
 * strips the types from registry.ts in memory and the result is evaluated with
 * no `require`, so the file must stay a plain data module (type-only imports
 * are fine, value imports make the export fail loudly).
 *
 * `npm run consent:export` is the only writer. A Jest guard
 * (src/__tests__/scripts/consentRegistryExport.test.ts) fails when the .json is
 * out of step with the .ts.
 *
 * Needs the `typescript` devDependency, so scripts that run on a production
 * install (update-legal-content.mjs) must not import this file; they read the
 * .json through consentFiles.mjs.
 */

import vm from "node:vm";
import ts from "typescript";

/** Key order for every row; keys a future RegistryItem adds follow, sorted, so nothing is silently dropped. */
const KEY_ORDER = ["name", "kind", "category", "basis", "party", "duration", "owner", "purposeKey", "legal"];

/**
 * Evaluate the source of registry.ts and return its REGISTRY array.
 * @param {string} source TypeScript source text
 * @returns {Array<Record<string, unknown>>}
 */
export function loadRegistryFromSource(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: false,
  });
  const module = { exports: {} };
  const noRequire = (id) => {
    throw new Error(`registry.ts imports "${id}" as a value; the registry must stay a plain data module so it can be exported`);
  };
  // A fresh context with only these three names: the file is data, and gets no process, fs or fetch.
  vm.runInNewContext(outputText, { exports: module.exports, module, require: noRequire }, { filename: "registry.ts" });
  const rows = module.exports.REGISTRY;
  if (!Array.isArray(rows)) throw new Error("registry.ts does not export a REGISTRY array");
  // Back into this realm's plain objects and arrays.
  return JSON.parse(JSON.stringify(rows));
}

function orderedRow(row) {
  const keys = Object.keys(row);
  const known = KEY_ORDER.filter((key) => row[key] !== undefined);
  const extra = keys.filter((key) => !KEY_ORDER.includes(key) && row[key] !== undefined).sort();
  return Object.fromEntries([...known, ...extra].map((key) => [key, row[key]]));
}

/** The exact text registry.json holds: stable key order, two-space indent, one trailing newline. */
export function serializeRegistry(rows) {
  return JSON.stringify(rows.map(orderedRow), null, 2) + "\n";
}
