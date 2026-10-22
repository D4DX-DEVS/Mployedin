/**
 * Write docs/legal/cookie-policy-generated.html: the generated Cookie Policy
 * (English and Arabic) in one file, for the solicitor to read.
 *
 * Usage:
 *   node scripts/write-cookie-policy-review.mjs
 *
 * Reads src/lib/consent/registry.json and messages/{en,ar}.json, writes that
 * one file. No .env, no database, nothing published: the live page changes
 * only when someone runs scripts/update-legal-content.mjs --apply.
 *
 * It is a snapshot. Run it again after `npm run consent:export` if the
 * registry (or the Cookie settings wording) changed.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCookiePolicyReview } from "./lib/cookiePolicyReview.mjs";
import { readMessages, readRegistryJson } from "./lib/consentFiles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "docs", "legal", "cookie-policy-generated.html");

const registry = readRegistryJson(root);
const html = buildCookiePolicyReview({ registry, messagesEn: readMessages(root, "en"), messagesAr: readMessages(root, "ar") });

writeFileSync(target, html);
console.log(`Wrote ${path.relative(root, target)} (${registry.length} registry rows).`);
