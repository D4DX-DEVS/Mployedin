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
export type PosterLayout = "layout-a" | "layout-b" | "layout-c" | "layout-d";

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
