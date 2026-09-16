#!/usr/bin/env node
/**
 * Translate missing keys from en.json → ar.json using the Gemini API.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/translate-missing.mjs
 *
 * Reads messages/en.json and messages/ar.json, finds keys present in en but
 * missing in ar, batches them into Gemini requests, and writes the
 * updated ar.json back to disk.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const enPath = path.join(root, "messages", "en.json");
const arPath = path.join(root, "messages", "ar.json");

const GEMINI_BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
// UI strings only — the cheapest text model is plenty.
const MODEL = process.env.GEMINI_TRANSLATE_MODEL || "gemini-3.1-flash-lite";

function getApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    console.error("❌  Set GEMINI_API_KEY environment variable first.");
    process.exit(1);
  }
  return key;
}

/** Flatten nested object to dot-separated paths */
function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Unflatten dot-separated paths back to nested object */
function unflatten(flat) {
  const out = {};
  for (const [dotKey, val] of Object.entries(flat)) {
    const parts = dotKey.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  return out;
}

/** Deep-merge source into target without overwriting existing keys */
function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      target[k] = target[k] || {};
      deepMerge(target[k], v);
    } else if (!(k in target)) {
      target[k] = v;
    }
  }
  return target;
}

async function translateBatch(entries, apiKey) {
  const prompt = `You are a professional Arabic translator for a recruitment/hiring platform called Mployedin.
Translate the following English UI strings to Modern Standard Arabic.
Keep ICU placeholders like {count}, {userName}, {score} unchanged.
Keep HTML entities unchanged.
Return ONLY a JSON object mapping the same keys to Arabic translations. No markdown, no explanation.

${JSON.stringify(Object.fromEntries(entries), null, 2)}`;

  const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  let text = data.choices[0].message.content.trim();

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  return JSON.parse(text);
}

async function main() {
  const apiKey = getApiKey();

  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
  const ar = JSON.parse(fs.readFileSync(arPath, "utf-8"));

  const flatEn = flatten(en);
  const flatAr = flatten(ar);

  const missing = Object.entries(flatEn).filter(([k]) => !(k in flatAr));

  if (missing.length === 0) {
    console.log("✅  No missing translations — ar.json is complete.");
    return;
  }

  console.log(`🔍  Found ${missing.length} missing Arabic translations.`);

  // Batch in chunks of 50
  const BATCH = 50;
  const allTranslated = {};

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    console.log(`🌐  Translating batch ${Math.floor(i / BATCH) + 1} (${batch.length} keys)...`);
    const translated = await translateBatch(batch, apiKey);
    Object.assign(allTranslated, translated);
  }

  // Merge into ar.json
  const newNested = unflatten(allTranslated);
  deepMerge(ar, newNested);

  fs.writeFileSync(arPath, JSON.stringify(ar, null, 2) + "\n", "utf-8");
  console.log(`✅  Updated ar.json with ${missing.length} new translations.`);
}

main().catch((err) => {
  console.error("❌  Translation failed:", err.message);
  process.exit(1);
});
