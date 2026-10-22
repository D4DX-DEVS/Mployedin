/**
 * Write src/lib/consent/registry.json from src/lib/consent/registry.ts.
 *
 * Usage:
 *   npm run consent:export
 *
 * Run it after any change to REGISTRY, and commit the .json with the .ts. The
 * Cookie Policy script (scripts/update-legal-content.mjs) reads the .json, and
 * a Jest guard fails when the two disagree.
 *
 * Touches nothing but registry.json, and does not read .env or the database.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registryPaths } from "./lib/consentFiles.mjs";
import { loadRegistryFromSource, serializeRegistry } from "./lib/consentRegistryExport.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = registryPaths(root);

const rows = loadRegistryFromSource(readFileSync(paths.ts, "utf8"));
const text = serializeRegistry(rows);

let previous = null;
try {
  previous = readFileSync(paths.json, "utf8");
} catch {
  // first export
}

// (a Windows checkout with core.autocrlf stores the file with CRLF; that is not a change)
if (previous !== null && previous.replace(/\r\n/g, "\n") === text) {
  console.log(`registry.json is up to date (${rows.length} rows).`);
} else {
  writeFileSync(paths.json, text);
  console.log(`Wrote ${path.relative(root, paths.json)} (${rows.length} rows).`);
}
