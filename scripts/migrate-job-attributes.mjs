/**
 * Migration: backfill individual lookup collections → unified JobAttribute
 *
 * Reads data from the 15 legacy collections (JobType, CareerLevel, Industry …)
 * and upserts each document into the new `jobattributes` collection with the
 * appropriate `category` field.
 *
 * Safe to re-run: upserts on {category, slug} so duplicates are skipped.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node scripts/migrate-job-attributes.mjs
 *
 * Or, if MONGODB_URI is set in environment:
 *   node scripts/migrate-job-attributes.mjs
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("MONGODB_URI is required");

// ─── Legacy schema (shared across all old lookup collections) ─────────────────
const legacySchema = new mongoose.Schema(
  {
    name: String,
    nameAr: String,
    slug: String,
    sortOrder: Number,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

function getLegacyModel(collectionName) {
  const modelName = `Legacy_${collectionName}`;
  return mongoose.models[modelName] || mongoose.model(modelName, legacySchema, collectionName);
}

// ─── New unified JobAttribute schema ─────────────────────────────────────────
const jobAttributeSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    labelAr: { type: String, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

jobAttributeSchema.index({ category: 1, slug: 1 }, { unique: true });

const JobAttribute =
  mongoose.models.JobAttribute ||
  mongoose.model("JobAttribute", jobAttributeSchema);

// ─── Mapping: old collection name → new category value ───────────────────────
// Collection names are lowercased by Mongoose (e.g. "JobType" → "jobtypes")
const COLLECTION_MAP = [
  { collection: "jobtypes",        category: "job_type" },
  { collection: "careerlevels",    category: "career_level" },
  { collection: "industries",      category: "industry" },
  { collection: "functionalareas", category: "functional_area" },
  { collection: "jobshifts",       category: "job_shift" },
  { collection: "skilllevels",     category: "skill_level" },
  { collection: "languagelevels",  category: "language_level" },
  { collection: "degreelevels",    category: "degree_level" },
  { collection: "degreetypes",     category: "degree_type" },
  { collection: "majorsubjects",   category: "major_subject" },
  { collection: "salaryperiods",   category: "salary_period" },
  { collection: "ownershiptypes",  category: "ownership_type" },
  { collection: "resulttypes",     category: "result_type" },
  { collection: "genders",         category: "gender" },
  { collection: "maritalstatuses", category: "marital_status" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const { collection, category } of COLLECTION_MAP) {
    const Model = getLegacyModel(collection);

    // Check if collection has data
    const count = await Model.countDocuments();
    if (count === 0) {
      console.log(`⚪  ${collection.padEnd(20)} 0 documents — skipping`);
      continue;
    }

    const docs = await Model.find({ isActive: { $ne: false } }).lean();
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of docs) {
      const slug = doc.slug || slugify(doc.name || "");
      if (!slug || !doc.name) {
        errors++;
        continue;
      }

      try {
        await JobAttribute.updateOne(
          { category, slug },
          {
            $setOnInsert: {
              category,
              label: doc.name,
              labelAr: doc.nameAr || undefined,
              slug,
              order: doc.sortOrder ?? 0,
              isActive: doc.isActive ?? true,
            },
          },
          { upsert: true }
        );
        migrated++;
      } catch (err) {
        if (err.code === 11000) {
          skipped++; // already exists — idempotent
        } else {
          console.error(`   ❌ ${category}/${slug}: ${err.message}`);
          errors++;
        }
      }
    }

    console.log(
      `✅ ${collection.padEnd(20)} → ${category.padEnd(18)} migrated=${migrated} skipped=${skipped} errors=${errors}`
    );
    totalMigrated += migrated;
    totalSkipped += skipped;
    totalErrors += errors;
  }

  console.log(
    `\n🎉 Migration complete: ${totalMigrated} migrated, ${totalSkipped} already existed, ${totalErrors} errors`
  );

  if (totalErrors > 0) {
    console.log("\n⚠️  Some documents had errors — check output above.");
  }

  await mongoose.disconnect();
  process.exit(totalErrors > 0 ? 1 : 0);
}

function slugify(str) {
  return str
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

main().catch((err) => {
  console.error("💥 Migration failed:", err);
  process.exit(1);
});
