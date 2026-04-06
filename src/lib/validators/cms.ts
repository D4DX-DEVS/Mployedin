import { z } from "zod";

const bilingualText = (maxLen: number) =>
  z.string().max(maxLen).trim().optional().or(z.literal(""));

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
  thumbnail: z.string().url().max(2048).optional().or(z.literal("")),
  ...sortActive,
});

export const videoUpdateSchema = videoCreateSchema.partial();

// ── Blogs ───────────────────────────────────────────────────────────
export const blogCreateSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  body: z.string().min(1).max(50000).trim(),
  titleAr: bilingualText(300),
  slug: z.string().max(300).trim().optional().or(z.literal("")),
  excerpt: z.string().max(1000).trim().optional().or(z.literal("")),
  excerptAr: bilingualText(1000),
  bodyAr: z.string().max(50000).trim().optional().or(z.literal("")),
  coverImage: z.string().url().max(2048).optional().or(z.literal("")),
  author: z.string().max(100).trim().optional().or(z.literal("")),
  tags: z.array(z.string().max(50).trim()).max(20).optional(),
  status: z.enum(["draft", "published"]).optional(),
});

export const blogUpdateSchema = blogCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ── Banners ─────────────────────────────────────────────────────────
export const bannerCreateSchema = z.object({
  image: z.string().url().max(2048),
  title: bilingualText(200),
  titleAr: bilingualText(200),
  subtitle: bilingualText(500),
  subtitleAr: bilingualText(500),
  imageMobile: z.string().url().max(2048).optional().or(z.literal("")),
  linkUrl: z.string().url().max(2048).optional().or(z.literal("")),
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
  avatar: z.string().url().max(2048).optional().or(z.literal("")),
  rating: z.number().int().min(1).max(5).optional(),
  ...sortActive,
});

export const testimonialUpdateSchema = testimonialCreateSchema.partial();

// ── FAQs ────────────────────────────────────────────────────────────
export const faqCreateSchema = z.object({
  question: z.string().min(1).max(500).trim(),
  answer: z.string().min(1).max(5000).trim(),
  questionAr: bilingualText(500),
  answerAr: bilingualText(5000),
  category: z.string().max(50).trim().optional().default("general"),
  ...sortActive,
});

export const faqUpdateSchema = faqCreateSchema.partial();

// ── Static Pages ────────────────────────────────────────────────────
export const staticPageCreateSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  body: z.string().min(1).max(100000).trim(),
  titleAr: bilingualText(300),
  slug: z.string().max(300).trim().optional().or(z.literal("")),
  bodyAr: z.string().max(100000).trim().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

export const staticPageUpdateSchema = staticPageCreateSchema.partial();
