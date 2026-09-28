import mongoose, { Document, Schema, type Model, type SchemaDefinition } from "mongoose";

/**
 * Shared shape for every lookup / master-data attribute (industries, job
 * types, career levels, …). Each concrete model is a thin wrapper so the
 * generic admin CRUD in /api/admin/job-attributes/[category] works unchanged.
 */
export interface IAttribute extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const attributeFields = {
  name: { type: String, required: true, trim: true },
  nameAr: { type: String, default: "", trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
} as const;

/**
 * Build (or reuse) an attribute model. `extra` adds category-specific fields
 * on top of the common ones; `collection` pins the Mongo collection name when
 * it differs from mongoose's default pluralisation.
 */
export function createAttributeModel<T extends IAttribute = IAttribute>(
  modelName: string,
  extra: SchemaDefinition = {},
  collection?: string,
): Model<T> {
  if (mongoose.models[modelName]) return mongoose.models[modelName] as Model<T>;
  const schema = new Schema<T>(
    { ...attributeFields, ...extra } as SchemaDefinition<T>,
    { timestamps: true, ...(collection ? { collection } : {}) },
  );
  schema.index({ isActive: 1, sortOrder: 1 });
  return mongoose.model<T>(modelName, schema);
}
