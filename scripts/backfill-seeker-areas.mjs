/**
 * Give existing job seekers an area (JobSeeker.regionCityId / regionStateId)
 * from the free-text location they already have, so agents' and super agents'
 * "In my area" lists fill. New seekers pick their area at onboarding; this is
 * the one-off catch-up for everyone before that (6k+, mostly legacy imports
 * written as "City(State-Country)").
 *
 * How a location becomes an area, most certain first:
 *   exact   the city name (or a known alias) is in the catalogue, in that country
 *           (and in that state when the text names one)
 *   fuzzy   a near-identical spelling in the same state/country ("Kasargod" ->
 *           "Kasaragod"), Jaro-Winkler >= FUZZY_MIN
 *   vector  (--vector) nearest catalogue city by embedding in the same
 *           state/country, cosine >= VECTOR_MIN and clearly ahead of the runner-up
 *   region  no city found but the state is listed -> region-only area, which the
 *           app supports (only staff holding the whole region see it)
 * The legacy importer geocoded some towns into the wrong country
 * ("Muscat" -> "Muscatine, Iowa, USA"). A country whose seekers' phone numbers
 * almost never agree with it is treated as unreliable: the town is looked up in
 * the seeker's phone country instead, and left alone when that fails.
 * Anything uncertain is left without an area and listed in the report.
 *
 * Writes (only with --apply) per seeker: regionCityId, regionStateId,
 * currentLocation = "City, Country" (same as the profile PATCH), and
 * areaBackfill { from, method, score, at, reembedPending } so a run can be
 * reverted and the search vector rebuilt with the clean location.
 * Seekers that already have an area are never touched.
 *
 * Usage (node 22, no tsx in this repo):
 *   node --env-file=.env scripts/backfill-seeker-areas.mjs                 dry run, writes report
 *   node --env-file=.env scripts/backfill-seeker-areas.mjs --vector        + embedding tier (small Gemini cost)
 *   ... --apply                                                            write areas
 *   node --env-file=.env --experimental-transform-types --no-warnings \
 *     --import ./scripts/lib/ts-alias-register.mjs scripts/backfill-seeker-areas.mjs --reembed
 *                                                                         rebuild search vectors of changed seekers
 *   ... --revert                                                           restore every backfilled seeker
 *   --out <dir>   where the report goes (default ./tmp/seeker-area-backfill)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const VECTOR = args.includes("--vector");
const REEMBED = args.includes("--reembed");
const REVERT = args.includes("--revert");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "tmp/seeker-area-backfill";

const FUZZY_MIN = 0.93;
const VECTOR_MIN = 0.9;
const VECTOR_MARGIN = 0.02;
/** A country is unreliable when fewer than this share of its phone-coded seekers agree with it. */
const RELIABLE_SHARE = 0.3;
const RELIABLE_MIN_SAMPLE = 3;

const out = (line = "") => process.stdout.write(`${line}\n`);

// ---------------------------------------------------------------- text helpers

const norm = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’'`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Same idea as placeKey in cvPrefill.ts, both sides of the comparison. */
const KIND_SUFFIX = /\s+(emirate|municipality|city|state|province|governorate|district|division|region)$/;
const placeKey = (s) => norm(s).replace(KIND_SUFFIX, "").replace(/^(al|el|as|ar|ad|az|ash|an|at)\s+/, "");

/** Mirrors CITY_ALIASES in src/lib/onboarding/cvPrefill.ts, plus Gulf spellings. */
const ALIASES = [
  ["kochi", "cochin"],
  ["kozhikode", "calicut"],
  ["thiruvananthapuram", "trivandrum"],
  ["thrissur", "trichur"],
  ["kannur", "cannanore"],
  ["alappuzha", "alleppey"],
  ["kasaragod", "kasargod", "kasarkode"],
  ["palakkad", "palghat"],
  ["kollam", "quilon"],
  ["wayanad", "wayand"],
  ["bengaluru", "bangalore"],
  ["mumbai", "bombay"],
  ["chennai", "madras"],
  ["kolkata", "calcutta"],
  ["vadodara", "baroda"],
  ["new delhi", "delhi"],
  ["navi mumbai", "panvel"],
  ["khobar", "al khobar"],
  ["jubail", "al jubail"],
  ["riffa", "ar rifa"],
  ["salmiya", "as salimiyah"],
  ["farwaniya", "al farwaniyah"],
  ["wakrah", "al wakrah"],
  ["mangaluru", "mangalore"],
  ["navi mumbai", "navi mumbai panvel"],
  ["fahaheel", "fahahil"],
  ["salmiya", "salimiyah"],
];

