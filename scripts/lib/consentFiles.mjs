/**
 * Where the Cookie Policy's inputs live, and how to read them. Plain Node only
 * (fs + path): update-legal-content.mjs imports this, and that script must run
 * on a production install, where devDependencies such as `typescript` are
 * absent. The TypeScript-dependent half (registry.ts -> registry.json) is in
 * consentRegistryExport.mjs, which that script must never import. A Jest test
 * walks the script's import graph to keep it that way.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export function registryPaths(root) {
  return {
    ts: path.join(root, "src", "lib", "consent", "registry.ts"),
    json: path.join(root, "src", "lib", "consent", "registry.json"),
  };
}

/** Rows as registry.json holds them (the policy generator's input). */
export function readRegistryJson(root) {
  return JSON.parse(readFileSync(registryPaths(root).json, "utf8"));
}

/** One locale's message file (the Cookie settings dialog's strings live in it). */
export function readMessages(root, locale) {
  return JSON.parse(readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"));
}
