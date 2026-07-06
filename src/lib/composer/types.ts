/**
 * Poster Composer — Shared Types
 * Reusable types for the Recruitment Marketing Engine.
 */

// ── Poster Types (v1: 4 core, v1.1: 4 more) ──────────────────────────────
export type PosterType =
  | "single-job"
  | "bulk-hiring"
  | "urgent-hiring"
  | "walk-in-interview";

// v1.1 additions (shown as "Coming Soon")
export type PosterTypeFuture =
  | "we-are-hiring"
  | "event-career-fair"
  | "internship"
  | "social-story";

export type PosterTypeAll = PosterType | PosterTypeFuture;

// ── Output Formats ─────────────────────────────────────────────────────────
export type PosterFormat =
  | "instagram-post"
  | "instagram-story"
  | "linkedin-post"
  | "a4-print";

export const FORMAT_DIMENSIONS: Record<PosterFormat, { width: number; height: number; label: string }> = {
  "instagram-post": { width: 1080, height: 1080, label: "Instagram Post" },
  "instagram-story": { width: 1080, height: 1920, label: "Instagram Story" },
  "linkedin-post": { width: 1200, height: 627, label: "LinkedIn Post" },
  "a4-print": { width: 2480, height: 3508, label: "A4 Print" },
};

// Maps to OpenAI image sizes (closest supported dimensions)
export const FORMAT_TO_AI_SIZE: Record<PosterFormat, "1024x1024" | "1536x1024" | "1024x1536"> = {
  "instagram-post": "1024x1024",
  "instagram-story": "1024x1536",
  "linkedin-post": "1536x1024",
  "a4-print": "1024x1536",
};

// ── Design Styles ──────────────────────────────────────────────────────────
export type DesignStyle =
  | "professional"
  | "modern"
  | "creative"
  | "minimal"
  | "bold"
  | "luxury";

// ── Layouts ────────────────────────────────────────────────────────────────
// Internal geometry ids (persisted in the DB — do NOT rename or old records break).
export type PosterLayout = "layout-a" | "layout-b" | "layout-c" | "layout-d";

// ── Templates (user-facing composition presets) ────────────────────────────
// A template = a named, art-directed composition. It maps to an internal layout
// geometry; the layout ids stay stable for storage, the templates are the UI.
export type PosterTemplate =
  | "platform-editorial"
  | "bold-recruitment"
  | "minimal-professional"
  | "tech-signal";

export interface PosterTemplateMeta {
  id: PosterTemplate;
  label: string;
  description: string;
  layout: PosterLayout;
  /** lowercase substrings matched against job category/industry for auto-recommend */
  recommendedFor: string[];
}

export const TEMPLATES: PosterTemplateMeta[] = [
  {
    id: "platform-editorial",
    label: "Platform Editorial",
    description: "Premium corporate campaign. Strong left-aligned typography.",
    layout: "layout-a",
    recommendedFor: ["finance", "management", "corporate", "consulting", "bank"],
  },
  {
    id: "bold-recruitment",
    label: "Bold Recruitment",
    description: "High-impact. Oversized centered WE ARE HIRING.",
    layout: "layout-c",
    recommendedFor: ["sales", "retail", "operations", "hospitality", "startup"],
  },
  {
    id: "minimal-professional",
    label: "Minimal Professional",
    description: "Clean, spacious. Job title is the hero.",
    layout: "layout-b",
    recommendedFor: ["executive", "legal", "healthcare", "medical"],
  },
  {
    id: "tech-signal",
    label: "Tech Signal",
    description: "Modern tech grid. Subtle data/software motifs.",
    layout: "layout-d",
    recommendedFor: ["tech", "software", "engineering", "cyber", "data", "devops", "it", "ai"],
  },
];

export function templateToLayout(id: PosterTemplate): PosterLayout {
  return TEMPLATES.find((t) => t.id === id)?.layout ?? "layout-a";
}

/** Suggest a template from job category/industry (does not override an explicit choice). */
export function recommendTemplate(category?: string): PosterTemplate {
  const c = (category || "").toLowerCase();
  const hit = TEMPLATES.find((t) => t.recommendedFor.some((k) => c.includes(k)));
  return hit?.id ?? "platform-editorial";
}

// ── Per-element overrides (poster editor: click a text block, tweak it) ─────
// Kept format-safe: size is a multiplier over the layout default (not absolute
// px), so one override reads correctly across Instagram/Story/LinkedIn/A4.
export type PosterElementId =
  | "platformLogo" | "employerLogo" | "qrCode"
  | "companyName" | "headline" | "jobTitle" | "summary"
  | "details" | "requirements" | "ctaTitle" | "ctaSubtitle" | "footer";

export interface ElementOverride {
  text?: string; // display-text override (never touches the canonical Job record)
  x?: number; // position % (drag) — overrides layout left
  y?: number; // position % (drag) — overrides layout top
  fontScale?: number; // text: × font size; image: × box size (clamp 0.5–2.5 in UI)
  fontWeight?: number; // 400–800 (text only)
  color?: string; // hex (text only)
  hidden?: boolean;
}