/** Old names the legacy importer used for regions the catalogue lists differently. */
const STATE_ALIASES = new Map([
  ["SA|western province", "makkah"],
  ["SA|central province", "riyadh"],
  ["SA|al qassim", "qassim"],
]);
const aliasesOf = (key) => {
  const set = ALIASES.find((g) => g.includes(key));
  return set ? set.filter((n) => n !== key) : [];
};

const COUNTRY_ALIASES = new Map([
  ["united states of america", "US"], ["usa", "US"], ["us", "US"], ["america", "US"],
  ["uae", "AE"], ["u a e", "AE"], ["emirates", "AE"],
  ["ksa", "SA"], ["saudi", "SA"], ["uk", "GB"], ["england", "GB"], ["scotland", "GB"], ["wales", "GB"],
]);
const DEMONYMS = new Map([
  ["indian", "IN"], ["pakistani", "PK"], ["bangladeshi", "BD"], ["nepali", "NP"], ["nepalese", "NP"],
  ["sri lankan", "LK"], ["filipino", "PH"], ["egyptian", "EG"], ["emirati", "AE"], ["saudi", "SA"],
  ["bahraini", "BH"], ["kuwaiti", "KW"], ["qatari", "QA"], ["omani", "OM"], ["american", "US"],
  ["british", "GB"], ["jordanian", "JO"], ["sudanese", "SD"], ["yemeni", "YE"], ["syrian", "SY"], ["lebanese", "LB"],
]);
/** Where nearly all seekers are; used only to place a town whose legacy country was wrong. */
const CORE_MARKETS = ["IN", "AE", "SA", "BH", "KW", "QA", "OM", "EG"];
const GCC = new Set(["AE", "SA", "BH", "KW", "QA", "OM"]);
const DIRECTION =/\s+(north|south|east|west|central)$/;

