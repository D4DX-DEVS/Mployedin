/**
 * Job categories: the admin-managed list's starting set and the helpers every
 * job form shares. The old create form offered 14 values and the edit page a
 * different 15; 40% of live jobs carried no category because nothing fitted.
 */
import {
  DEFAULT_JOB_CATEGORIES,
  DEFAULT_JOB_CATEGORY_NAMES,
  defaultJobCategoryDocs,
  fallbackJobCategoryItems,
  jobCategoryLabel,
  jobCategoryOptions,
  jobCategorySlug,
} from "@/lib/jobs/jobCategories";
import { JOB_CATEGORIES } from "@/components/features/employer/job-form/jobFormSchema";

const OLD_CREATE_LIST = [
  "Technology", "Healthcare", "Finance", "Construction", "Hospitality", "Education", "Manufacturing",
  "Logistics", "Oil & Gas", "Retail", "Marketing", "Legal", "Human Resources", "Other",
];
const OLD_EDIT_LIST = [
  "Technology", "Healthcare", "Finance", "Construction", "Hospitality", "Education", "Manufacturing",
  "Logistics", "Oil & Gas", "Retail", "Human Resources", "Sales & Marketing", "Legal", "Engineering", "Other",
];

describe("starting set", () => {
  it("keeps every value either old list offered, under the same English name", () => {
    for (const name of [...OLD_CREATE_LIST, ...OLD_EDIT_LIST]) {
      expect(DEFAULT_JOB_CATEGORY_NAMES).toContain(name);
    }
  });

  it("covers the job types live jobs had no category for", () => {
    for (const name of ["Engineering", "Sales", "Accounting", "Design & Creative", "Technicians & Skilled Trades", "Media & Communications"]) {
      expect(DEFAULT_JOB_CATEGORY_NAMES).toContain(name);
    }
  });

  it("has an Arabic name for every category and no duplicate names or slugs", () => {
    for (const c of DEFAULT_JOB_CATEGORIES) expect(c.nameAr.trim()).not.toBe("");
    const names = DEFAULT_JOB_CATEGORIES.map((c) => c.name.toLowerCase());
    const slugs = defaultJobCategoryDocs().map((d) => d.slug);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("seeds in display order with Other last", () => {
    const docs = defaultJobCategoryDocs();
    const sorted = [...docs].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted[sorted.length - 1].name).toBe("Other");
    expect(sorted[0].name).toBe("Technology");
    expect(docs.every((d) => d.isActive)).toBe(true);
  });

  it("is what the workflow match rules list (JOB_CATEGORIES) offers", () => {
    expect([...JOB_CATEGORIES]).toEqual([...DEFAULT_JOB_CATEGORY_NAMES]);
  });
});

describe("jobCategorySlug", () => {
  it("matches the job-attribute slug rule", () => {
    expect(jobCategorySlug("Oil & Gas")).toBe("oil-gas");
    expect(jobCategorySlug("Health, Safety & Environment")).toBe("health-safety-environment");
  });
});

describe("jobCategoryOptions", () => {
  const items = fallbackJobCategoryItems();

  it("stores the English name and labels in the reader's language", () => {
    const en = jobCategoryOptions(items, "en").find((o) => o.value === "Engineering");
    const ar = jobCategoryOptions(items, "ar").find((o) => o.value === "Engineering");
    expect(en).toEqual({ value: "Engineering", label: "Engineering" });
    expect(ar).toEqual({ value: "Engineering", label: "الهندسة" });
  });

  it("falls back to the English name when an admin left the Arabic blank", () => {
    expect(jobCategoryLabel({ name: "Nursing", nameAr: " " }, "ar")).toBe("Nursing");
  });

  it("keeps a job's existing value selectable when the list no longer holds it", () => {
    const options = jobCategoryOptions(items, "en", "Data Science");
    expect(options[0]).toEqual({ value: "Data Science", label: "Data Science" });
    expect(options).toHaveLength(items.length + 1);
  });

  it("does not duplicate a current value that is in the list", () => {
    expect(jobCategoryOptions(items, "en", "Engineering")).toHaveLength(items.length);
    expect(jobCategoryOptions(items, "en", "")).toHaveLength(items.length);
  });

  it("keeps a differently-cased legacy value selectable rather than rendering a blank field", () => {
    expect(jobCategoryOptions(items, "en", "engineering")[0]).toEqual({ value: "engineering", label: "engineering" });
  });
});
