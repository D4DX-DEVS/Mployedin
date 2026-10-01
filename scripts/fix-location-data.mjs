/**
 * Clean up the location master data (Country → State → City) for the
 * countries the platform recruits in and from.
 *
 * Why this exists: the catalogue came from a bulk world dataset and was never
 * curated. In Saudi Arabia, Al Bahah held 144 copies of Makkah villages
 * (Jeddah and Taif among them), so a typed "Jeddah" matched two cities and the
 * employer got no region at all. UAE had no plain "Abu Dhabi" or "Al Ain";
 * Oman and Bahrain carried abolished governorates; every UK town sat under
 * England / Scotland / Wales with Northern Ireland's filed under North
 * Yorkshire; Palestine had no states. Diacritics ("Al Qaţīf") broke the city
 * search, because a typed "Qatif" never matches "Qaţīf".
 *
 * The structure stays Country → State → City. What the script does:
 *   1. Every name in the target countries is folded to plain letters and
 *      cleaned of dataset junk (", Makkah" suffixes, " District" in the
 *      countries whose dataset adds it, stray marks). Two cities that end up
 *      with the same name in one state are merged.
 *   2. The curated fixes in location-data-fixes.mjs run in order: misplaced
 *      cities move to their real state, copies merge into the original,
 *      stale states fold into their successor, missing cities are added.
 *   3. A merge never breaks a link. Every employer / job seeker region, agent
 *      and super-agent territory (and the legacy territory lists) that
 *      pointed at the removed city or state is re-pointed at the one that
 *      stays, and an employer's regionStateId follows its city. With --apply
 *      the links are re-read from the database at the moment they are moved,
 *      so an edit made while the script runs is not overwritten.
 *   4. A city or state that something still points at is never deleted
 *      without a merge target — it is reported and left alone.
 *
 * Safety:
 *   - --apply first runs the whole cleanup in memory; nothing is written if
 *     that run fails.
 *   - Every insert, delete and change is appended to an undo journal
 *     (backups/location-data-<timestamp>.jsonl) BEFORE it is written, so even
 *     an interrupted run can be undone with --restore.
 *   - After writing, every deleted id is looked up in the live link fields;
 *     any hit is reported and the script exits non-zero.
 *   - Re-running is safe: a second --apply finds nothing left to change.
 *
 * After --apply, restart the app: the matching code caches state names per
 * process (src/lib/matching/locality.server.ts).
 *
 * Usage:
 *   node scripts/fix-location-data.mjs                     # report only (default)
 *   node scripts/fix-location-data.mjs --apply             # perform the cleanup
 *   node scripts/fix-location-data.mjs --restore <file>    # undo an --apply
 *   ... --db <name>        run against another database on the same cluster
 *   ... --report <file>    write the full change list there (default: OS temp dir)
 *   ... --force            let --restore write to a database other than the journal's
 */

import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { TARGET_COUNTRIES, FIXES } from "./location-data-fixes.mjs";

// The driver's own BSON, so ids read back from a journal are the driver's type.
const { EJSON, ObjectId } = mongoose.mongo.BSON;
const clone = (value) => EJSON.parse(EJSON.stringify(value, { relaxed: false }), { relaxed: false });

const MIGRATION = "location-data-cleanup-2026-10-01";

/** Countries whose dataset tacks " District" onto town names. */
const DISTRICT_NOISE = new Set(["IN", "IQ", "SY", "YE"]);

/** Every stored reference to a city id. `stateField` follows the city. */
const CITY_REFS = [
  { coll: "employers", field: "regionCityId", stateField: "regionStateId" },
  { coll: "jobseekers", field: "regionCityId", stateField: "regionStateId" },
  { coll: "agents", field: "assignedCityIds", array: true },
  { coll: "superagents", field: "assignedCityIds", array: true },
  { coll: "territories", field: "cityIds", array: true },
];

/** Every stored reference to a state id. */
const STATE_REFS = [
  { coll: "employers", field: "regionStateId" },
  { coll: "jobseekers", field: "regionStateId" },
  { coll: "agents", field: "assignedStateIds", array: true },
  { coll: "superagents", field: "assignedStateIds", array: true },
  { coll: "territories", field: "stateIds", array: true },
];

const REF_COLLECTIONS = [...new Set([...CITY_REFS, ...STATE_REFS].map((r) => r.coll))];

// ─── Names ──────────────────────────────────────────────────────────────────

const SPECIAL_LETTERS = { ı: "i", ł: "l", Ł: "L", ø: "o", Ø: "O", đ: "d", Đ: "D", ß: "ss", æ: "ae", Æ: "AE", œ: "oe" };

/**
 * Plain-letter spelling: "Al Qaţīf" → "Al Qatif", "Abū ‘Arīsh" → "Abu Arish",
 * "Al Jahrā’" → "Al Jahra". An apostrophe survives only between two letters
 * ("Ha'il"); ayn/hamza marks and stray Arabic characters go.
 */
