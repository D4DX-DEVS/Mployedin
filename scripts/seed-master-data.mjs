/**
 * Seed / top-up every global master-data collection.
 *
 *   node scripts/seed-master-data.mjs                 # everything (incl. ~150k cities)
 *   node scripts/seed-master-data.mjs --skip-cities   # everything except cities
 *   node scripts/seed-master-data.mjs --only=countries,currencies,job-roles
 *   node scripts/seed-master-data.mjs --countries=ALL # cities for every country (~150k docs, ~35 MB with indexes)
 *   node scripts/seed-master-data.mjs --countries=AE,SA,EG   # cities for these countries only
 *   node scripts/seed-master-data.mjs --dry-run       # report, write nothing
 *
 * Cities are the only large table. By default they are seeded for
 * CITY_COUNTRIES (Gulf, MENA, South Asia and the main destinations — the set
 * the platform actually serves) because the dev Atlas cluster is a 512 MB
 * free tier shared with other databases: a full-world load pushed it over the
 * quota once and blocked every write on the cluster. If Atlas rejects an
 * insert for space, this run's own inserts are rolled back automatically.
 *
 * Sections: countries, states, cities, currencies, languages, attributes,
 *           nationalities, job-roles, skills, faqs
 *
 * Idempotent and conservative:
 *   - Records are matched by natural key (country code / currency code /
 *     language code / slug, falling back to a case-insensitive name match).
 *   - Existing records are never renamed, deactivated or re-ordered. Only an
 *     EMPTY nameAr (or other empty enrichment field) is filled in.
 *   - New records are inserted with isActive:true.
 *
 * Requires MONGODB_URI (from .env / .env.local or the shell).
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Country as CSCCountry, State as CSCState, City as CSCCity } from "country-state-city";

import * as ATTR from "./seed-data/attributes.mjs";
import * as EXTRA from "./seed-data/extras.mjs";
import { CURRENCY_MAP, COUNTRY_AR } from "./seed-data/legacy-maps.mjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  Missing MONGODB_URI environment variable");
  process.exit(1);
}

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const SKIP_CITIES = argv.includes("--skip-cities");
const onlyArg = argv.find((a) => a.startsWith("--only="));
const countriesArg = argv.find((a) => a.startsWith("--countries="));
/** Countries whose cities are seeded by default (see header). */
const CITY_COUNTRIES = [
  // Gulf
  "AE", "SA", "QA", "KW", "BH", "OM",
  // Wider MENA
  "EG", "JO", "LB", "IQ", "YE", "SY", "PS", "TR", "MA", "TN", "DZ", "LY", "SD",
  // South & South-East Asia
  "IN", "PK", "BD", "LK", "NP", "PH", "MY", "SG", "ID",
  // Main destinations
  "GB", "US", "CA", "AU", "NZ", "IE", "DE", "FR", "NL", "ZA",
];
const CITY_COUNTRY_SET = countriesArg
  ? countriesArg.slice(12).trim().toUpperCase() === "ALL"
    ? null
    : new Set(countriesArg.slice(12).split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))
  : new Set(CITY_COUNTRIES);
const isQuotaError = (e) => /space quota|over your space|quota/i.test(String(e?.message ?? e));
const ONLY = onlyArg ? new Set(onlyArg.slice(7).split(",").map((s) => s.trim()).filter(Boolean)) : null;
const wants = (section) => (!ONLY || ONLY.has(section)) && !(section === "cities" && SKIP_CITIES);

// ── helpers ────────────────────────────────────────────────────────────────

/** Same as src/lib/slug.ts plus symbol handling so "C++" / "C#" / ".NET" stay distinct. */
export function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\+\+/g, "-plus-plus")
    .replace(/\+/g, "-plus")
    .replace(/#/g, "-sharp")
    .replace(/\./g, "-")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const norm = (s) => String(s ?? "").trim().toLowerCase();
const now = () => new Date();

const arRegion = new Intl.DisplayNames(["ar"], { type: "region", fallback: "none" });
const enCurrency = new Intl.DisplayNames(["en"], { type: "currency", fallback: "none" });
const arCurrency = new Intl.DisplayNames(["ar"], { type: "currency", fallback: "none" });
const enLanguage = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
const arLanguage = new Intl.DisplayNames(["ar"], { type: "language", fallback: "none" });

function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(1);
    const sym = parts.find((p) => p.type === "currency")?.value ?? "";
    if (sym && sym !== code) return sym;
  } catch {}
  return CURRENCY_MAP[code]?.s ?? code;
}
function currencyDigits(code) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

