/**
 * Poster Composer — Prompt Builder
 * Builds optimized prompts for GPT-image-1 with smart job-aware context.
 */

import type { PosterType, PosterFormat, DesignStyle, PosterJobData } from "./types";
import { FORMAT_TO_AI_SIZE } from "./types";

// ── Design Style → Prompt Modifiers ────────────────────────────────────────
const STYLE_PROMPTS: Record<DesignStyle, string> = {
  professional: "Corporate, clean lines, subtle gradients, navy and grey tones, polished and trustworthy",
  modern: "Contemporary, geometric shapes, vibrant tech colors, digital-forward aesthetic",
  creative: "Artistic, colorful, dynamic composition, creative industry feel, bold visual storytelling",
  minimal: "White space, simple, monochrome with one accent color, elegant restraint",
  bold: "Strong saturated colors, high contrast, impactful composition, energetic and attention-grabbing",
  luxury: "Premium, gold or metallic accents, sophisticated dark elegant background, high-end feel",
};

// ── Poster Type → Context Additions ────────────────────────────────────────
const TYPE_PROMPTS: Record<PosterType, string> = {
  "single-job": "Professional workspace environment, single role emphasis, focused and inviting",
  "bulk-hiring": "Growing team energy, multiple opportunities, bustling collaborative workplace",
  "urgent-hiring": "Dynamic urgency, bold warm colors, time-sensitive feel, call-to-action energy",
  "walk-in-interview": "Welcoming office entrance, open atmosphere, approachable and friendly setting",
};

// ── Variation Suffixes (2 initial + 2 more) ────────────────────────────────
const VARIATION_SUFFIXES = [
  "Emphasis on abstract geometric shapes, clean lines, and structured composition",
  "Emphasis on smooth gradients, color flow, depth and visual dimension",
  "Emphasis on realistic professional photography style, natural lighting",
  "Emphasis on subtle textured patterns with layered visual elements",
];

/**
 * Build an AI image generation prompt for a poster background.
 *
 * Key principle: NO text, letters, words, or numbers in the generated image.
 * All text is overlaid programmatically by the layout engine.
 */
export function buildPosterPrompt(opts: {
  type: PosterType;
  format: PosterFormat;
  style: DesignStyle;
  description: string;
  jobData: PosterJobData;
  variationIndex: number;
}): string {
  const { type, format, style, description, jobData, variationIndex } = opts;

  const aiSize = FORMAT_TO_AI_SIZE[format];
  const aspectLabel = aiSize === "1024x1024" ? "square (1:1)" : aiSize === "1536x1024" ? "landscape (16:9)" : "portrait (9:16)";

  // Smart job-aware context (invisible to employer)
  const jobContext = buildJobContext(jobData);

  const parts = [
    "Create a professional recruitment poster background image.",
    "",
    `Style description: ${description || "Professional and modern"}`,
    `Design aesthetic: ${STYLE_PROMPTS[style]}`,
    `Poster context: ${TYPE_PROMPTS[type]}`,
    "",
    jobContext,
    "",
    `Aspect ratio: ${aspectLabel}`,
    `Visual approach: ${VARIATION_SUFFIXES[variationIndex % VARIATION_SUFFIXES.length]}`,
    "",
    "CRITICAL RULES:",
    "- DO NOT include any text, letters, words, numbers, or characters of any kind.",
    "- DO NOT include any logos, brand marks, or recognizable symbols.",
    "- The image must be purely visual — suitable as a background for overlaying recruitment text.",
    "- Ensure there is adequate dark or semi-transparent areas for white text readability.",
    "- Image should feel premium and professional, suitable for corporate recruitment.",
  ];

  return parts.join("\n");
}

/**
 * Build smart job-aware context from job data.
 * Auto-injected into prompt to improve relevance (employer doesn't see this).
 */
function buildJobContext(jobData: PosterJobData): string {
  const parts: string[] = ["Contextual guidance (for visual mood only):"];

  if (jobData.industry || jobData.category) {
    parts.push(`- Industry: ${jobData.industry || jobData.category}`);
  }

  if (jobData.country) {
    parts.push(`- Market: ${jobData.country}`);
  }

  if (jobData.employmentType) {
    const typeLabel = jobData.employmentType.replace(/_/g, " ");
    parts.push(`- Position type: ${typeLabel}`);
  }

  // Infer visual mood from job category
  const category = (jobData.category || jobData.industry || "").toLowerCase();
  if (category.includes("tech") || category.includes("software") || category.includes("it")) {
    parts.push("- Visual mood: Modern technology, digital innovation, clean tech aesthetic");
  } else if (category.includes("health") || category.includes("medical") || category.includes("pharma")) {
    parts.push("- Visual mood: Healthcare, trust, clean clinical environment");
  } else if (category.includes("finance") || category.includes("bank") || category.includes("accounting")) {
    parts.push("- Visual mood: Financial services, stability, corporate trust");
  } else if (category.includes("creative") || category.includes("design") || category.includes("media")) {
    parts.push("- Visual mood: Creative industry, artistic expression, vibrant energy");
  } else if (category.includes("education") || category.includes("teach")) {
    parts.push("- Visual mood: Education, growth, knowledge, warm academic environment");
  } else if (category.includes("retail") || category.includes("sales") || category.includes("hospitality")) {
    parts.push("- Visual mood: Customer-facing, energetic, welcoming environment");
  } else if (category.includes("construction") || category.includes("engineering") || category.includes("manufacturing")) {
    parts.push("- Visual mood: Industrial strength, precision, structural solidity");
  }

  return parts.join("\n");
}