export function plainName(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ıłŁøØđĐßæÆœ]/g, (c) => SPECIAL_LETTERS[c])
    .replace(/[‘`ʻʿ]/g, "")
    .replace(/[’ʼʾ´]/g, "'")
    .replace(/[؀-ۿݐ-ݿ]+/g, "")
    .replace(/\s*\(\s*\)/g, "")
    .replace(/(^|[^A-Za-z])'+|'+(?=[^A-Za-z]|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comparison key: "Al-Mubarraz", "Al Mubarraz" and "AL MUBARRAZ" are one city.
 * A name with no Latin letters at all keys on itself, so two Arabic-only
 * names are never mistaken for one.
 */
export function nameKey(name) {
  const key = plainName(name)
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return key || String(name).trim().toLowerCase();
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s(-])([a-z])/g, (_, p, c) => p + c.toUpperCase());

/**
 * The dataset's junk, cleaned: " (India)" / ", Makkah" / ", Saudi Arabia"
 * parts that only repeat a state or the country, " District" suffixes (only
 * where the dataset adds them — "Dubai Design District" and England's "Lake
 * District" are real names), "X,Y" disambiguations turned into "X (Y)",
 * shouting and all-lowercase.
 */
export function cleanCityName(name, { stateName, countryName, stateKeys, stripDistrict = false }) {
  const regionKeys = new Set([nameKey(countryName), nameKey(stateName), ...stateKeys, "india", "saudi arabia", "uae"]);
  let n = plainName(name).replace(/^[\s,.-]+|[\s,]+$/g, "");

  n = n.replace(/\s*\(([^)]*)\)/g, (m, inner) => (regionKeys.has(nameKey(inner)) ? "" : m));
  if (n.includes(",")) {
    const parts = n.split(/\s*,\s*/).filter(Boolean);
    while (parts.length > 1 && regionKeys.has(nameKey(parts.at(-1)))) parts.pop();
    n = parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(", ")})` : parts[0];
  }
  if (stripDistrict) {
    const stripped = n.replace(/\s+district\b\.?/gi, "").replace(/-Dist\.?(?=\))/gi, "").trim();
    if (stripped.length >= 2) n = stripped;
    if (/^(east|west|north|south)$/i.test(n)) n = `${n} ${stateName}`;
  }
  n = n.replace(/(\S)\(/g, "$1 (").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\s*\(\s*\)/g, "");
  // All-lowercase, or a shouted multi-word name ("CITY GHRAN"); "NEOM" stays.
  if (/[a-z]/.test(n) && n === n.toLowerCase()) n = titleCase(n);
  else if (n === n.toUpperCase() && /[A-Z]{2,} [A-Z]{2,}/.test(n)) n = titleCase(n);
  return n.replace(/\s+/g, " ").trim();
}

const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// ─── The working copy ───────────────────────────────────────────────────────

class LocationFixer {
  constructor(db, { apply }) {
    this.db = db;
    this.apply = apply;
    this.journalFd = null;
    this.journalFile = null;
    this.journalSize = 0;
    this.lines = [];
    this.warnings = [];
    this.counts = {};
    this.skipped = [];
    this.deleted = { cities: new Map(), states: new Map() };
  }

  note(kind, text) {
    this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    this.lines.push(`${kind.padEnd(13)} ${text}`);
  }

  warn(text) {
    this.warnings.push(text);
    this.lines.push(`WARNING       ${text}`);
  }

  // ── undo journal: one EJSON line per change, written before the change ──