const summary = [];
function report(section, inserted, filled, unchanged) {
  summary.push({ section, inserted, filled, unchanged });
  console.log(`  ${section.padEnd(14)} +${inserted} inserted, ${filled} enriched, ${unchanged} unchanged`);
}

/**
 * Generic upsert of a simple attribute list into `collection`.
 * items: [{ name, nameAr, ...extra }] — extra fields are only set on insert or when empty.
 */
async function upsertAttributes(db, collection, items, { keyField = null } = {}) {
  const col = db.collection(collection);
  const existing = await col.find({}, { projection: { name: 1, nameAr: 1, slug: 1, sortOrder: 1, ...(keyField ? { [keyField]: 1 } : {}) } }).toArray();
  const byName = new Map(existing.map((d) => [norm(d.name), d]));
  const bySlug = new Map(existing.map((d) => [d.slug, d]));
  const byKey = keyField ? new Map(existing.map((d) => [norm(d[keyField]), d])) : null;
  const usedSlugs = new Set(existing.map((d) => d.slug));
  let maxSort = existing.reduce((m, d) => Math.max(m, d.sortOrder ?? 0), -1);

  const ops = [];
  let inserted = 0, filled = 0, unchanged = 0;
  for (const item of items) {
    const found = (byKey && byKey.get(norm(item[keyField]))) || byName.get(norm(item.name));
    if (found) {
      const $set = {};
      if (!found.nameAr && item.nameAr) $set.nameAr = item.nameAr;
      for (const [k, v] of Object.entries(item)) {
        if (["name", "nameAr", "slug", "sortOrder", "isActive"].includes(k)) continue;
        if ((found[k] === undefined || found[k] === "" || (Array.isArray(found[k]) && found[k].length === 0)) && v !== undefined && v !== "") $set[k] = v;
      }
      if (Object.keys($set).length) {
        $set.updatedAt = now();
        ops.push({ updateOne: { filter: { _id: found._id }, update: { $set } } });
        filled++;
      } else unchanged++;
      continue;
    }
    let slug = item.slug || slugify(item.name) || slugify(item[keyField] ?? "") || `item-${inserted}`;
    if (bySlug.has(slug) || usedSlugs.has(slug)) {
      let n = 2;
      while (usedSlugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    usedSlugs.add(slug);
    const { name, nameAr = "", ...extra } = item;
    delete extra.slug;
    const doc = { name, nameAr, slug, sortOrder: item.sortOrder ?? ++maxSort, isActive: true, ...extra, createdAt: now(), updatedAt: now() };
    delete doc.sortOrder; doc.sortOrder = item.sortOrder ?? maxSort; // keep key order tidy
    ops.push({ insertOne: { document: doc } });
    inserted++;
  }
  if (!DRY_RUN && ops.length) {
    for (let i = 0; i < ops.length; i += 1000) await col.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }
  report(collection, inserted, filled, unchanged);
}

const pairs = (list, extra = {}) => list.map(([name, nameAr]) => ({ name, nameAr: nameAr || "", ...extra }));

// ── sections ───────────────────────────────────────────────────────────────

async function seedCountries(db) {
  const col = db.collection("countries");
  const existing = await col.find({}, { projection: { code: 1, nameAr: 1, phoneCode: 1, currency: 1, currencyCode: 1, currencySymbol: 1, sortOrder: 1 } }).toArray();
  const byCode = new Map(existing.map((d) => [d.code, d]));
  let maxSort = existing.reduce((m, d) => Math.max(m, d.sortOrder ?? 0), -1);
  // Gulf + India first for the long tail of new inserts; everything else alphabetical.
  const PRIORITY = ["AE", "SA", "QA", "KW", "BH", "OM", "IN", "PK", "BD", "LK", "NP", "PH", "EG", "JO", "LB"];
  const all = CSCCountry.getAllCountries()
    .filter((c) => /^[A-Z]{2}$/.test(c.isoCode))
    .sort((a, b) => {
      const pa = PRIORITY.indexOf(a.isoCode), pb = PRIORITY.indexOf(b.isoCode);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      return a.name.localeCompare(b.name);
    });

  const ops = [];
  let inserted = 0, filled = 0, unchanged = 0;
  for (const c of all) {
    const code = c.isoCode;
    const currencyCode = (c.currency || "").split(",")[0].trim().toUpperCase();
    const doc = {
      name: c.name,
      nameAr: COUNTRY_AR[code] || arRegion.of(code) || "",
      code,
      phoneCode: (c.phonecode || "").replace(/^\+/, "").split(/[^\d]/)[0] || (c.phonecode || "").replace(/[^\d]/g, ""),
      currency: currencyCode ? (enCurrency.of(currencyCode) || CURRENCY_MAP[currencyCode]?.n || "") : "",
      currencyCode,
      currencySymbol: currencyCode ? currencySymbol(currencyCode) : "",
      thousandSeparator: ",",
      decimalSeparator: ".",
      isActive: true,
    };
    const found = byCode.get(code);
    if (found) {
      const $set = {};
      for (const k of ["nameAr", "phoneCode", "currency", "currencyCode", "currencySymbol"]) {
        if (!found[k] && doc[k]) $set[k] = doc[k];
      }
      if (Object.keys($set).length) { $set.updatedAt = now(); ops.push({ updateOne: { filter: { _id: found._id }, update: { $set } } }); filled++; }
      else unchanged++;
    } else {
      ops.push({ insertOne: { document: { ...doc, sortOrder: ++maxSort, createdAt: now(), updatedAt: now() } } });
      inserted++;
    }
  }
  if (!DRY_RUN && ops.length) await col.bulkWrite(ops, { ordered: false });
  report("countries", inserted, filled, unchanged);
}

async function seedStates(db) {
  const countries = await db.collection("countries").find({}, { projection: { code: 1 } }).toArray();
  const countryId = new Map(countries.map((c) => [c.code, c._id]));
  const col = db.collection("states");
  const existing = await col.find({}, { projection: { name: 1, slug: 1, countryId: 1 } }).toArray();
  const byKey = new Map(existing.map((s) => [`${String(s.countryId)}::${norm(s.name)}`, s]));
  const usedSlugs = new Set(existing.map((s) => s.slug));

  const docs = [];
  let unchanged = 0, skipped = 0;
  const all = CSCState.getAllStates();
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    const cid = countryId.get(s.countryCode);
    if (!cid) { skipped++; continue; }
    if (byKey.has(`${String(cid)}::${norm(s.name)}`)) { unchanged++; continue; }
    const base = slugify(s.name) || `state-${s.isoCode}-${s.countryCode}`.toLowerCase();
    let slug = base;
    if (usedSlugs.has(slug)) slug = `${base}-${s.countryCode.toLowerCase()}`;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${s.countryCode.toLowerCase()}-${n++}`;
    usedSlugs.add(slug);
    docs.push({ name: s.name, nameAr: "", countryId: cid, slug, sortOrder: i, isActive: true, createdAt: now(), updatedAt: now() });
  }
  if (!DRY_RUN && docs.length) {
    for (let i = 0; i < docs.length; i += 2000) {
      try { await col.insertMany(docs.slice(i, i + 2000), { ordered: false }); } catch (e) { if (e.code !== 11000) throw e; }
    }
  }
  report("states", docs.length, 0, unchanged);
  if (skipped) console.log(`    (${skipped} states skipped: country missing)`);
}

async function seedCities(db) {
  const countries = await db.collection("countries").find({}, { projection: { code: 1 } }).toArray();
  const countryId = new Map(countries.map((c) => [c.code, String(c._id)]));
  const states = await db.collection("states").find({}, { projection: { name: 1, countryId: 1 } }).toArray();
  const stateByKey = new Map(states.map((s) => [`${String(s.countryId)}::${norm(s.name)}`, s._id]));
  // CSC identifies states by isoCode; map that to our state _id via the country + name.
  const cscStateName = new Map(CSCState.getAllStates().map((s) => [`${s.countryCode}::${s.isoCode}`, s.name]));

  const col = db.collection("cities");
  console.log("  loading existing cities…");
  const existing = await col.find({}, { projection: { name: 1, slug: 1, stateId: 1 } }).toArray();
  const existingKeys = new Set(existing.map((c) => `${String(c.stateId)}::${norm(c.name)}`));
  const usedSlugs = new Set(existing.map((c) => c.slug));

  const all = CSCCity.getAllCities().filter((c) => !CITY_COUNTRY_SET || CITY_COUNTRY_SET.has(c.countryCode));
  console.log(`  ${CITY_COUNTRY_SET ? `${CITY_COUNTRY_SET.size} countries` : "all countries"} · ${all.length} candidate cities`);
  const runMarker = new Date();
  let batch = [], inserted = 0, unchanged = 0, skipped = 0;
  const rollback = async (reason) => {
    console.error(`\n❌  ${reason}`);
    const res = await col.deleteMany({ createdAt: { $gte: runMarker } });
    console.error(`↩  Rolled back ${res.deletedCount} cities inserted by this run. Free space on the cluster or pass --countries=<fewer codes>.`);
    process.exit(2);
  };
  const flush = async () => {
    if (!DRY_RUN && batch.length) {
      try {
        await col.insertMany(batch, { ordered: false });
      } catch (e) {
        if (isQuotaError(e) || e.writeErrors?.some?.((w) => isQuotaError(w))) await rollback(`Atlas refused the write: ${e.message}`);
        if (e.code !== 11000) throw e;
      }
    }
    inserted += batch.length; batch = [];
    process.stdout.write(`\r  cities: ${inserted} inserted…`);
  };
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    const cid = countryId.get(c.countryCode);
    const stName = cscStateName.get(`${c.countryCode}::${c.stateCode}`);
    const stateId = cid && stName ? stateByKey.get(`${cid}::${norm(stName)}`) : null;
    if (!stateId) { skipped++; continue; }
    const key = `${String(stateId)}::${norm(c.name)}`;
    if (existingKeys.has(key)) { unchanged++; continue; }
    existingKeys.add(key);
    const base = slugify(c.name) || `city-${i}`;
    const suffix = `${c.stateCode}-${c.countryCode}`.toLowerCase();
    let slug = base;
    if (usedSlugs.has(slug)) slug = `${base}-${suffix}`;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${suffix}-${n++}`;
    usedSlugs.add(slug);
    batch.push({ name: c.name, nameAr: "", stateId, slug, sortOrder: i, isActive: true, createdAt: new Date(), updatedAt: new Date() });
    if (batch.length >= 2000) await flush();
  }
  await flush();
  process.stdout.write("\r");
  report("cities", inserted, 0, unchanged);
  if (skipped) console.log(`    (${skipped} cities skipped: state missing)`);
}

async function seedCurrencies(db) {
  const codes = new Set();
  for (const c of CSCCountry.getAllCountries()) {
    for (const code of (c.currency || "").split(",")) {
      const k = code.trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(k) && enCurrency.of(k)) codes.add(k);
    }
  }
  const PRIORITY = ["AED", "SAR", "QAR", "KWD", "BHD", "OMR", "INR", "USD", "EUR", "GBP", "PKR", "BDT", "LKR", "NPR", "PHP", "EGP", "JOD"];
  const list = [...codes].sort((a, b) => {
    const pa = PRIORITY.indexOf(a), pb = PRIORITY.indexOf(b);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return a.localeCompare(b);
  });
  const items = list.map((code, i) => ({
    name: enCurrency.of(code) || CURRENCY_MAP[code]?.n || code,
    nameAr: arCurrency.of(code) || "",
    slug: code.toLowerCase(),
    code,
    symbol: currencySymbol(code),
    decimalDigits: currencyDigits(code),
    sortOrder: i,
  }));
  await upsertAttributes(db, "currencies", items, { keyField: "code" });
}

