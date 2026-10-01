/**
 * Job categories — what kind of work a job is (Engineering, Sales, Nursing…).
 *
 * The list used to be fourteen values typed into the job form, with a second,
 * different list of fifteen on the edit page, so "Engineering" could be saved
 * from one screen and not chosen on the other, and 40% of live jobs carried no
 * category because nothing fitted (nurses, teachers, technicians, sales).
 *
 * It is now an admin-managed list (Admin → Master Data → Job categories),
 * stored in the `jobcategories` collection. This file holds the starting set
 * the collection is seeded with and the pure helpers both sides share; the
 * database code lives in `jobCategoryStore.ts` so this stays client-safe.
 *
 * A job stores the category's English `name` — the jobs-list filter and the
 * workflow-template auto-pick both compare that string — and the label is
 * localised from `nameAr` at display time.
 */

export interface JobCategoryItem {
  name: string;
  nameAr: string;
  slug: string;
}

/**
 * The starting set. Every value the old create and edit lists offered is here
 * under the same English name, so existing jobs keep a matching entry; "Other"
 * stays last.
 */
export const DEFAULT_JOB_CATEGORIES: ReadonlyArray<{ name: string; nameAr: string }> = [
  { name: "Technology", nameAr: "التكنولوجيا" },
  { name: "Engineering", nameAr: "الهندسة" },
  { name: "Healthcare", nameAr: "الرعاية الصحية" },
  { name: "Finance", nameAr: "المالية" },
  { name: "Accounting", nameAr: "المحاسبة" },
  { name: "Banking & Insurance", nameAr: "البنوك والتأمين" },
  { name: "Sales", nameAr: "المبيعات" },
  { name: "Marketing", nameAr: "التسويق" },
  { name: "Sales & Marketing", nameAr: "المبيعات والتسويق" },
  { name: "Customer Service", nameAr: "خدمة العملاء" },
  { name: "Administration & Office", nameAr: "الإدارة والأعمال المكتبية" },
  { name: "Human Resources", nameAr: "الموارد البشرية" },
  { name: "Legal", nameAr: "القانون" },
  { name: "Education", nameAr: "التعليم" },
  { name: "Hospitality", nameAr: "الضيافة" },
  { name: "Food & Beverage", nameAr: "الأغذية والمشروبات" },
  { name: "Retail", nameAr: "التجزئة" },
  { name: "Construction", nameAr: "البناء والتشييد" },
  { name: "Real Estate", nameAr: "العقارات" },
  { name: "Manufacturing", nameAr: "التصنيع" },
  { name: "Logistics", nameAr: "الخدمات اللوجستية" },
  { name: "Procurement & Supply Chain", nameAr: "المشتريات وسلاسل الإمداد" },
  { name: "Transport & Driving", nameAr: "النقل والقيادة" },
  { name: "Oil & Gas", nameAr: "النفط والغاز" },
  { name: "Energy & Utilities", nameAr: "الطاقة والمرافق" },
  { name: "Technicians & Skilled Trades", nameAr: "الفنيون والحرف الماهرة" },
  { name: "Facilities & Maintenance", nameAr: "المرافق والصيانة" },
  { name: "Health, Safety & Environment", nameAr: "الصحة والسلامة والبيئة" },
  { name: "Quality Assurance & Control", nameAr: "ضمان الجودة ومراقبتها" },
  { name: "Security Services", nameAr: "الخدمات الأمنية" },
  { name: "Design & Creative", nameAr: "التصميم والإبداع" },
  { name: "Media & Communications", nameAr: "الإعلام والاتصال" },
  { name: "Data Science & Analytics", nameAr: "علوم البيانات والتحليلات" },
  { name: "Product Management", nameAr: "إدارة المنتجات" },
  { name: "Operations", nameAr: "العمليات" },
  { name: "Beauty & Wellness", nameAr: "التجميل والعافية" },
  { name: "Aviation", nameAr: "الطيران" },
  { name: "Automotive", nameAr: "السيارات" },
  { name: "Agriculture", nameAr: "الزراعة" },
  { name: "Government & Public Sector", nameAr: "القطاع الحكومي والعام" },
  { name: "Other", nameAr: "أخرى" },
];

/** English names of the starting set — the fallback when the list cannot load. */
export const DEFAULT_JOB_CATEGORY_NAMES: readonly string[] = DEFAULT_JOB_CATEGORIES.map((c) => c.name);

/** Same rule as `lib/slug.ts`, inlined so this module has no imports. */
export function jobCategorySlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The starting set as seed documents, in display order. "Other" sorts last. */
export function defaultJobCategoryDocs(): Array<JobCategoryItem & { sortOrder: number; isActive: true }> {
  return DEFAULT_JOB_CATEGORIES.map((c, i) => ({
    name: c.name,
    nameAr: c.nameAr,
    slug: jobCategorySlug(c.name),
    sortOrder: c.name === "Other" ? 999 : (i + 1) * 10,
    isActive: true,
  }));
}

/** The label for one category in the reader's language. */
export function jobCategoryLabel(item: Pick<JobCategoryItem, "name" | "nameAr">, locale: string): string {
  return locale === "ar" && item.nameAr.trim() ? item.nameAr : item.name;
}

export interface JobCategoryOption {
  value: string;
  label: string;
}

/**
 * Select options for a job form.
 *
 * `current` is the value already on the job. When it is not in the list — a
 * category an admin has since switched off, or a value an older form or the AI
 * drafter wrote ("Data Science", "Safety") — it is kept as the first option so
 * opening and saving the job never silently clears it.
 */
export function jobCategoryOptions(
  items: readonly JobCategoryItem[],
  locale: string,
  current?: string | null,
): JobCategoryOption[] {
  const options = items.map((item) => ({ value: item.name, label: jobCategoryLabel(item, locale) }));
  const kept = (current ?? "").trim();
  // Exact match: the select matches values strictly, so "engineering" on an
  // older job needs its own option or the field would render blank.
  if (kept && !options.some((o) => o.value === kept)) {
    return [{ value: kept, label: kept }, ...options];
  }
  return options;
}

/** The starting set as items, for a form whose list request failed. */
export function fallbackJobCategoryItems(): JobCategoryItem[] {
  return DEFAULT_JOB_CATEGORIES.map((c) => ({ name: c.name, nameAr: c.nameAr, slug: jobCategorySlug(c.name) }));
}