/** Jaro-Winkler similarity, 0..1. */
function jaroWinkler(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const win = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) {
    for (let j = Math.max(0, i - win); j < Math.min(lb, i + win + 1); j++) {
      if (mb[j] || a[i] !== b[j]) continue;
      ma[i] = mb[j] = true; m++; break;
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
  let p = 0;
  while (p < 4 && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

/**
 * "Kozhikode City(Kerala-India)" -> { places, state, country }.
 * "Tirur, Kerala" / "Dubai, UAE" / "Ernakulam (Kothamangalam), India" too.
 * places = candidate town names, best first (compound "A and B", "A-B" split).
 */
function parseLocation(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let cityPart = "", state = "", country = "";
  const legacy = text.match(/^(.*)\(([^()]*)\)\s*$/);
  if (legacy && legacy[2].includes("-")) {
    const inner = legacy[2];
    const cut = inner.lastIndexOf("-");
    cityPart = legacy[1]; state = inner.slice(0, cut); country = inner.slice(cut + 1);
  } else {
    const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
    cityPart = parts[0] ?? "";
    if (parts.length >= 3) { state = parts[1]; country = parts[parts.length - 1]; }
    else if (parts.length === 2) country = parts[1]; // may really be a state; resolved later
  }
  const places = [];
  const push = (s) => { const k = norm(s); if (k && !places.includes(k)) places.push(k); };
  const bracket = cityPart.match(/^(.*?)\(([^)]*)\)/);
  const main = bracket ? bracket[1] : cityPart;
  push(main);
  for (const piece of main.split(/\s+and\s+|\/|\s*-\s*|&/)) push(piece);
  if (bracket) push(bracket[2]);
  for (const p of [...places]) {
    push(p.replace(DIRECTION, ""));
    push(p.replace(KIND_SUFFIX, ""));
    push(p.replace(/\s+(budruk|budrukh|bk|khurd|kh)$/, "")); // Marathi village qualifiers
  }
  return { places, state: norm(state), country: norm(country) };
}

// ---------------------------------------------------------------- catalogue

async function loadCatalogue(db) {
  const countries = await db.collection("countries").find({}).project({ name: 1, code: 1, phoneCode: 1 }).toArray();
  const states = await db.collection("states").find({ isActive: { $ne: false } }).project({ name: 1, countryId: 1 }).toArray();
  const cities = await db.collection("cities").find({ isActive: true }).project({ name: 1, stateId: 1 }).toArray();
  const countryByCode = new Map(countries.map((c) => [c.code, c]));
  const countryById = new Map(countries.map((c) => [String(c._id), c]));
  const codeByName = new Map(countries.map((c) => [norm(c.name), c.code]));
  for (const [k, v] of COUNTRY_ALIASES) codeByName.set(k, v);
  const stateById = new Map(states.map((s) => [String(s._id), s]));
  const statesByCountry = new Map();
  for (const s of states) {
    const code = countryById.get(String(s.countryId))?.code;
    if (!code) continue;
    s.code = code; s.key = placeKey(s.name);
    (statesByCountry.get(code) ?? statesByCountry.set(code, []).get(code)).push(s);
  }
  const citiesByCountry = new Map();
  for (const c of cities) {
    const st = stateById.get(String(c.stateId));
    if (!st?.code) continue;
    c.code = st.code; c.state = st; c.key = placeKey(c.name);
    (citiesByCountry.get(st.code) ?? citiesByCountry.set(st.code, []).get(st.code)).push(c);
  }
  const phoneCodes = countries
    .map((c) => ({ code: c.code, p: String(c.phoneCode ?? "").replace(/\D/g, "") }))
    .filter((c) => c.p)
    .sort((a, b) => b.p.length - a.p.length);
  return { countryByCode, codeByName, statesByCountry, citiesByCountry, phoneCodes };
}

const SHARED_PHONE_CODE = { "1": "US", "7": "RU", "44": "GB", "61": "AU", "47": "NO", "590": "GP", "262": "RE", "212": "MA" };
function phoneCountry(cat, phone) {
  const s = String(phone ?? "").trim();
  if (!s) return null;
  const compact = s.replace(/[\s()-]/g, "");
  let digits;
  if (compact.startsWith("+")) digits = compact.slice(1).replace(/\D/g, "");
  else if (compact.startsWith("00")) digits = compact.slice(2).replace(/\D/g, "");
  else return null;
  for (const c of cat.phoneCodes) if (digits.startsWith(c.p)) return SHARED_PHONE_CODE[c.p] ?? c.code;
  return null;
}

function findState(cat, code, stateText) {
  if (!stateText) return null;
  const key = STATE_ALIASES.get(`${code}|${norm(stateText)}`) ?? placeKey(stateText);
  const hits = (cat.statesByCountry.get(code) ?? []).filter((s) => s.key === key || norm(s.name) === stateText);
  return hits.length === 1 ? hits[0] : null;
}

/** exact (alias-aware), preferring the named state; then fuzzy inside the state, else the country. */
function matchCity(cat, code, places, state) {
  const pool = cat.citiesByCountry.get(code) ?? [];
  if (!pool.length) return null;
  for (const place of places) {
    const keys = [placeKey(place), ...aliasesOf(placeKey(place)).map(placeKey)];
    let exact = pool.filter((c) => keys.includes(c.key));
    // "Thrissur" and "Thrissur District" both key to "thrissur": the plain name wins.
    if (exact.length > 1) {
      const plain = exact.filter((c) => keys.includes(norm(c.name)));
      if (plain.length) exact = plain;
    }
    const inState = state ? exact.filter((c) => String(c.state._id) === String(state._id)) : [];
    if (inState.length === 1) return { city: inState[0], method: "exact", score: 1 };
    if (!state && exact.length === 1) return { city: exact[0], method: "exact", score: 1 };
    if (state && !inState.length && exact.length === 1) {
      // Named state disagrees. Gulf legacy regions were coarse ("Al Wakrah(Doha-Qatar)",
      // "Yanbu(Western Province-…)") and towns there are unique, so the town wins. Elsewhere
      // (legacy "Hyderabad(Uttar Pradesh-India)", "Ahmadpur(West Bengal)") it is reported only.
      return GCC.has(code)
        ? { city: exact[0], method: "exact-gulf-region-fixed", score: 0.95 }
        : { city: exact[0], method: "exact-other-state", score: 0.95, review: true };
    }
  }
  const scope = state ? pool.filter((c) => String(c.state._id) === String(state._id)) : pool;
  let best = null, second = 0;
  for (const place of places.slice(0, 1)) {
    const key = placeKey(place);
    if (key.length < 4) continue;
    for (const c of scope) {
      const s = jaroWinkler(key, c.key);
      if (!best || s > best.score) { second = best?.score ?? 0; best = { city: c, score: s }; }
      else if (s > second) second = s;
    }
  }
  if (best && best.score >= FUZZY_MIN && best.score - second >= 0.02) return { ...best, method: "fuzzy" };
  return null;
}

// ---------------------------------------------------------------- vector tier

const EMB_CACHE = path.join(OUT, "embedding-cache.json");
let embCache = null;
async function embed(texts) {
  embCache ??= existsSync(EMB_CACHE) ? JSON.parse(readFileSync(EMB_CACHE, "utf8")) : {};
  const missing = [...new Set(texts.filter((t) => !embCache[t]))];
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (missing.length && !key) throw new Error("GEMINI_API_KEY not set (needed for --vector)");
  const base = `${process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta"}/openai`;
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001", input: batch }),
    });
    if (!res.ok) throw new Error(`embedding request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    json.data.forEach((d, j) => { embCache[batch[j]] = d.embedding.slice(0, 768); });
    writeFileSync(EMB_CACHE, JSON.stringify(embCache));
    out(`  embedded ${Math.min(i + 100, missing.length)}/${missing.length}`);
  }
  return texts.map((t) => embCache[t]);
}
const cosine = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / Math.sqrt(na * nb);
};
const cityLabel = (c) => `${c.name}, ${c.state.name}`;

/** Resolve the still-open cases by embedding: town text vs every city in its state (or country). */
async function vectorTier(cat, open) {
  const scopes = new Map();
  for (const r of open) {
    const scope = r.state ? (cat.citiesByCountry.get(r.code) ?? []).filter((c) => String(c.state._id) === String(r.state._id)) : cat.citiesByCountry.get(r.code) ?? [];
    if (!scope.length || scope.length > 5000) continue;
    r.scope = scope;
    for (const c of scope) scopes.set(cityLabel(c), c);
  }
  const usable = open.filter((r) => r.scope);
  if (!usable.length) return;
  const queries = usable.map((r) => `${r.places[0]}${r.state ? `, ${r.state.name}` : ""}`);
  out(`vector tier: ${usable.length} place strings vs ${scopes.size} catalogue cities`);
  const qv = await embed(queries);
  const labels = [...scopes.keys()];
  const cv = new Map((await embed(labels)).map((v, i) => [labels[i], v]));
  usable.forEach((r, i) => {
    const ranked = r.scope.map((c) => ({ city: c, score: cosine(qv[i], cv.get(cityLabel(c))) })).sort((a, b) => b.score - a.score);
    const [top, next] = ranked;
    r.vectorTop = ranked.slice(0, 3).map((x) => `${x.city.name} ${x.score.toFixed(3)}`).join(" | ");
    if (top && top.score >= VECTOR_MIN && top.score - (next?.score ?? 0) >= VECTOR_MARGIN) {
      r.result = { city: top.city, method: "vector", score: Number(top.score.toFixed(3)) };
    }
  });
}

// ---------------------------------------------------------------- resolve one location string

function resolveText(cat, text, phoneCC, natCC, unreliable) {
  const parsed = parseLocation(text);
  if (!parsed || !parsed.places.length) return { status: "empty" };
  let code = cat.codeByName.get(parsed.country) ?? null;
  let stateText = parsed.state;
  // "Tirur, Kerala": the second part was a state, not a country.
  if (!code && parsed.country && !parsed.state) {
    for (const cc of [phoneCC, natCC, "IN", "AE", "SA", "BH", "KW", "QA", "OM"].filter(Boolean)) {
      if (findState(cat, cc, parsed.country)) { code = cc; stateText = parsed.country; break; }
    }
  }
  let corrected = false;
  if (code && unreliable.has(code)) {
    const fix = phoneCC && phoneCC !== code ? phoneCC : natCC && natCC !== code ? natCC : null;
    if (!fix) {
      // No phone/nationality: the town alone, in the markets the site serves, must be unmistakable.
      const hits = CORE_MARKETS.map((cc) => ({ cc, hit: matchCity(cat, cc, parsed.places, null) })).filter((h) => h.hit && !h.hit.review);
      if (hits.length === 1) return { status: "matched", ...hits[0].hit, method: `${hits[0].hit.method}+town-only`, code: hits[0].cc, parsed };
      return { status: "review", reason: `legacy country ${code} unreliable; town not found in core markets`, parsed };
    }
    code = fix; stateText = ""; corrected = true;
  }
  if (!code) code = phoneCC ?? natCC ?? null;
  if (!code) return { status: "review", reason: "no country", parsed };
  const state = stateText ? findState(cat, code, stateText) : null;
  const hit = matchCity(cat, code, parsed.places, state);
  if (hit?.review) return { status: "review", reason: `${hit.city.name} is listed in ${hit.city.state.name}, not ${stateText}`, code, parsed };
  if (hit) return { status: "matched", ...hit, method: corrected ? `${hit.method}+phone-country` : hit.method, code, parsed };
  // "Al Qassim(Central Province-Saudi Arabia)": the "town" is itself a region.
  for (const place of parsed.places) {
    const asState = findState(cat, code, place);
    if (asState) return { status: "matched", city: null, region: asState, method: "region", score: 1, code, parsed };
  }
  return { status: "open", code, state, places: parsed.places, corrected, parsed };
}

// ---------------------------------------------------------------- main

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const seekers = db.collection("jobseekers");

if (REVERT) {
  const cur = seekers.find({ "areaBackfill.from": { $exists: true } }).project({ areaBackfill: 1 });
  let n = 0;
  for await (const s of cur) {
    await seekers.updateOne({ _id: s._id }, {
      $set: { currentLocation: s.areaBackfill.from, regionCityId: null, regionStateId: null },
      $unset: { areaBackfill: "" },
    });
    n++;
  }
  out(`reverted ${n} seekers (search vectors keep the clean text until --reembed is run again)`);
  await mongoose.disconnect();
  process.exit(0);
}

if (REEMBED) {
  const { buildProfileText, generateEmbeddingBatch } = await import("../src/lib/ai/embeddings.ts");
  const { saveSearchVectors, searchVectorStore } = await import("../src/lib/ai/searchVectors.ts");
  out(`re-embedding into store: ${searchVectorStore()}`);
  const todo = await seekers.find({ "areaBackfill.reembedPending": true }).project({ searchEmbedding: 0, matchEmbedding: 0 }).toArray();
  let done = 0, failed = 0;
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    try {
      const embeddings = await generateEmbeddingBatch(batch.map((s) => buildProfileText(s)));
      await saveSearchVectors(batch.map((s, j) => ({ id: s._id, embedding: embeddings[j] })));
      await seekers.updateMany({ _id: { $in: batch.map((s) => s._id) } }, { $unset: { "areaBackfill.reembedPending": "" } });
      done += batch.length;
    } catch (err) {
      failed += batch.length;
      out(`  batch ${i} failed: ${err instanceof Error ? err.message : err}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (i % 200 === 0) out(`  ${done}/${todo.length}`);
  }
  out(`re-embedded ${done}, failed ${failed} (re-run to retry the failed ones)`);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

mkdirSync(OUT, { recursive: true });
const cat = await loadCatalogue(db);

const rows = await seekers.aggregate([
  { $match: { roleArchivedAt: null, regionCityId: null, regionStateId: null, currentLocation: { $nin: [null, ""] } } },
  { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u", pipeline: [{ $project: { phone: 1 } }] } },
  { $project: { currentLocation: 1, nationality: 1, phone: { $first: "$u.phone" } } },
]).toArray();
out(`seekers without an area but with a location: ${rows.length}`);

// Which countries did the legacy importer get wrong? Judge by phone agreement.
const agree = new Map();
for (const r of rows) {
  r.phoneCC = phoneCountry(cat, r.phone);
  r.natCC = DEMONYMS.get(norm(r.nationality)) ?? cat.codeByName.get(norm(r.nationality)) ?? null;
  const p = parseLocation(r.currentLocation);
  const code = p && cat.codeByName.get(p.country);
  if (!code || !r.phoneCC) continue;
  const a = agree.get(code) ?? { n: 0, same: 0 };
  a.n++; if (a.n && r.phoneCC === code) a.same++;
  agree.set(code, a);
}
const unreliable = new Set([...agree].filter(([, a]) => a.n >= RELIABLE_MIN_SAMPLE && a.same / a.n < RELIABLE_SHARE).map(([c]) => c));
out(`unreliable legacy countries (phone agreement < ${RELIABLE_SHARE * 100}%): ${[...unreliable].join(", ") || "none"}`);

// Resolve each distinct (text, phone country, nationality) once.
const groups = new Map();
for (const r of rows) {
  const k = `${norm(r.currentLocation)}|${r.phoneCC ?? ""}|${r.natCC ?? ""}`;
  (groups.get(k) ?? groups.set(k, { text: r.currentLocation, phoneCC: r.phoneCC, natCC: r.natCC, ids: [] }).get(k)).ids.push(r._id);
}
const results = [...groups.values()].map((g) => ({ ...g, ...resolveText(cat, g.text, g.phoneCC, g.natCC, unreliable) }));
for (const r of results) if (r.status === "matched") r.result = { city: r.city, region: r.region ?? null, method: r.method, score: r.score };

const open = results.filter((r) => r.status === "open");
if (VECTOR && open.length) await vectorTier(cat, open);
for (const r of open) {
  if (r.result) r.status = "matched";
  else if (r.state && !r.corrected) { r.status = "matched"; r.result = { city: null, region: r.state, method: "region", score: 1 }; }
  else r.status = "review";
}

// ---------------------------------------------------------------- report + apply
const tally = {};
const lines = [["seekers", "location", "phone", "nationality", "status", "method", "score", "city", "region", "country", "note"]];
const now = new Date();
let written = 0;
for (const r of results.sort((a, b) => b.ids.length - a.ids.length)) {
  const method = r.result?.method ?? r.status;
  tally[method] = (tally[method] ?? 0) + r.ids.length;
  const city = r.result?.city ?? null;
  const region = city ? city.state : r.result?.region ?? null;
  lines.push([r.ids.length, r.text, r.phoneCC ?? "", r.natCC ?? "", r.status, method, r.result?.score ?? "", city?.name ?? "", region?.name ?? "", region?.code ?? r.code ?? "", r.reason ?? r.vectorTop ?? ""]);
  if (!APPLY || !region) continue;
  const countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(region.code) ?? "";
  const place = city?.name ?? region.name;
  {
    const res = await seekers.updateMany(
      { _id: { $in: r.ids }, regionCityId: null, regionStateId: null },
      { $set: {
        regionCityId: city?._id ?? null,
        regionStateId: region._id,
        currentLocation: countryName ? `${place}, ${countryName}` : place,
        areaBackfill: { from: r.text, method, score: r.result.score, at: now, reembedPending: true },
      } },
    );
    written += res.modifiedCount;
  }
}
// One report row per location + outcome (groups were split by phone/nationality only to resolve them).
const merged = new Map();
for (const l of lines.slice(1)) {
  const k = [l[1], l[5], l[7], l[8], l[9]].join("|");
  const m = merged.get(k);
  if (m) m[0] += l[0]; else merged.set(k, [...l]);
}
lines.splice(1, lines.length, ...[...merged.values()].sort((a, b) => b[0] - a[0]));
const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
writeFileSync(path.join(OUT, "report.csv"), csv);
out("\nseekers by outcome:");
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) out(`  ${k.padEnd(28)} ${v}`);
out(`\nreport: ${path.resolve(OUT, "report.csv")}`);
out(APPLY ? `written: ${written} seekers. Next: --reembed to rebuild their search vectors.` : "dry run — nothing written. Add --apply to write.");
await mongoose.disconnect();
