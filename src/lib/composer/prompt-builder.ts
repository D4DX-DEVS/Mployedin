/**
 * Poster Composer — Prompt Builder
 * Builds optimized prompts for GPT-image-1 with smart job-aware context.
 */

import type { PosterType, PosterFormat, DesignStyle, PosterJobData, PosterTemplate } from "./types";
import { FORMAT_TO_AI_SIZE } from "./types";

// ── Template → artwork art-direction ───────────────────────────────────────
// Controls WHERE visual interest sits so it never fights the overlaid text, and
// what aesthetic each template's background should have.
const TEMPLATE_ART: Record<PosterTemplate, string> = {
  "platform-editorial":
    "Premium editorial advertising background. Keep the top-left and left edge calm and darker for text; concentrate decorative visual interest on the right and lower-right. Subtle gradients and refined shapes.",
  "bold-recruitment":
    "High-impact background with controlled geometric energy around the edges and lower-right. Keep a calm content-safe band through the vertical center for large typography. Strong but not noisy.",
  "minimal-professional":
    "Minimal background: generous negative space, restrained gradient or soft light, very low detail. Any subtle interest sits in a corner, away from the center and bottom.",
  "tech-signal":
    "Sophisticated technology abstraction: subtle network lines, fine grids, faint data/code motifs concentrated on the right and lower-right. NO giant glowing circles, NO HUD or dashboard, NO fake charts, NO heavy neon. Calm, dark, upmarket.",
};

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

// Dominant color palettes — rotated per generation (paletteSeed) so re-generating
// or the two side-by-side variations don't all come back the same dark-blue look.
const PALETTES = [
  "deep navy and steel blue with cool cyan highlights",
  "charcoal black with warm amber and gold accents",
  "deep emerald and teal with soft mint highlights",
  "burgundy and plum with rose-gold accents",
  "midnight indigo and violet with a subtle magenta glow",
  "slate grey and copper with warm bronze tones",
  "forest green and warm cream, earthy and organic",
  "deep teal and coral with sunset warmth",
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
  template?: PosterTemplate;
  /** Rotates palette + visual approach so generations don't all look alike. Defaults to 0. */
  paletteSeed?: number;
}): string {
  const { type, format, style, description, jobData, variationIndex, template, paletteSeed = 0 } = opts;
  const artDirection = TEMPLATE_ART[template ?? "platform-editorial"];
  const palette = PALETTES[(paletteSeed + variationIndex) % PALETTES.length];

  const aiSize = FORMAT_TO_AI_SIZE[format];
  const aspectLabel = aiSize === "1024x1024" ? "square (1:1)" : aiSize === "1536x1024" ? "landscape (16:9)" : "portrait (9:16)";

  // Smart job-aware context (invisible to employer)
  const jobContext = buildJobContext(jobData);

  const parts = [
    // Lead with the strongest constraint. Image models (esp. Gemini) treat the word
    // "poster" as a cue to bake in headline text — describe an abstract background instead.
    "Generate an abstract decorative background image. This is NOT a poster or flyer.",
    "It must contain ZERO text — all wording is added programmatically afterwards.",
    "",
    `Mood / theme: ${description || "Professional and modern"}`,
    `Aesthetic: ${STYLE_PROMPTS[style]}`,
    `Atmosphere: ${TYPE_PROMPTS[type]}`,
    "",
    jobContext,
    "",
    `Aspect ratio: ${aspectLabel}`,
    `Composition: ${artDirection}`,
    `Dominant color palette: ${palette}. Commit to this palette — do NOT default to generic dark blue. If "Mood / theme" above names specific colors, follow those instead and ignore this palette.`,
    `Visual approach: ${VARIATION_SUFFIXES[(paletteSeed + variationIndex) % VARIATION_SUFFIXES.length]}`,
    "",
    "ABSOLUTE REQUIREMENTS:",
    "- NO text of any kind: no words, letters, numbers, captions, labels, or writing.",
    "- Do NOT render any headline, 'WE ARE HIRING', job title, company name, or call-to-action.",
    "- NO logos, watermarks, badges, or recognizable brand symbols.",
    "- Only abstract shapes, gradients, textures, lighting and color — like a plain wallpaper.",
    "- Keep the composition mostly open with calm darker regions so white text overlays cleanly.",
    "- Premium, professional corporate feel.",
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
