import { z } from "zod";
import { FAQ_CATEGORIES } from "@/lib/cms/faqCategories";

const bilingualText = (maxLen: number) =>
  z.string().max(maxLen).trim().optional().or(z.literal(""));

// Admins paste uploaded paths ("/uploads/a.png") as often as absolute URLs;
// z.string().url() rejected those and the UI only showed "Validation failed".
const urlOrPath = (maxLen = 2048) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .refine((v) => v.startsWith("/") || z.string().url().safeParse(v).success, {
      message: "Must be a URL (https://…) or a path starting with /",
    });

const sortActive = {
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
};

// ── Videos ──────────────────────────────────────────────────────────
export const videoCreateSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  url: z.string().url().max(2048),
  titleAr: bilingualText(200),
  description: z.string().max(2000).trim().optional().or(z.literal("")),
  descriptionAr: bilingualText(2000),
  ...sortActive,
});

export const videoUpdateSchema = videoCreateSchema.partial();

// ── Blogs ───────────────────────────────────────────────────────────
// The admin Tags box is a text input ("recruitment, ips"), and the edit dialog
// stringifies a saved array back to "a,b"; a bare z.array() rejected both.
const tagList = z.preprocess(
  (v) =>
    typeof v === "string"
      ? [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))]
      : v,
  z.array(z.string().trim().max(50)).max(20).optional(),
);

export const blogCreateSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  body: z.string().min(1).max(50000).trim(),
  titleAr: bilingualText(300),
  slug: z.string().max(300).trim().optional().or(z.literal("")),
  excerpt: z.string().max(1000).trim().optional().or(z.literal("")),
  excerptAr: bilingualText(1000),
  bodyAr: z.string().max(50000).trim().optional().or(z.literal("")),
  coverImage: urlOrPath().optional().or(z.literal("")),
  author: z.string().max(100).trim().optional().or(z.literal("")),
  tags: tagList,
  status: z.enum(["draft", "published"]).optional(),
});

export const blogUpdateSchema = blogCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ── Banners ─────────────────────────────────────────────────────────
export const bannerCreateSchema = z.object({
  image: urlOrPath(),
  title: bilingualText(200),
  titleAr: bilingualText(200),
  subtitle: bilingualText(500),
  subtitleAr: bilingualText(500),
  linkUrl: urlOrPath().optional().or(z.literal("")),
  linkText: bilingualText(100),
  linkTextAr: bilingualText(100),
  ...sortActive,
});

export const bannerUpdateSchema = bannerCreateSchema.partial();

// ── Testimonials ────────────────────────────────────────────────────
export const testimonialCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  quote: z.string().min(1).max(2000).trim(),
  nameAr: bilingualText(100),
  designation: z.string().max(100).trim().optional().or(z.literal("")),
  designationAr: bilingualText(100),
  company: z.string().max(100).trim().optional().or(z.literal("")),
  companyAr: bilingualText(100),
  quoteAr: bilingualText(2000),
  avatar: urlOrPath().optional().or(z.literal("")),
  rating: z.number().int().min(1).max(5).optional(),
  ...sortActive,
});

export const testimonialUpdateSchema = testimonialCreateSchema.partial();

// ── FAQs ────────────────────────────────────────────────────────────
// The admin form sends "" for an untouched select; treat it as "not sent".
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

const faqBase = z.object({
  question: z.string().min(1).max(500).trim(),
  answer: z.string().min(1).max(5000).trim(),
  questionAr: bilingualText(500),
  answerAr: bilingualText(5000),
  category: z.preprocess(blankToUndefined, z.enum(FAQ_CATEGORIES).optional()),
  ...sortActive,
});

export const faqCreateSchema = faqBase.extend({
  category: z.preprocess(blankToUndefined, z.enum(FAQ_CATEGORIES).default("general")),
});

// Built from the base, not faqCreateSchema.partial(): Zod 4 still applies a
// .default() inside .partial(), which reset every edited FAQ to "general".
export const faqUpdateSchema = faqBase.partial();

// ── Static Pages ────────────────────────────────────────────────────
// Edit-only: the legal pages are fixed (lib/cms/legalPages), so there is
// no create schema and no slug — an unknown `slug` key is stripped.
export const staticPageUpdateSchema = z
  .object({
    title: z.string().min(1).max(300).trim(),
    body: z.string().min(1).max(100000).trim(),
    titleAr: bilingualText(300),
    bodyAr: z.string().max(100000).trim().optional().or(z.literal("")),
    isActive: z.boolean().optional(),
  })
  .partial();