async function seedLanguages(db) {
  const items = EXTRA.LANGUAGE_CODES.map((code, i) => {
    let nativeName = "";
    try { nativeName = new Intl.DisplayNames([code], { type: "language", fallback: "none" }).of(code) || ""; } catch {}
    return { name: enLanguage.of(code) || code, nameAr: arLanguage.of(code) || "", code, nativeName, sortOrder: i };
  });
  await upsertAttributes(db, "languages", items, { keyField: "code" });
}

async function seedAttributes(db) {
  const map = [
    ["salaryperiods", ATTR.SALARY_PERIODS], ["ownershiptypes", ATTR.OWNERSHIP_TYPES], ["maritalstatuses", ATTR.MARITAL_STATUSES],
    ["resulttypes", ATTR.RESULT_TYPES], ["majorsubjects", ATTR.MAJOR_SUBJECTS], ["degreetypes", ATTR.DEGREE_TYPES],
    ["degreelevels", ATTR.DEGREE_LEVELS], ["jobshifts", ATTR.JOB_SHIFTS], ["jobtypes", ATTR.JOB_TYPES],
    ["jobexperiences", ATTR.JOB_EXPERIENCE], ["industries", ATTR.INDUSTRIES], ["genders", ATTR.GENDERS],
    ["functionalareas", ATTR.FUNCTIONAL_AREAS], ["careerlevels", ATTR.CAREER_LEVELS], ["languagelevels", ATTR.LANGUAGE_LEVELS],
    ["benefits", EXTRA.BENEFITS], ["visastatuses", EXTRA.VISA_STATUSES], ["noticeperiods", EXTRA.NOTICE_PERIODS],
    ["companysizes", EXTRA.COMPANY_SIZES],
  ];
  for (const [collection, list] of map) await upsertAttributes(db, collection, pairs(list));
}