// Which elements the inspector exposes. kind drives which controls show;
// editableText gates the free-text field (derived blocks like summary are style-only).
export const POSTER_ELEMENTS: { id: PosterElementId; label: string; kind: "text" | "image"; editableText: boolean }[] = [
  { id: "platformLogo", label: "Mployedin logo", kind: "image", editableText: false },
  { id: "employerLogo", label: "Employer logo", kind: "image", editableText: false },
  { id: "companyName", label: "Company name", kind: "text", editableText: true },
  { id: "headline", label: "Headline", kind: "text", editableText: true },
  { id: "jobTitle", label: "Job title", kind: "text", editableText: true },
  { id: "summary", label: "Summary", kind: "text", editableText: false },
  { id: "details", label: "Details", kind: "text", editableText: false },
  { id: "requirements", label: "Requirements", kind: "text", editableText: false },
  { id: "ctaTitle", label: "CTA heading", kind: "text", editableText: true },
  { id: "ctaSubtitle", label: "CTA subtitle", kind: "text", editableText: true },
  { id: "qrCode", label: "QR code", kind: "image", editableText: false },
  { id: "footer", label: "Footer", kind: "text", editableText: true },
];

// ── Post-generation appearance overrides (poster editor) ───────────────────
// Applied over the layout defaults at render + export time. Position/composition
// is changed by switching template (PosterLayout), not per-element drag.
export interface PosterStyleOverrides {
  fontFamily?: string; // CSS font stack (OS fonts only → export-safe)
  textTheme?: "white" | "warm" | "sky" | "mono-dark";
  bodyWeight?: 400 | 500 | 700; // weight for summary/metadata/requirements ("plain" → bold)
  overlay?: "none" | "light" | "medium" | "heavy"; // background scrim strength
  elements?: Partial<Record<PosterElementId, ElementOverride>>; // per-block tweaks
}

// Quick-apply accent swatches for the color picker (includes the requested blue).
export const POSTER_SWATCHES: string[] = [
  "#ffffff", "#e5e7eb", "#94a3b8", "#0f172a", "#000000",
  "#2563eb", "#1d4ed8", "#0ea5e9", "#38bdf8", "#06b6d4",
  "#16a34a", "#22c55e", "#84cc16", "#eab308", "#f59e0b",
  "#f97316", "#dc2626", "#ec4899", "#a855f7", "#7c3aed",
  "#fef3c7", "#fde68a", "#fca5a5", "#bae6fd", "#bbf7d0",
];

export const POSTER_FONTS: { id: string; label: string; stack: string }[] = [
  { id: "sans", label: "Sans", stack: 'Inter, "Segoe UI", system-ui, sans-serif' },
  { id: "serif", label: "Serif", stack: 'Georgia, "Times New Roman", serif' },
  { id: "rounded", label: "Rounded", stack: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif' },
  { id: "mono", label: "Mono", stack: '"Courier New", ui-monospace, monospace' },
];

// ── Show Fields (configurable by employer) ─────────────────────────────────
export interface ShowFields {
  salary: boolean;
  location: boolean;
  experience: boolean;
  skills: boolean;
}

// QR + Apply URL + Mployedin branding = ALWAYS ON (not in ShowFields)

// ── Generation Request ─────────────────────────────────────────────────────
export interface PosterGenerationRequest {
  type: PosterType;
  formats: PosterFormat[];
  description: string;
  style: DesignStyle;
  template: PosterTemplate;
  jobId: string;
  showFields: ShowFields;
}

// ── Variation ──────────────────────────────────────────────────────────────
export interface PosterVariation {
  id: string;
  backgroundUrl: string;
  layout: PosterLayout;
}

// ── Job data passed to poster system ───────────────────────────────────────
export interface PosterJobData {
  title: string;
  companyName: string;
  employmentType?: string;
  location?: string;
  salary?: string;
  experience?: string;
  skills?: string[];
  industry?: string;
  category?: string;
  country?: string;
}

// ── Credits ────────────────────────────────────────────────────────────────
export interface PosterCredits {
  used: number;
  limit: number;
  resetDate: Date;
}

export const PLAN_CREDIT_LIMITS: Record<string, number> = {
  free: 5,
  basic: 20,
  silver: 20,
  gold: 100,
  premium: 100,
  platinum: 300,
};

// ── Poster Type Metadata ───────────────────────────────────────────────────
export interface PosterTypeMeta {
  id: PosterTypeAll;
  label: string;
  labelAr: string;
  description: string;
  icon: string;
  available: boolean;
}

export const POSTER_TYPES: PosterTypeMeta[] = [
  { id: "single-job", label: "Single Job", labelAr: "وظيفة واحدة", description: "One job position", icon: "Briefcase", available: true },
  { id: "bulk-hiring", label: "Bulk Hiring", labelAr: "توظيف جماعي", description: "Multiple positions", icon: "Users", available: true },
  { id: "urgent-hiring", label: "Urgent Hiring", labelAr: "توظيف عاجل", description: "Time-sensitive", icon: "AlertTriangle", available: true },
  { id: "walk-in-interview", label: "Walk-In Interview", labelAr: "مقابلة مباشرة", description: "On-site hiring", icon: "DoorOpen", available: true },
  { id: "we-are-hiring", label: "We Are Hiring", labelAr: "نحن نوظف", description: "General announcement", icon: "Megaphone", available: false },
  { id: "event-career-fair", label: "Event / Career Fair", labelAr: "معرض وظيفي", description: "Recruitment event", icon: "Calendar", available: false },
  { id: "internship", label: "Internship", labelAr: "تدريب", description: "Internship hiring", icon: "GraduationCap", available: false },
  { id: "social-story", label: "Social Story", labelAr: "قصة اجتماعية", description: "9:16 Story format", icon: "Smartphone", available: false },
];
