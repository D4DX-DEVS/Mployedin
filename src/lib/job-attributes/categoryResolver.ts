/**
 * Model resolver for job-attribute categories.
 * Maps URL slug → Mongoose model + display label.
 */
import type { Model, Document } from "mongoose";

export interface AttributeDoc extends Document {
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryMeta {
  model: () => Promise<Model<AttributeDoc>>;
  label: string;
  labelAr: string;
}

/**
 * Lazy-load models to prevent circular-dependency / hot-reload issues.
 * Each entry resolves the model only when accessed.
 */
const CATEGORIES: Record<string, CategoryMeta> = {
  "marital-statuses": {
    model: async () => (await import("@/models/MaritalStatus")).MaritalStatus as Model<AttributeDoc>,
    label: "Marital Status",
    labelAr: "الحالة الاجتماعية",
  },
  "major-subjects": {
    model: async () => (await import("@/models/MajorSubject")).MajorSubject as Model<AttributeDoc>,
    label: "Major Subject",
    labelAr: "التخصص الرئيسي",
  },
  "job-skills": {
    model: async () => (await import("@/models/JobSkill")).JobSkill as Model<AttributeDoc>,
    label: "Job Skill",
    labelAr: "مهارة وظيفية",
  },
  industries: {
    model: async () => (await import("@/models/Industry")).Industry as Model<AttributeDoc>,
    label: "Industry",
    labelAr: "الصناعة",
  },
  genders: {
    model: async () => (await import("@/models/Gender")).Gender as Model<AttributeDoc>,
    label: "Gender",
    labelAr: "الجنس",
  },
  "functional-areas": {
    model: async () => (await import("@/models/FunctionalArea")).FunctionalArea as unknown as Model<AttributeDoc>,
    label: "Functional Area",
    labelAr: "المجال الوظيفي",
  },
  "job-roles": {
    model: async () => (await import("@/models/JobRole")).JobRole as unknown as Model<AttributeDoc>,
    label: "Job Role / Position",
    labelAr: "المسمى الوظيفي",
  },
  "career-levels": {
    model: async () => (await import("@/models/CareerLevel")).CareerLevel as unknown as Model<AttributeDoc>,
    label: "Career Level",
    labelAr: "المستوى المهني",
  },
  "job-types": {
    model: async () => (await import("@/models/JobType")).JobType as unknown as Model<AttributeDoc>,
    label: "Job Type",
    labelAr: "نوع الوظيفة",
  },
  "job-shifts": {
    model: async () => (await import("@/models/JobShift")).JobShift as unknown as Model<AttributeDoc>,
    label: "Job Shift",
    labelAr: "نوبة العمل",
  },
  "job-experiences": {
    model: async () => (await import("@/models/JobExperience")).JobExperience as unknown as Model<AttributeDoc>,
    label: "Experience Range",
    labelAr: "سنوات الخبرة",
  },
  "degree-levels": {
    model: async () => (await import("@/models/DegreeLevel")).DegreeLevel as unknown as Model<AttributeDoc>,
    label: "Degree Level",
    labelAr: "المستوى الدراسي",
  },
  "degree-types": {
    model: async () => (await import("@/models/DegreeType")).DegreeType as unknown as Model<AttributeDoc>,
    label: "Degree Type",
    labelAr: "نوع الشهادة",
  },
  "result-types": {
    model: async () => (await import("@/models/ResultType")).ResultType as unknown as Model<AttributeDoc>,
    label: "Result Type",
    labelAr: "نوع النتيجة",
  },
  "language-levels": {
    model: async () => (await import("@/models/LanguageLevel")).LanguageLevel as unknown as Model<AttributeDoc>,
    label: "Language Level",
    labelAr: "مستوى اللغة",
  },
  "languages": {
    model: async () => (await import("@/models/Language")).Language as unknown as Model<AttributeDoc>,
    label: "Language",
    labelAr: "اللغة",
  },
  "salary-periods": {
    model: async () => (await import("@/models/SalaryPeriod")).SalaryPeriod as unknown as Model<AttributeDoc>,
    label: "Salary Period",
    labelAr: "فترة الراتب",
  },
  "currencies": {
    model: async () => (await import("@/models/Currency")).Currency as unknown as Model<AttributeDoc>,
    label: "Currency",
    labelAr: "العملة",
  },
  "ownership-types": {
    model: async () => (await import("@/models/OwnershipType")).OwnershipType as unknown as Model<AttributeDoc>,
    label: "Ownership Type",
    labelAr: "نوع الملكية",
  },
  "company-sizes": {
    model: async () => (await import("@/models/CompanySize")).CompanySize as unknown as Model<AttributeDoc>,
    label: "Company Size",
    labelAr: "حجم الشركة",
  },
  "benefits": {
    model: async () => (await import("@/models/Benefit")).Benefit as unknown as Model<AttributeDoc>,
    label: "Benefit",
    labelAr: "المزايا",
  },
  "visa-statuses": {
    model: async () => (await import("@/models/VisaStatus")).VisaStatus as unknown as Model<AttributeDoc>,
    label: "Visa Status",
    labelAr: "حالة الإقامة",
  },
  "notice-periods": {
    model: async () => (await import("@/models/NoticePeriod")).NoticePeriod as unknown as Model<AttributeDoc>,
    label: "Notice Period",
    labelAr: "فترة الإشعار",
  },
  "nationalities": {
    model: async () => (await import("@/models/Nationality")).Nationality as unknown as Model<AttributeDoc>,
    label: "Nationality",
    labelAr: "الجنسية",
  },
};

export function getCategory(slug: string): CategoryMeta | undefined {
  return CATEGORIES[slug];
}

export function getAllCategorySlugs(): string[] {
  return Object.keys(CATEGORIES);
}

export function getAllCategories(): Record<string, CategoryMeta> {
  return CATEGORIES;
}
