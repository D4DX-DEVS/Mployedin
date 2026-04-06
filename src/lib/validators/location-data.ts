import { z } from "zod";
import { commonSchemas } from "./index";

const locNameBase = {
  nameAr: z.string().max(100).trim().optional().or(z.literal("")),
  slug: z.string().max(100).trim().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
};

// ── Cities ──────────────────────────────────────────────────────────
export const cityCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  stateId: commonSchemas.objectId,
  ...locNameBase,
});

export const cityUpdateSchema = cityCreateSchema.partial();

// ── States ──────────────────────────────────────────────────────────
export const stateCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  countryId: commonSchemas.objectId,
  ...locNameBase,
});

export const stateUpdateSchema = stateCreateSchema.partial();

// ── Countries ───────────────────────────────────────────────────────
export const countryCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  code: z.string().min(2).max(3).trim().toUpperCase(),
  nameAr: z.string().max(100).trim().optional().or(z.literal("")),
  phoneCode: z.string().max(10).trim().optional().or(z.literal("")),
  currency: z.string().max(50).trim().optional().or(z.literal("")),
  currencyCode: z.string().max(5).trim().optional().or(z.literal("")),
  currencySymbol: z.string().max(5).trim().optional().or(z.literal("")),
  thousandSeparator: z.string().max(1).optional().default(","),
  decimalSeparator: z.string().max(1).optional().default("."),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export const countryUpdateSchema = countryCreateSchema.partial();

// ── Job Attributes (generic across all categories) ──────────────────
export const jobAttributeCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  nameAr: z.string().max(100).trim().optional().or(z.literal("")),
  slug: z.string().max(100).trim().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export const jobAttributeUpdateSchema = jobAttributeCreateSchema.partial();
