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
