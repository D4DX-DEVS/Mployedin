import { JobCategory } from "@/models/JobCategory";
import Job from "@/models/Job";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import { escapeRegex } from "@/lib/security/sanitize";
import { defaultJobCategoryDocs, type JobCategoryItem } from "@/lib/jobs/jobCategories";

let slugIndexReady: Promise<void> | null = null;

/**
 * Fill an empty `jobcategories` collection with the starting set.
 *
 * Runs on read rather than from a migration script so every environment —
 * staging, production, a fresh database — gets the list the first time a job
 * form or the admin page asks for it, with nobody having to remember a step.
 * It only acts on an EMPTY collection: once anything exists, the admin owns
 * the list. Upserts by slug, so two requests racing each other cannot insert
 * the same category twice.
 */
export async function ensureJobCategoriesSeeded(): Promise<void> {
  const existing = await JobCategory.estimatedDocumentCount();
  if (existing > 0) return;
  // autoIndex is off and ensureIndexes() runs in the background after connect,
  // so on a fresh database the unique slug index may not exist yet. Without it
  // two racing seeds could both insert — and the index could then never be
  // built over the duplicates. Build it first (idempotent, once per process).
  slugIndexReady ??= JobCategory.collection.createIndex({ slug: 1 }, { unique: true }).then(
    () => undefined,
    (err: unknown) => {
      slugIndexReady = null;
      throw err;
    },
  );
  await slugIndexReady;
  await JobCategory.bulkWrite(
    defaultJobCategoryDocs().map((doc) => ({
      updateOne: {
        filter: { slug: doc.slug },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

/**
 * Carry a category rename onto everything that stores the name.
 *
 * A job keeps its category as the English name, and both the jobs-list filter
 * and the workflow-template auto-pick compare that string, so renaming
 * "Healthcare" to "Health Care" in the admin list would otherwise drop every
 * existing Healthcare job out of the filter and silently stop the templates
 * that pick on it. Case-insensitive, like the template matcher. `updatedAt` is
 * left alone: the jobs did not change in any way their owners would recognise.
 */
export async function renameJobCategoryEverywhere(oldName: string, newName: string): Promise<{ jobs: number; templates: number }> {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to || from === to) return { jobs: 0, templates: 0 };
  const exact = { $regex: `^${escapeRegex(from)}$`, $options: "i" };
  const [jobs, templates] = await Promise.all([
    Job.updateMany({ category: exact }, { $set: { category: to } }, { timestamps: false }),
    WorkflowTemplate.updateMany(
      { "match.categories": exact },
      { $set: { "match.categories.$[c]": to } },
      { arrayFilters: [{ c: exact }], timestamps: false },
    ),
  ]);
  return { jobs: jobs.modifiedCount, templates: templates.modifiedCount };
}

/** Active categories in admin order — what every job form offers. */
export async function listActiveJobCategories(): Promise<JobCategoryItem[]> {
  await ensureJobCategoriesSeeded();
  const docs = await JobCategory.find({ isActive: true })
    .select("name nameAr slug")
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  return docs.map((d) => ({ name: d.name, nameAr: d.nameAr ?? "", slug: d.slug }));
}
