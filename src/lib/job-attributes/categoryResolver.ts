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
  "salary-periods": {
    model: async () => (await import("@/models/SalaryPeriod")).SalaryPeriod as Model<AttributeDoc>,
    label: "Salary Period",
    labelAr: "فترة الراتب",
  },
  "ownership-types": {
    model: async () => (await import("@/models/OwnershipType")).OwnershipType as Model<AttributeDoc>,
    label: "Ownership Type",
    labelAr: "نوع الملكية",
  },
  "marital-statuses": {
    model: async () => (await import("@/models/MaritalStatus")).MaritalStatus as Model<AttributeDoc>,
    label: "Marital Status",
    labelAr: "الحالة الاجتماعية",
  },
  "result-types": {
    model: async () => (await import("@/models/ResultType")).ResultType as Model<AttributeDoc>,
    label: "Result Type",
    labelAr: "نوع النتيجة",
  },
  "major-subjects": {
    model: async () => (await import("@/models/MajorSubject")).MajorSubject as Model<AttributeDoc>,
    label: "Major Subject",
    labelAr: "التخصص الرئيسي",
  },
  "degree-types": {
    model: async () => (await import("@/models/DegreeType")).DegreeType as Model<AttributeDoc>,
    label: "Degree Type",
    labelAr: "نوع الشهادة",
  },
  "degree-levels": {
    model: async () => (await import("@/models/DegreeLevel")).DegreeLevel as Model<AttributeDoc>,
    label: "Degree Level",
    labelAr: "مستوى الشهادة",
  },
  "job-shifts": {
    model: async () => (await import("@/models/JobShift")).JobShift as Model<AttributeDoc>,
    label: "Job Shift",
    labelAr: "نوبة العمل",
  },
  "job-types": {
    model: async () => (await import("@/models/JobType")).JobType as Model<AttributeDoc>,
    label: "Job Type",
    labelAr: "نوع الوظيفة",
  },
  "job-skills": {
    model: async () => (await import("@/models/JobSkill")).JobSkill as Model<AttributeDoc>,
    label: "Job Skill",
    labelAr: "مهارة وظيفية",
  },
  "job-experience": {
    model: async () => (await import("@/models/JobExperience")).JobExperience as Model<AttributeDoc>,
    label: "Job Experience",
    labelAr: "الخبرة الوظيفية",
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
    model: async () => (await import("@/models/FunctionalArea")).FunctionalArea as Model<AttributeDoc>,
    label: "Functional Area",
    labelAr: "المجال الوظيفي",
  },
  "career-levels": {
    model: async () => (await import("@/models/CareerLevel")).CareerLevel as Model<AttributeDoc>,
    label: "Career Level",
    labelAr: "المستوى المهني",
  },
  "language-levels": {
    model: async () => (await import("@/models/LanguageLevel")).LanguageLevel as Model<AttributeDoc>,
    label: "Language Level",
    labelAr: "مستوى اللغة",
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