  openJournal(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.journalFile = path.join(dir, `location-data-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
    this.journalFd = fs.openSync(this.journalFile, "a");
    this.writeLine({ migration: MIGRATION, db: this.db.databaseName, at: new Date() });
  }

  writeLine(value) {
    fs.writeSync(this.journalFd, `${EJSON.stringify(value, { relaxed: false })}\n`);
    fs.fsyncSync(this.journalFd);
  }

  record(entry) {
    this.writeLine(entry);
    this.journalSize += 1;
  }

  closeJournal() {
    if (this.journalFd === null) return;
    fs.closeSync(this.journalFd);
    this.journalFd = null;
    if (this.journalSize === 0) {
      fs.rmSync(this.journalFile, { force: true });
      this.journalFile = null;
    }
  }

  async load() {
    const { db } = this;
    this.countries = await db.collection("countries").find({}).toArray();
    this.countryByCode = new Map(this.countries.map((c) => [c.code, c]));
    const targetIds = TARGET_COUNTRIES.map((code) => this.countryByCode.get(code)?._id).filter(Boolean);

    this.states = await db.collection("states").find({ countryId: { $in: targetIds } }).toArray();
    this.cities = await db.collection("cities").find({ stateId: { $in: this.states.map((s) => s._id) } }).toArray();
    this.byState = new Map();
    for (const c of this.cities) this.indexCity(c);
    this.citySlugs = new Set(await db.collection("cities").distinct("slug"));
    this.stateSlugs = new Set(await db.collection("states").distinct("slug"));

    this.refDocs = {};
    for (const coll of REF_COLLECTIONS) {
      const fields = [...CITY_REFS, ...STATE_REFS].filter((r) => r.coll === coll).map((r) => r.field);
      const projection = Object.fromEntries(fields.map((f) => [f, 1]));
      this.refDocs[coll] = await db
        .collection(coll)
        .find({ $or: fields.map((f) => ({ [f]: { $exists: true, $nin: [null, []] } })) }, { projection })
        .toArray();
    }
  }

  // ── lookups ──

  country(code) {
    const c = this.countryByCode.get(code);
    if (!c) throw new Error(`Country ${code} is not in the catalogue`);
    return c;
  }

  codeOf(state) {
    return this.countries.find((c) => sameId(c._id, state.countryId))?.code;
  }

  statesOf(code) {
    const c = this.country(code);
    return this.states.filter((s) => sameId(s.countryId, c._id));
  }

  indexCity(city) {
    const k = String(city.stateId);
    if (!this.byState.has(k)) this.byState.set(k, []);
    this.byState.get(k).push(city);
  }

  unindexCity(city) {
    const list = this.byState.get(String(city.stateId)) ?? [];
    const i = list.indexOf(city);
    if (i >= 0) list.splice(i, 1);
  }

  /** A snapshot: safe to loop over while cities move or merge. */
  citiesOf(state) {
    return [...(this.byState.get(String(state._id)) ?? [])];
  }

  alive(doc) {
    return !this.deleted.cities.has(String(doc._id)) && !this.deleted.states.has(String(doc._id));
  }

  /** null when missing — or when ambiguous, which is reported rather than guessed. */
  findState(code, name) {
    const k = nameKey(name);
    const hits = this.statesOf(code).filter((s) => nameKey(s.name) === k);
    if (hits.length > 1) {
      this.warn(`${code}: state "${name}" matches ${hits.length} states — left alone`);
      return null;
    }
    return hits[0] ?? null;
  }

  findCity(state, name) {
    if (!state) return null;
    const k = nameKey(name);
    return this.citiesOf(state).find((c) => nameKey(c.name) === k) ?? null;
  }

  stateOf(city) {
    return this.states.find((s) => sameId(s._id, city.stateId));
  }

  label(city) {
    return `${this.stateOf(city)?.name ?? "?"} / ${city.name}`;
  }

  refCount(id, defs) {
    let n = 0;
    for (const def of defs) {
      for (const doc of this.refDocs[def.coll]) {
        const v = doc[def.field];
        if (def.array ? (v ?? []).some((x) => sameId(x, id)) : sameId(v, id)) n += 1;
      }
    }
    return n;
  }

  async liveRefCount(id, defs) {
    let n = 0;
    for (const def of defs) n += await this.db.collection(def.coll).countDocuments({ [def.field]: id });
    return n;
  }

  // ── catalogue writes (mirrored in memory; DB only with --apply) ──

  async setFields(coll, doc, changes) {
    // `unset` lists fields the document did not have, so a restore removes them again.
    const before = {};
    const unset = [];
    for (const key of Object.keys(changes)) {
      if (doc[key] === undefined) unset.push(key);
      else before[key] = doc[key];
    }
    const entry = { t: "mod", coll, _id: doc._id, before: clone(before), unset };
    Object.assign(doc, changes);
    if (!this.apply) return;
    this.record(entry);
    const res = await this.db.collection(coll).updateOne({ _id: doc._id }, { $set: changes });
    if (res.matchedCount === 0) this.warn(`${coll} ${doc._id} vanished while the script ran`);
  }

  async insertDoc(coll, doc) {
    if (!this.apply) return;
    this.record({ t: "ins", coll, _id: doc._id });
    await this.db.collection(coll).insertOne(doc);
  }

  async deleteDoc(coll, doc) {
    this.deleted[coll].set(String(doc._id), doc._id);
    if (!this.apply) return;
    this.record({ t: "del", coll, doc: clone(doc) });
    await this.db.collection(coll).deleteOne({ _id: doc._id });
  }

  // ── reference re-pointing ──

  /** The link documents to move: read live with --apply, from the snapshot otherwise. */
  async linkDocs(def, query, memMatch) {
    const mirror = this.refDocs[def.coll];
    if (!this.apply) return mirror.filter(memMatch);
    const fields = [...CITY_REFS, ...STATE_REFS].filter((r) => r.coll === def.coll).map((r) => r.field);
    const live = await this.db.collection(def.coll).find(query, { projection: Object.fromEntries(fields.map((f) => [f, 1])) }).toArray();
    // Keep the in-memory mirror in step with what the database holds now.
    return live.map((doc) => {
      const mem = mirror.find((m) => sameId(m._id, doc._id));
      if (!mem) {
        mirror.push(doc);
        return doc;
      }
      Object.assign(mem, doc);
      return mem;
    });
  }

  async repoint(defs, fromId, toId, { stateId, warnWidened = false } = {}) {
    for (const def of defs) {
      const docs = await this.linkDocs(
        def,
        { [def.field]: fromId },
        (doc) => (def.array ? (doc[def.field] ?? []).some((x) => sameId(x, fromId)) : sameId(doc[def.field], fromId)),
      );
      for (const doc of docs) {
        if (def.array) {
          const prev = doc[def.field] ?? [];
          const seen = new Set();
          const next = prev
            .map((x) => (sameId(x, fromId) ? toId : x))
            .filter((x) => (seen.has(String(x)) ? false : seen.add(String(x))));
          const entry = { t: "mod", coll: def.coll, _id: doc._id, before: clone({ [def.field]: prev }), unset: [] };
          doc[def.field] = next;
          if (this.apply) {
            this.record(entry);
            // Atomic element ops: another edit to the same list is kept.
            await this.db.collection(def.coll).updateOne({ _id: doc._id }, { $addToSet: { [def.field]: toId } });
            await this.db.collection(def.coll).updateOne({ _id: doc._id }, { $pull: { [def.field]: fromId } });
          }
          if (warnWidened && def.coll !== "territories") this.warn(`${def.coll} ${doc._id}: territory moved from a folded state to its successor — check it still covers what it should`);
        } else {
          const changes = { [def.field]: toId };
          if (def.stateField && stateId) changes[def.stateField] = stateId;
          const before = {};
          const unset = [];
          for (const k of Object.keys(changes)) (doc[k] === undefined ? unset.push(k) : (before[k] = doc[k]));
          const entry = { t: "mod", coll: def.coll, _id: doc._id, before: clone(before), unset };
          Object.assign(doc, changes);
          if (this.apply) {
            this.record(entry);
            // Only if it still points where we read it: an edit made meanwhile wins.
            const res = await this.db.collection(def.coll).updateOne({ _id: doc._id, [def.field]: fromId }, { $set: changes });
            if (res.matchedCount === 0) this.warn(`${def.coll} ${doc._id}.${def.field} changed while the script ran — left as it is`);
          }
        }
        this.note("re-point", `${def.coll}.${def.field} ${doc._id}`);
      }
    }
  }

  /** A city's own region refs carry its state; keep them in step after a move. */
  async syncCityState(city) {
    for (const def of CITY_REFS) {
      if (!def.stateField) continue;
      const docs = await this.linkDocs(
        def,
        { [def.field]: city._id, [def.stateField]: { $ne: city.stateId } },
        (doc) => sameId(doc[def.field], city._id) && !sameId(doc[def.stateField], city.stateId),
      );
      for (const doc of docs) {
        const entry = { t: "mod", coll: def.coll, _id: doc._id, before: clone({ [def.stateField]: doc[def.stateField] ?? null }), unset: [] };
        doc[def.stateField] = city.stateId;
        if (this.apply) {
          this.record(entry);
          await this.db.collection(def.coll).updateOne({ _id: doc._id, [def.field]: city._id }, { $set: { [def.stateField]: city.stateId } });
        }
        this.note("re-point", `${def.coll}.${def.stateField} ${doc._id} follows ${city.name}`);
      }
    }
  }

  // ── city operations ──

  /** Merge `dup` into `keep`: links move to `keep`, `dup` is deleted; its Arabic name and active flag carry over. */
  async mergeCity(dup, keep, why = "") {
    if (dup === keep || !this.alive(dup)) return;
    const carry = {};
    if (!keep.nameAr && dup.nameAr) carry.nameAr = dup.nameAr;
    if (keep.isActive === false && dup.isActive !== false) carry.isActive = true;
    if (Object.keys(carry).length) await this.setFields("cities", keep, { ...carry, updatedAt: new Date() });
    await this.repoint(CITY_REFS, dup._id, keep._id, { stateId: keep.stateId });
    this.cities = this.cities.filter((c) => c !== dup);
    this.unindexCity(dup);
    await this.deleteDoc("cities", dup);
    this.note("merge-city", `${this.label(dup)} → ${this.label(keep)}${why ? `  (${why})` : ""}`);
  }

  /**
   * Rename, merging into a same-named twin when one exists. With
   * `keepTwinName` (the automatic cleanup) a twin that is already spelled
   * cleanly keeps its spelling: "Al Bab" stays "Al Bab", not "Al-Bab".
   */
  async renameCity(city, to, why = "", { keepTwinName = false } = {}) {
    let name = to.trim();
    if (!this.alive(city) || city.name === name) return city;
    const twin = this.citiesOf(this.stateOf(city)).find((c) => c !== city && nameKey(c.name) === nameKey(name));
    if (twin) {
      if (keepTwinName && plainName(twin.name) === twin.name && !/,/.test(twin.name)) name = twin.name;
      const keep = this.refCount(city._id, CITY_REFS) > this.refCount(twin._id, CITY_REFS) ? city : twin;
      const drop = keep === city ? twin : city;
      await this.mergeCity(drop, keep, why || `same as ${name}`);
      if (keep.name !== name) await this.renameCity(keep, name, why);
      return keep;
    }
    const from = city.name;
    await this.setFields("cities", city, { name, updatedAt: new Date() });
    this.note("rename-city", `${this.stateOf(city).name} / ${from} → ${name}${why ? `  (${why})` : ""}`);
    return city;
  }

  async moveCity(city, toState, why = "") {
    if (!this.alive(city) || sameId(city.stateId, toState._id)) return city;
    const twin = this.findCity(toState, city.name);
    if (twin) {
      await this.mergeCity(city, twin, why || "already in the right state");
      return twin;
    }
    const fromName = this.stateOf(city).name;
    this.unindexCity(city);
    await this.setFields("cities", city, { stateId: toState._id, updatedAt: new Date() });
    this.indexCity(city);
    await this.syncCityState(city);
    this.note("move-city", `${city.name}: ${fromName} → ${toState.name}${why ? `  (${why})` : ""}`);
    return city;
  }

  async deleteCity(city, why = "") {
    const refs = this.apply ? await this.liveRefCount(city._id, CITY_REFS) : this.refCount(city._id, CITY_REFS);
    if (refs > 0) {
      this.warn(`kept ${this.label(city)}: ${refs} record(s) point at it (${why})`);
      return;
    }
    this.cities = this.cities.filter((c) => c !== city);
    this.unindexCity(city);
    await this.deleteDoc("cities", city);
    this.note("delete-city", `${this.label(city)}${why ? `  (${why})` : ""}`);
  }

  uniqueSlug(set, ...candidates) {
    for (const c of candidates) {
      const s = slugify(c);
      if (s && !set.has(s)) return s;
    }
    const base = slugify(candidates.at(-1));
    for (let i = 2; ; i += 1) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
  }

  async addCity(state, name, nameAr = "") {
    if (this.findCity(state, name)) return;
    const country = this.countries.find((c) => sameId(c._id, state.countryId));
    const slug = this.uniqueSlug(this.citySlugs, name, `${name} ${state.name}`, `${name} ${state.name} ${country.code}`);
    this.citySlugs.add(slug);
    const now = new Date();
    const sortOrder = Math.max(0, ...this.citiesOf(state).map((c) => c.sortOrder ?? 0)) + 1;
    const doc = { _id: new ObjectId(), name, nameAr, stateId: state._id, slug, sortOrder, isActive: true, createdAt: now, updatedAt: now, __v: 0 };
    this.cities.push(doc);
    this.indexCity(doc);
    await this.insertDoc("cities", doc);
    this.note("add-city", `${country.code} ${state.name} / ${name}`);
  }

  // ── state operations ──

  /** Rename a state; if another state already has that name, fold into it instead. */
  async renameState(state, to) {
    if (!to || state.name === to || !this.alive(state)) return;
    const twin = this.statesOf(this.codeOf(state)).find((s) => s !== state && nameKey(s.name) === nameKey(to));
    if (twin) {
      await this.mergeState(state, twin, `same state as ${twin.name}`);
      if (twin.name !== to) await this.renameState(twin, to);
      return;
    }
    const from = state.name;
    await this.setFields("states", state, { name: to, updatedAt: new Date() });
    this.note("rename-state", `${from} → ${to}`);
  }

  /** Fill a missing Arabic name; one an admin already set is left as it is. */
  async setStateArabic(state, nameAr) {
    if (state.nameAr) return;
    await this.setFields("states", state, { nameAr, updatedAt: new Date() });
    this.note("arabic-state", `${state.name} → ${nameAr}`);
  }

  async mergeState(from, into, why = "") {
    if (from === into || !this.alive(from)) return;
    for (const city of this.citiesOf(from)) await this.moveCity(city, into, `${from.name} folded into ${into.name}`);
    await this.repoint(STATE_REFS, from._id, into._id, { warnWidened: true });
    this.states = this.states.filter((s) => s !== from);
    await this.deleteDoc("states", from);
    this.note("merge-state", `${from.name} → ${into.name}${why ? `  (${why})` : ""}`);
  }

  async deleteState(state, why = "") {
    const refs = this.apply ? await this.liveRefCount(state._id, STATE_REFS) : this.refCount(state._id, STATE_REFS);
    const cities = this.citiesOf(state).length;
    if (refs > 0 || cities > 0) {
      this.warn(`kept state ${state.name}: ${cities} cities, ${refs} record(s) point at it (${why})`);
      return;
    }
    this.states = this.states.filter((s) => s !== state);
    await this.deleteDoc("states", state);
    this.note("delete-state", `${state.name}${why ? `  (${why})` : ""}`);
  }

  async addState(code, name, nameAr = "") {
    const existing = this.findState(code, name);
    if (existing) return existing;
    const country = this.country(code);
    const slug = this.uniqueSlug(this.stateSlugs, name, `${name} ${country.name}`, `${name} ${code}`);
    this.stateSlugs.add(slug);
    const now = new Date();
    const sortOrder = Math.max(0, ...this.statesOf(code).map((s) => s.sortOrder ?? 0)) + 1;
    const doc = { _id: new ObjectId(), name, nameAr, countryId: country._id, slug, sortOrder, isActive: true, createdAt: now, updatedAt: now, __v: 0 };
    this.states.push(doc);
    await this.insertDoc("states", doc);
    this.note("add-state", `${code} ${name}`);
    return doc;
  }

  // ── passes ──

  /** Plain-letter names, dataset junk removed, same-name twins merged. */
  async genericCleanup(code) {
    const country = this.country(code);
    for (const state of this.statesOf(code)) {
      const clean = plainName(state.name).replace(/^[\s,.-]+|[\s,]+$/g, "");
      if (clean && clean !== state.name) await this.renameState(state, clean);
    }
    const stateKeys = this.statesOf(code).map((s) => nameKey(s.name));
    for (const state of this.statesOf(code)) {
      for (const city of this.citiesOf(state)) {
        const clean = cleanCityName(city.name, { stateName: state.name, countryName: country.name, stateKeys, stripDistrict: DISTRICT_NOISE.has(code) });
        if (clean && clean !== city.name) await this.renameCity(city, clean, "spelling cleanup", { keepTwinName: true });
      }
      await this.dedupeState(state);
    }
  }

  async dedupeState(state) {
    const groups = new Map();
    for (const city of this.citiesOf(state)) {
      const k = nameKey(city.name);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(city);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const ranked = [...group].sort(
        (a, b) =>
          this.refCount(b._id, CITY_REFS) - this.refCount(a._id, CITY_REFS) ||
          Number(plainName(b.name) === b.name && !/[-,]/.test(b.name)) - Number(plainName(a.name) === a.name && !/[-,]/.test(a.name)) ||
          String(a._id).localeCompare(String(b._id)),
      );
      for (const dup of ranked.slice(1)) await this.mergeCity(dup, ranked[0], "duplicate spelling");
    }
  }

  // ── the curated fix list ──

  async runFix(fix) {
    const { op, country: code } = fix;
    if (!this.countryByCode.has(code)) return this.skip(fix, `country ${code} not in the catalogue`);
    const state = (name) => {
      const s = this.findState(code, name);
      if (!s) this.skip(fix, `state "${name}" not found`);
      return s;
    };

    switch (op) {
      case "renameState": {
        const s = this.findState(code, fix.state);
        if (!s) return this.findState(code, fix.to) ? undefined : this.skip(fix, `state "${fix.state}" not found`);
        return this.renameState(s, fix.to);
      }
      case "stateArabic": {
        for (const [name, nameAr] of Object.entries(fix.names)) {
          const s = state(name);
          if (s) await this.setStateArabic(s, nameAr);
        }
        return;
      }
      case "addState":
        return this.addState(code, fix.name, fix.nameAr);
      case "mergeState": {
        const from = this.findState(code, fix.from);
        if (!from) return; // already folded
        const into = state(fix.into);
        if (into) await this.mergeState(from, into, fix.why);
        return;
      }
      case "collapseStates": {
        // Every state that is not a target folds into the target its list names (or the default).
        const targets = Object.fromEntries(Object.keys(fix.into).map((n) => [n, state(n)]));
        if (Object.values(targets).some((t) => !t)) return;
        const listed = new Map();
        for (const [target, names] of Object.entries(fix.into)) for (const n of names) listed.set(nameKey(n), target);
        const drop = new Set((fix.drop ?? []).map(nameKey));
        for (const s of this.statesOf(code)) {
          if (Object.values(targets).includes(s)) continue;
          if (drop.has(nameKey(s.name))) {
            // Not part of the country: delete when empty, otherwise leave for a person to look at.
            await this.deleteState(s, "not part of the country");
            continue;
          }
          const target = targets[listed.get(nameKey(s.name)) ?? fix.default];
          if (target) await this.mergeState(s, target, "council area folded into its nation");
        }
        return;
      }
      case "renameCity": {
        const s = state(fix.state);
        if (!s) return;
        const c = this.findCity(s, fix.city);
        if (!c) return this.findCity(s, fix.to) ? undefined : this.skip(fix, `city "${fix.city}" not found in ${s.name}`);
        return this.renameCity(c, fix.to, fix.why);
      }
      case "renameCities": {
        const s = state(fix.state);
        if (!s) return;
        for (const [from, to] of fix.names) {
          const c = this.findCity(s, from);
          if (c) await this.renameCity(c, to, fix.why);
          else if (!this.findCity(s, to)) this.skip(fix, `city "${from}" not found in ${s.name}`);
        }
        return;
      }
      case "mergeCity": {
        const s = state(fix.state);
        if (!s) return;
        const dup = this.findCity(s, fix.city);
        if (!dup) return; // already merged
        const target = state(fix.intoState ?? fix.state);
        const keep = this.findCity(target, fix.into);
        if (!keep) return this.skip(fix, `city "${fix.into}" not found in ${target?.name ?? "?"}`);
        if (dup !== keep) await this.mergeCity(dup, keep, fix.why);
        return;
      }
      case "moveCity": {
        const s = state(fix.state);
        const to = state(fix.to);
        if (!s || !to) return;
        const c = this.findCity(s, fix.city);
        if (!c) return this.findCity(to, fix.city) ? undefined : this.skip(fix, `city "${fix.city}" not found in ${s.name}`);
        await this.moveCity(c, to, fix.why);
        return;
      }
      case "moveAllCities": {
        const from = this.findState(code, fix.from);
        if (!from) return; // already folded
        const to = state(fix.to);
        if (!to) return;
        // Only the known misfile: a state that does not hold the guard town is left alone.
        if (fix.guardCity && !this.findCity(from, fix.guardCity)) return this.skip(fix, `${from.name} has no "${fix.guardCity}" — not the misfile this fix is for`);
        for (const c of this.citiesOf(from)) await this.moveCity(c, to, fix.why);
        return;
      }
      case "dedupeAgainst": {
        // Cities of `from` that also exist in `against` are copies: merge them there.
        const from = state(fix.from);
        const against = state(fix.against);
        if (!from || !against) return;
        const keep = new Set((fix.keep ?? []).map(nameKey));
        for (const c of this.citiesOf(from)) {
          if (!this.alive(c) || keep.has(nameKey(c.name))) continue;
          const twin = this.findCity(against, c.name);
          if (twin) await this.mergeCity(c, twin, fix.why ?? `belongs to ${against.name}`);
        }
        return;
      }
      case "areaCities": {
        // Council / county areas listed as towns: merge into the town they name, or drop.
        const s = state(fix.state);
        if (!s) return;
        for (const [name, base] of fix.entries) {
          const c = this.findCity(s, name);
          if (!c) continue;
          if (base) {
            const twin = this.findCity(s, base);
            if (twin) await this.mergeCity(c, twin, "council area of the same town");
            else await this.renameCity(c, base, "council area name");
          } else {
            await this.deleteCity(c, "a county or council area, not a town");
          }
        }
        return;
      }
      case "addCities": {
        const s = state(fix.state);
        if (!s) return;
        for (const entry of fix.names) {
          const [name, nameAr] = Array.isArray(entry) ? entry : [entry, ""];
          await this.addCity(s, name, nameAr);
        }
        return;
      }
      default:
        throw new Error(`Unknown fix op "${op}"`);
    }
  }

  skip(fix, why) {
    this.skipped.push(`${fix.country} ${fix.op}: ${why}`);
    this.lines.push(`skip          ${fix.country} ${fix.op}: ${why}`);
    return null;
  }

  async run() {
    await this.load();
    const before = { states: this.states.length, cities: this.cities.length };
    for (const code of TARGET_COUNTRIES) if (this.countryByCode.has(code)) await this.genericCleanup(code);
    for (const fix of FIXES) await this.runFix(fix);
    for (const code of TARGET_COUNTRIES) {
      if (!this.countryByCode.has(code)) continue;
      for (const s of this.statesOf(code)) await this.dedupeState(s);
    }
    return { before, after: { states: this.states.length, cities: this.cities.length } };
  }

  /** What is still off after the run — read from the working copy. */
  validate() {
    const issues = [];
    for (const code of TARGET_COUNTRIES) {
      if (!this.countryByCode.has(code)) continue;
      for (const s of this.statesOf(code)) {
        const seen = new Map();
        for (const c of this.citiesOf(s)) {
          const k = nameKey(c.name);
          if (seen.has(k)) issues.push(`${code} ${s.name}: "${seen.get(k)}" and "${c.name}" are one city`);
          seen.set(k, c.name);
          if (/,|\(\s*\)/.test(c.name) || plainName(c.name) !== c.name) issues.push(`${code} ${s.name}: odd name "${c.name}"`);
        }
      }
    }
    const cityState = new Map(this.cities.map((c) => [String(c._id), String(c.stateId)]));
    for (const [defs, removed] of [[CITY_REFS, this.deleted.cities], [STATE_REFS, this.deleted.states]]) {
      for (const def of defs) {
        for (const doc of this.refDocs[def.coll]) {
          for (const id of def.array ? doc[def.field] ?? [] : [doc[def.field]]) {
            if (id && removed.has(String(id))) issues.push(`${def.coll} ${doc._id}.${def.field} points at a deleted record`);
          }
          if (def.stateField && doc[def.field] && cityState.has(String(doc[def.field])) && cityState.get(String(doc[def.field])) !== String(doc[def.stateField])) {
            issues.push(`${def.coll} ${doc._id}: regionStateId does not match its city's state`);
          }
        }
      }
    }
    return issues;
  }

  /** After --apply: look every deleted id up in the live link fields, and every region's state up against its city. */
  async liveSweep() {
    const issues = [];
    for (const [defs, removed] of [[CITY_REFS, this.deleted.cities], [STATE_REFS, this.deleted.states]]) {
      const ids = [...removed.values()];
      if (ids.length === 0) continue;
      for (const def of defs) {
        const hits = await this.db.collection(def.coll).find({ [def.field]: { $in: ids } }, { projection: { _id: 1 } }).toArray();
        for (const h of hits) issues.push(`LIVE: ${def.coll} ${h._id}.${def.field} points at a deleted record`);
      }
    }
    const cityState = new Map(this.cities.map((c) => [String(c._id), String(c.stateId)]));
    for (const def of CITY_REFS.filter((d) => d.stateField)) {
      const docs = await this.db
        .collection(def.coll)
        .find({ [def.field]: { $in: this.cities.map((c) => c._id) } }, { projection: { [def.field]: 1, [def.stateField]: 1 } })
        .toArray();
      for (const d of docs) {
        if (cityState.get(String(d[def.field])) !== String(d[def.stateField])) issues.push(`LIVE: ${def.coll} ${d._id}: regionStateId does not match its city's state`);
      }
    }
    return issues;
  }
}

