/**
 * @jest-environment node
 *
 * The job-category list seeds itself on first read so every environment gets
 * the starting set without a migration step — but only while EMPTY: once an
 * admin has anything in it, the list is theirs.
 */
const estimatedDocumentCount = jest.fn();
const bulkWrite = jest.fn().mockResolvedValue({});
const find = jest.fn();
const createIndex = jest.fn().mockResolvedValue("slug_1");

jest.mock("@/models/JobCategory", () => ({
  __esModule: true,
  JobCategory: {
    estimatedDocumentCount: (...a: unknown[]) => estimatedDocumentCount(...a),
    bulkWrite: (...a: unknown[]) => bulkWrite(...a),
    find: (...a: unknown[]) => find(...a),
    collection: { createIndex: (...a: unknown[]) => createIndex(...a) },
  },
}));

const jobUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 7 });
const templateUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
jest.mock("@/models/Job", () => ({ __esModule: true, default: { updateMany: (...a: unknown[]) => jobUpdateMany(...a) } }));
jest.mock("@/models/WorkflowTemplate", () => ({ __esModule: true, default: { updateMany: (...a: unknown[]) => templateUpdateMany(...a) } }));

import { ensureJobCategoriesSeeded, listActiveJobCategories, renameJobCategoryEverywhere } from "@/lib/jobs/jobCategoryStore";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/jobs/jobCategories";

function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.select = jest.fn(() => c);
  c.sort = jest.fn(() => c);
  c.lean = jest.fn(async () => rows);
  return c;
}

beforeEach(() => jest.clearAllMocks());

describe("ensureJobCategoriesSeeded", () => {
  it("upserts the whole starting set by slug when the collection is empty", async () => {
    estimatedDocumentCount.mockResolvedValue(0);
    await ensureJobCategoriesSeeded();
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const [ops, opts] = bulkWrite.mock.calls[0] as [Array<{ updateOne: { filter: { slug: string }; update: { $setOnInsert: { name: string } }; upsert: boolean } }>, { ordered: boolean }];
    expect(ops).toHaveLength(DEFAULT_JOB_CATEGORIES.length);
    expect(ops[0].updateOne.upsert).toBe(true);
    expect(ops[0].updateOne.filter).toEqual({ slug: "technology" });
    // $setOnInsert: a racing request can never overwrite an admin's edit.
    expect(ops[0].updateOne.update.$setOnInsert.name).toBe("Technology");
    expect(opts.ordered).toBe(false);
    // The unique slug index exists before the first insert.
    expect(createIndex).toHaveBeenCalledWith({ slug: 1 }, { unique: true });
    expect(createIndex.mock.invocationCallOrder[0]).toBeLessThan(bulkWrite.mock.invocationCallOrder[0]);
  });

  it("leaves a non-empty list alone", async () => {
    estimatedDocumentCount.mockResolvedValue(3);
    await ensureJobCategoriesSeeded();
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});

describe("listActiveJobCategories", () => {
  it("returns active categories in admin order", async () => {
    estimatedDocumentCount.mockResolvedValue(2);
    const q = chain([{ name: "Nursing", nameAr: "التمريض", slug: "nursing" }, { name: "Other", slug: "other" }]);
    find.mockReturnValue(q);
    const items = await listActiveJobCategories();
    expect(find).toHaveBeenCalledWith({ isActive: true });
    expect(q.sort).toHaveBeenCalledWith({ sortOrder: 1, name: 1 });
    expect(items).toEqual([
      { name: "Nursing", nameAr: "التمريض", slug: "nursing" },
      { name: "Other", nameAr: "", slug: "other" },
    ]);
  });
});

describe("renameJobCategoryEverywhere", () => {
  it("moves jobs and workflow-template rules to the new name, matching the old one in any case", async () => {
    const result = await renameJobCategoryEverywhere("Healthcare", "Health Care");
    expect(result).toEqual({ jobs: 7, templates: 2 });
    const exact = { $regex: "^Healthcare$", $options: "i" };
    expect(jobUpdateMany).toHaveBeenCalledWith({ category: exact }, { $set: { category: "Health Care" } }, { timestamps: false });
    expect(templateUpdateMany).toHaveBeenCalledWith(
      { "match.categories": exact },
      { $set: { "match.categories.$[c]": "Health Care" } },
      { arrayFilters: [{ c: exact }], timestamps: false },
    );
  });

  it("escapes regex characters in the old name and ignores a no-op rename", async () => {
    await renameJobCategoryEverywhere("Oil & Gas (Upstream)", "Oil & Gas");
    expect(jobUpdateMany.mock.calls[0][0]).toEqual({ category: { $regex: String.raw`^Oil & Gas \(Upstream\)$`, $options: "i" } });
    jobUpdateMany.mockClear();
    expect(await renameJobCategoryEverywhere("Retail", "Retail")).toEqual({ jobs: 0, templates: 0 });
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });
});
