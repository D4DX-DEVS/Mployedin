/**
 * The solicitor review copy of the generated Cookie Policy: one HTML document holding the English and the Arabic
 * body. Pure (no files, no database), so scripts/write-cookie-policy-review.mjs writes it and the tests build it in
 * memory (docs/ is gitignored, so a test must never need the written file).
 */

import { buildCookiePolicy } from "./cookiePolicyFromRegistry.mjs";

/**
 * @param {{ registry: Array<Record<string, unknown>>, messagesEn: object, messagesAr: object }} input
 * @returns {string} the whole HTML document
 */
export function buildCookiePolicyReview({ registry, messagesEn, messagesAr }) {
  const en = buildCookiePolicy({ registry, messages: messagesEn, locale: "en" });
  // This one file holds both languages and ids must be unique in a document, so the Arabic
  // block's section ids get an "ar-" prefix here, in the review copy only. The bodies that
  // update-legal-content.mjs writes to the CMS keep the same plain ids in both languages.
  const ar = buildCookiePolicy({ registry, messages: messagesAr, locale: "ar" }).replace(/<h2 id="/g, '<h2 id="ar-');
  const pending = registry.filter((row) => row.legal === "pending").map((row) => row.name);

  // The charset goes before the comment: browsers only look for it in the first 1024 bytes,
  // and the comment grows with the list of pending rows.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<!--
  Cookie Policy: GENERATED, NOT PUBLISHED. For solicitor review.

  Made by scripts/write-cookie-policy-review.mjs from src/lib/consent/registry.json
  (${registry.length} rows, exported from src/lib/consent/registry.ts) and the Cookie settings
  strings in messages/en.json and messages/ar.json. Do not edit by hand: change
  the registry or scripts/lib/cookiePolicyFromRegistry.mjs and run it again.

  Registry rows still marked legal: "pending": ${pending.join(", ") || "none"}.

  The same text goes to Admin > CMS > Static Pages > Cookie Policy when the owner
  runs scripts/update-legal-content.mjs with its "apply" option (a plain run is
  a dry run that only prints a diff). The <html>/<head> shell, the two <div>
  wrappers below, the <style>, and the "ar-" prefix on the Arabic section ids
  are for reading this file in a browser; the page body is what is inside each
  <div>, without that prefix.
-->
<title>Cookie Policy (generated, for review)</title>
<style>
  body { font-family: system-ui, sans-serif; line-height: 1.5; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; vertical-align: top; text-align: start; }
  th { background: #f3f3f3; }
  .overflow-x-auto { overflow-x: auto; }
</style>
</head>
<body>

<!-- ===================== ENGLISH (Body) ===================== -->
<div lang="en">
${en}
</div>

<!-- ===================== ARABIC (Arabic body) ===================== -->
<div lang="ar" dir="rtl">
${ar}
</div>
</body>
</html>
`;
}