// ─── restore ────────────────────────────────────────────────────────────────

export async function restoreFromJournal(db, file, { force = false } = {}) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const header = EJSON.parse(lines[0], { relaxed: false });
  if (header.migration !== MIGRATION) throw new Error(`${file} is not a ${MIGRATION} journal`);
  if (header.db !== db.databaseName && !force) {
    throw new Error(`${file} was written against database "${header.db}", not "${db.databaseName}" — pass --db ${header.db}, or --force`);
  }
  const entries = lines.slice(1).map((l) => EJSON.parse(l, { relaxed: false }));
  for (const entry of entries.reverse()) {
    const coll = db.collection(entry.coll);
    if (entry.t === "ins") await coll.deleteOne({ _id: entry._id });
    else if (entry.t === "del") await coll.replaceOne({ _id: entry.doc._id }, entry.doc, { upsert: true });
    else if (entry.t === "mod") {
      const update = {};
      if (Object.keys(entry.before).length) update.$set = entry.before;
      if (entry.unset.length) update.$unset = Object.fromEntries(entry.unset.map((k) => [k, ""]));
      if (Object.keys(update).length) await coll.updateOne({ _id: entry._id }, update);
    }
  }
  return entries.length;
}

// ─── entry points ───────────────────────────────────────────────────────────