async function seedNationalities(db) {
  const items = Object.entries(EXTRA.NATIONALITIES).map(([code, [name, nameAr]], i) => ({ name, nameAr, countryCode: code, sortOrder: i }));
  await upsertAttributes(db, "nationalities", items);
}

async function seedJobRoles(db) {
  const { default: groups } = await import("./seed-data/job-roles.mjs");
  const areas = await db.collection("functionalareas").find({}, { projection: { name: 1 } }).toArray();
  const areaByName = new Map(areas.map((a) => [norm(a.name), a]));
  const items = [];
  let missingAreas = new Set();
  for (const g of groups) {
    const area = areaByName.get(norm(g.area));
    if (!area) missingAreas.add(g.area);
    for (const [name, nameAr, aliases] of g.roles) {
      items.push({ name, nameAr: nameAr || "", functionalAreaId: area?._id, functionalArea: area?.name ?? g.area, aliases: aliases ?? [] });
    }
  }
  if (missingAreas.size) console.log(`    ⚠ functional areas not found: ${[...missingAreas].join(", ")}`);
  await upsertAttributes(db, "jobroles", items);
}

async function seedSkills(db) {
  const { default: groups } = await import("./seed-data/skills.mjs");
  const items = groups.flatMap((g) => g.skills.map(([name, nameAr]) => ({ name, nameAr: nameAr || "" })));
  await upsertAttributes(db, "jobskills", items);
}

