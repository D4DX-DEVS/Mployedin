/**
 * @jest-environment node
 */
/**
 * Guards the T3 / Appendix-B gap in CONSOLIDATED-AUDIT.md.
 *
 * `mongoose.ts` sets `autoIndex: false`, so a `Schema.index()` or `unique: true`
 * declared on a model does NOT reach the database — `ensureIndexes()` in
 * `src/lib/db/indexes.ts` is the only thing that creates anything. When that file
 * covered 30 of 94 models, every index on the other 64 existed in code only, and
 * every model-level `unique: true` among them was an unenforced constraint.
 *
 * Nothing about that failure is visible at runtime: queries still return correct
 * results, just by collection scan, and duplicate rows insert happily. So it can
 * only be caught here — this test fails the moment a model declares an index for
 * a collection `ensureIndexes()` does not manage.
 */

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const MODELS_DIR = path.join(process.cwd(), "src/models");
const INDEXES_FILE = path.join(process.cwd(), "src/lib/db/indexes.ts");

const pluralize = mongoose.pluralize() as (s: string) => string;

function managedCollections(): Set<string> {
  const src = fs.readFileSync(INDEXES_FILE, "utf8");
  return new Set([...src.matchAll(/safeCreateIndexes\(db,\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
}

interface ModelDecl {
  file: string;
  collection: string;
  declarations: string[];
}

function declaringModels(): ModelDecl[] {
  const out: ModelDecl[] = [];
  for (const file of fs.readdirSync(MODELS_DIR)) {
    if (!file.endsWith(".ts") || file === "index.ts") continue;
    const src = fs.readFileSync(path.join(MODELS_DIR, file), "utf8");

    // A file can register more than one model — CandidateSurvey, EmployeeReferral
    // and OfferLetter each register two. Reading only the first both misses a
    // collection entirely and attributes its sibling's indexes to the wrong one,
    // which is exactly how offerletters and employeereferrals were first missed.
    const registrations = [
      ...src.matchAll(/mongoose\.model(?:<[^>]*>)?\(\s*["'](\w+)["']\s*,\s*(\w+)\s*\)/g),
    ].map((m) => ({ modelName: m[1], schemaVar: m[2] }));

    if (!registrations.length) {
      const fallback = path.basename(file, ".ts");
      registrations.push({ modelName: fallback, schemaVar: `${fallback}Schema` });
    }

    const override = src.match(/collection:\s*["'](\w+)["']/);
    const single = registrations.length === 1;

    for (const { modelName, schemaVar } of registrations) {
      const collection = override && single ? override[1] : pluralize(modelName.toLowerCase());

      const declarations = [
        ...[...src.matchAll(new RegExp(`${schemaVar}\\.index\\(\\s*(\\{[^;]*?\\})`, "g"))].map((m) =>
          m[1].replace(/\s+/g, " ").trim()
        ),
      ];
      // Field-level unique/index cannot be attributed to a schema by regex alone,
      // so only claim them when the file defines exactly one model.
      if (single) {
        declarations.push(
          ...[...src.matchAll(/(\w+)\s*:\s*\{[^{}]*\bunique:\s*true/g)].map((m) => `unique: ${m[1]}`),
          ...[...src.matchAll(/(\w+)\s*:\s*\{[^{}]*\bindex:\s*true/g)].map((m) => `index: ${m[1]}`)
        );
      }
      if (declarations.length) out.push({ file, collection, declarations });
    }
  }
  return out;
}

describe("index coverage — every declared index must be managed", () => {
  it("leaves no model declaring indexes for an unmanaged collection", () => {
    const managed = managedCollections();
    const orphans = declaringModels().filter((m) => !managed.has(m.collection));

    const report = orphans
      .map((m) => `  ${m.file} -> "${m.collection}" declares: ${m.declarations.join("; ")}`)
      .join("\n");

    expect(
      orphans.length === 0
        ? ""
        : `autoIndex is off, so these declarations never reach MongoDB.\n` +
            `Add a safeCreateIndexes(db, "<collection>", [...]) block in src/lib/db/indexes.ts for each:\n${report}`
    ).toBe("");
  });

  it("declares each collection exactly once in ensureIndexes()", () => {
    const src = fs.readFileSync(INDEXES_FILE, "utf8");
    const names = [...src.matchAll(/safeCreateIndexes\(db,\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    // A second block for the same collection makes the real set of indexes
    // impossible to read off the file.
    expect(dupes).toEqual([]);
  });

  it("still manages the collections the audit listed as covered", () => {
    const managed = managedCollections();
    for (const c of ["users", "jobs", "applications", "auditlogs", "employers", "agents"]) {
      expect(managed.has(c)).toBe(true);
    }
  });
});