export async function runLocationFix(db, { apply = false, backupDir = "backups", reportFile } = {}) {
  if (apply) {
    // Pre-flight: the whole run in memory. Nothing is written if it would fail.
    await new LocationFixer(db, { apply: false }).run();
  }
  const fixer = new LocationFixer(db, { apply });
  const report = reportFile ?? path.join(os.tmpdir(), `location-data-report-${Date.now()}.txt`);
  let result;
  let error;
  let liveIssues = [];
  if (apply) fixer.openJournal(backupDir);
  try {
    result = await fixer.run();
    if (apply) liveIssues = await fixer.liveSweep();
  } catch (err) {
    error = err;
  } finally {
    fixer.closeJournal();
  }
  const issues = [...fixer.validate(), ...liveIssues];
  fs.writeFileSync(report, [...fixer.lines, "", "REMAINING ISSUES:", ...(issues.length ? issues : ["none"])].join("\n"));
  if (error) {
    error.backupFile = fixer.journalFile;
    error.report = report;
    throw error;
  }
  return { ...result, counts: fixer.counts, warnings: fixer.warnings, skipped: fixer.skipped, issues, report, backupFile: fixer.journalFile, journalSize: fixer.journalSize };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const apply = args.includes("--apply");
  const restore = opt("--restore");
  const dbName = opt("--db");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = dbName ? mongoose.connection.client.db(dbName) : mongoose.connection.db;
  console.log(`Database: ${db.databaseName}`);

  try {
    if (restore) {
      const n = await restoreFromJournal(db, restore, { force: args.includes("--force") });
      console.log(`Restored ${n} journal entries from ${restore}.`);
      return;
    }
    const r = await runLocationFix(db, { apply, reportFile: opt("--report") });
    console.log(apply ? "APPLIED." : "REPORT ONLY — nothing was written. Re-run with --apply to perform it.");
    console.log(`States: ${r.before.states} → ${r.after.states}   Cities: ${r.before.cities} → ${r.after.cities}   (target countries: ${TARGET_COUNTRIES.join(", ")})`);
    console.log("Changes:", Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(", ") || "none");
    if (r.warnings.length) console.log(`Warnings (${r.warnings.length}):\n  ${r.warnings.join("\n  ")}`);
    if (r.skipped.length) console.log(`Skipped fixes (${r.skipped.length}):\n  ${r.skipped.join("\n  ")}`);
    console.log(`Remaining issues: ${r.issues.length}${r.issues.length ? `\n  ${r.issues.slice(0, 30).join("\n  ")}` : ""}`);
    console.log(`Full change list: ${r.report}`);
    if (r.backupFile) console.log(`Undo journal (${r.journalSize} entries): ${r.backupFile}\n  node scripts/fix-location-data.mjs --restore ${r.backupFile}${dbName ? ` --db ${dbName}` : ""}`);
    if (apply) console.log("Restart the app so the matching code reloads state names.");
    if (r.issues.length) process.exitCode = 1;
  } catch (err) {
    if (err.backupFile) console.error(`FAILED part-way. Undo journal: ${err.backupFile}\n  node scripts/fix-location-data.mjs --restore ${err.backupFile}${dbName ? ` --db ${dbName}` : ""}`);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