async function seedFaqs(db) {
  const { default: faqs } = await import("./seed-data/faqs.mjs");
  const col = db.collection("faqs");
  const existing = await col.find({}, { projection: { question: 1, questionAr: 1, answerAr: 1, sortOrder: 1 } }).toArray();
  const byQ = new Map(existing.map((f) => [norm(f.question), f]));
  let maxSort = existing.reduce((m, d) => Math.max(m, d.sortOrder ?? 0), -1);
  const ops = [];
  let inserted = 0, filled = 0, unchanged = 0;
  for (const f of faqs) {
    const found = byQ.get(norm(f.question));
    if (found) {
      const $set = {};
      if (!found.questionAr && f.questionAr) $set.questionAr = f.questionAr;
      if (!found.answerAr && f.answerAr) $set.answerAr = f.answerAr;
      if (Object.keys($set).length) { $set.updatedAt = now(); ops.push({ updateOne: { filter: { _id: found._id }, update: { $set } } }); filled++; }
      else unchanged++;
      continue;
    }
    ops.push({ insertOne: { document: { question: f.question, questionAr: f.questionAr ?? "", answer: f.answer, answerAr: f.answerAr ?? "", category: f.category ?? "general", sortOrder: ++maxSort, isActive: true, createdAt: now(), updatedAt: now() } } });
    inserted++;
  }
  if (!DRY_RUN && ops.length) await col.bulkWrite(ops, { ordered: false });
  report("faqs", inserted, filled, unchanged);
}

// ── main ───────────────────────────────────────────────────────────────────

const SECTIONS = [
  ["countries", seedCountries],
  ["states", seedStates],
  ["cities", seedCities],
  ["currencies", seedCurrencies],
  ["languages", seedLanguages],
  ["attributes", seedAttributes],
  ["nationalities", seedNationalities],
  ["job-roles", seedJobRoles],
  ["skills", seedSkills],
  ["faqs", seedFaqs],
];

async function main() {
  console.log(`🌍  Seeding master data${DRY_RUN ? " (DRY RUN)" : ""}…`);
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`✅  Connected to ${db.databaseName}\n`);
  for (const [name, fn] of SECTIONS) {
    if (!wants(name)) continue;
    console.log(`▶ ${name}`);
    await fn(db);
  }
  console.log("\n🎉  Done.");
  await mongoose.disconnect();
}

main().catch((err) => {
  if (isQuotaError(err)) {
    console.error("❌  Atlas storage quota exceeded — writes are blocked cluster-wide until space is freed.");
    console.error("    Free space (or upgrade the tier) and re-run; cities can be limited with --countries=AE,SA,…");
  } else {
    console.error("❌  Seed failed:", err);
  }
  process.exit(1);
});
