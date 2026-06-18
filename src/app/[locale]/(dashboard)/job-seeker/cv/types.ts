/* ── CV Builder Shared Types ── */

export interface WorkExperience {
  jobTitle: string;
  company: string;
  country: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
}

export interface Education {
  degree: string;
  institution: string;
  field: string;
  graduationDate: string;
  grade: string;
}

export interface LanguageSkill {
  language: string;
  proficiency: "basic" | "conversational" | "professional" | "native";
}

export interface Project {
  title: string;
  description: string;
  techStack: string[];
  projectUrl: string;
  repoUrl: string;
}

export interface SocialLink {
  label: string;
  url: string;
}

export interface CVForm {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
  currentLocation: string;
  headline: string;
  photo: string;
  linkedin: string;
  portfolio: string;
  additionalLinks: SocialLink[];
  skills: string[];
  experience: WorkExperience[];
  education: Education[];
  languages: LanguageSkill[];
  certifications: string[];
  projects: Project[];
}

/* ── Formatting Options ── */

export type FontFamily = "inter" | "georgia" | "merriweather" | "roboto" | "playfair";
export type FontSize = "small" | "medium" | "large";
export type SectionSpacing = "compact" | "medium" | "spacious";
export type PageFormat = "a4" | "letter";
export type DateFormat = "short" | "long" | "numeric";
export type LineHeight = "tight" | "normal" | "relaxed";
export type PageMargin = "narrow" | "normal" | "wide";

/** Reorderable resume body sections (header, contact & summary stay fixed at the top). */
export type SectionKey =
  | "experience" | "education" | "skills"
  | "projects" | "languages" | "certifications";

export interface ThemeColor {
  id: string;
  label: string;
  primary: string;   // accent color
  light: string;     // light tint for badges/bg
  css: string;        // tailwind text class
  bg: string;         // tailwind bg class
  border: string;     // tailwind border class
}

export interface FormattingOptions {
  font: FontFamily;
  fontSize: FontSize;
  spacing: SectionSpacing;
  themeColor: string; // ThemeColor.id
  /** Paper size for preview + PDF export. */
  pageFormat: PageFormat;
  /** How experience / education dates are rendered. */
  dateFormat: DateFormat;
  /** Body line-height. */
  lineHeight: LineHeight;
  /** Page margins / padding. */
  margin: PageMargin;
  /** Order of the reorderable body sections. Falls back to DEFAULT_SECTION_ORDER. */
  sectionOrder?: SectionKey[];
}

/* ── Template Definitions ── */

export type TemplateTier = "free" | "pro";

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  /** Retained for backwards-compatibility; all templates are now free. */
  tier: TemplateTier;
  /** Whether this template renders a profile photo when one is provided. */
  supportsPhoto?: boolean;
}

/* ── Constants ── */

export const THEME_COLORS: ThemeColor[] = [
  { id: "blue",    label: "Blue",    primary: "#2563eb", light: "#eff6ff", css: "text-blue-600",    bg: "bg-blue-600",    border: "border-blue-600" },
  { id: "indigo",  label: "Indigo",  primary: "#4f46e5", light: "#eef2ff", css: "text-indigo-600",  bg: "bg-indigo-600",  border: "border-indigo-600" },
  { id: "violet",  label: "Violet",  primary: "#7c3aed", light: "#f5f3ff", css: "text-violet-600",  bg: "bg-violet-600",  border: "border-violet-600" },
  { id: "purple",  label: "Purple",  primary: "#9333ea", light: "#faf5ff", css: "text-purple-600",  bg: "bg-purple-600",  border: "border-purple-600" },
  { id: "fuchsia", label: "Fuchsia", primary: "#c026d3", light: "#fdf4ff", css: "text-fuchsia-600", bg: "bg-fuchsia-600", border: "border-fuchsia-600" },
  { id: "rose",    label: "Rose",    primary: "#e11d48", light: "#fff1f2", css: "text-rose-600",    bg: "bg-rose-600",    border: "border-rose-600" },
  { id: "red",     label: "Red",     primary: "#dc2626", light: "#fef2f2", css: "text-red-600",     bg: "bg-red-600",     border: "border-red-600" },
  { id: "orange",  label: "Orange",  primary: "#ea580c", light: "#fff7ed", css: "text-orange-600",  bg: "bg-orange-600",  border: "border-orange-600" },
  { id: "amber",   label: "Amber",   primary: "#b45309", light: "#fffbeb", css: "text-amber-700",   bg: "bg-amber-700",   border: "border-amber-700" },
  { id: "green",   label: "Green",   primary: "#16a34a", light: "#f0fdf4", css: "text-green-700",   bg: "bg-green-700",   border: "border-green-700" },
  { id: "emerald", label: "Emerald", primary: "#059669", light: "#ecfdf5", css: "text-emerald-600", bg: "bg-emerald-600", border: "border-emerald-600" },
  { id: "teal",    label: "Teal",    primary: "#0d9488", light: "#f0fdfa", css: "text-teal-600",    bg: "bg-teal-600",    border: "border-teal-600" },
  { id: "cyan",    label: "Cyan",    primary: "#0891b2", light: "#ecfeff", css: "text-cyan-600",    bg: "bg-cyan-600",    border: "border-cyan-600" },
  { id: "slate",   label: "Slate",   primary: "#475569", light: "#f8fafc", css: "text-slate-600",   bg: "bg-slate-600",   border: "border-slate-600" },
];

export const FONT_OPTIONS: { value: FontFamily; label: string; stack: string }[] = [
  { value: "inter",        label: "Inter",        stack: "'Inter', system-ui, sans-serif" },
  { value: "georgia",      label: "Georgia",      stack: "'Georgia', serif" },
  { value: "merriweather", label: "Merriweather", stack: "'Merriweather', serif" },
  { value: "roboto",       label: "Roboto",       stack: "'Roboto', sans-serif" },
  { value: "playfair",     label: "Playfair",     stack: "'Playfair Display', serif" },
];

export const TEMPLATES: TemplateDefinition[] = [
  { id: "classic",      name: "Classic",      description: "Clean professional layout with blue accents",     tier: "free" },
  { id: "modern",       name: "Modern",       description: "Contemporary design with sidebar layout",         tier: "free", supportsPhoto: true },
  { id: "minimal",      name: "Minimal",      description: "Simple, ATS-friendly single-column design",       tier: "free" },
  { id: "executive",    name: "Executive",    description: "Premium two-column layout for senior roles",      tier: "free", supportsPhoto: true },
  { id: "creative",     name: "Creative",     description: "Bold design with colored header and skill bars",  tier: "free", supportsPhoto: true },
  { id: "elegant",      name: "Elegant",      description: "Refined serif typography with gold accents",      tier: "free" },
  { id: "professional", name: "Professional", description: "Photo header with two-column body for impact",    tier: "free", supportsPhoto: true },
  { id: "compact",      name: "Compact",      description: "Dense single-column layout that fits more on a page", tier: "free" },
  { id: "timeline",     name: "Timeline",     description: "Single column with a vertical timeline accent",   tier: "free" },
  { id: "academic",     name: "Academic",     description: "Formal serif CV for academic and research roles", tier: "free" },
  { id: "technical",    name: "Technical",    description: "Developer-focused layout with mono accents",      tier: "free" },
  { id: "banner",       name: "Banner",       description: "Bold full-width colored name band, single column", tier: "free", supportsPhoto: true },
];

/** Reorderable body sections in their default order, with default English labels. */
export const SECTION_META: { key: SectionKey; label: string }[] = [
  { key: "experience",     label: "Work Experience" },
  { key: "education",      label: "Education" },
  { key: "skills",         label: "Skills" },
  { key: "projects",       label: "Projects" },
  { key: "languages",      label: "Languages" },
  { key: "certifications", label: "Certifications" },
];

export const DEFAULT_SECTION_ORDER: SectionKey[] = SECTION_META.map((s) => s.key);

export const DEFAULT_FORMATTING: FormattingOptions = {
  font: "inter",
  fontSize: "medium",
  spacing: "medium",
  themeColor: "blue",
  pageFormat: "a4",
  dateFormat: "short",
  lineHeight: "normal",
  margin: "normal",
  sectionOrder: DEFAULT_SECTION_ORDER,
};

export const EMPTY_EXPERIENCE: WorkExperience = {
  jobTitle: "", company: "", country: "", startDate: "", endDate: "", isCurrent: false, description: "",
};
export const EMPTY_EDUCATION: Education = {
  degree: "", institution: "", field: "", graduationDate: "", grade: "",
};
export const EMPTY_LANGUAGE: LanguageSkill = { language: "", proficiency: "conversational" };
export const EMPTY_PROJECT: Project = { title: "", description: "", techStack: [], projectUrl: "", repoUrl: "" };
export const EMPTY_LINK: SocialLink = { label: "", url: "" };

export const PROFICIENCY_OPTIONS = [
  { value: "basic", label: "Basic" },
  { value: "conversational", label: "Conversational" },
  { value: "professional", label: "Professional" },
  { value: "native", label: "Native" },
];

/** Normalize a date string to YYYY-MM format for <input type="month"> */
export function toMonthInput(val: string | undefined): string {
  if (!val) return "";
  if (/^\d{4}-\d{2}$/.test(val)) return val;
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 7);
  if (/^\d{4}$/.test(val)) return `${val}-07`;
  return "";
}

/** Lighten a hex color toward white (~90%) to produce a soft badge tint. */
function hexToTint(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return "#eff6ff";
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255, g = (int >> 8) & 255, b = int & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * 0.9);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Resolve a themeColor value (preset id OR custom #rrggbb hex) to a ThemeColor. */
export function resolveTheme(themeColor: string): ThemeColor {
  const preset = THEME_COLORS.find((c) => c.id === themeColor);
  if (preset) return preset;
  if (/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
    return {
      id: themeColor, label: "Custom", primary: themeColor, light: hexToTint(themeColor),
      css: "", bg: "", border: "",
    };
  }
  return THEME_COLORS[0];
}

/** Get the resolved ThemeColor for current formatting */
export function getTheme(formatting: FormattingOptions): ThemeColor {
  return resolveTheme(formatting.themeColor);
}

/**
 * Normalize a user-entered URL into a safe, clickable href.
 * Adds https:// to bare domains/handles and only allows http(s)/mailto/tel.
 * Returns "" for anything that can't be made into a safe link.
 */
export function normalizeUrl(url: string | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  // Reject dangerous schemes (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return "";
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/** Get CSS font-family for current formatting */
export function getFontStack(formatting: FormattingOptions): string {
  return FONT_OPTIONS.find((f) => f.value === formatting.font)?.stack ?? FONT_OPTIONS[0].stack;
}

/** Get font-size scale factor */
export function getFontScale(formatting: FormattingOptions): number {
  return formatting.fontSize === "small" ? 0.9 : formatting.fontSize === "large" ? 1.1 : 1;
}

/** Get section gap based on spacing */
export function getSectionGap(formatting: FormattingOptions): string {
  return formatting.spacing === "compact" ? "12px" : formatting.spacing === "spacious" ? "28px" : "20px";
}

/* ── Customize-panel option lists ── */

export const PAGE_FORMAT_OPTIONS: { value: PageFormat; label: string }[] = [
  { value: "a4",     label: "A4" },
  { value: "letter", label: "US Letter" },
];

export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: "short",   label: "Jan 2024" },
  { value: "long",    label: "January 2024" },
  { value: "numeric", label: "01/2024" },
];

export const LINE_HEIGHT_OPTIONS: { value: LineHeight; label: string }[] = [
  { value: "tight",   label: "Tight" },
  { value: "normal",  label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

export const MARGIN_OPTIONS: { value: PageMargin; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide",   label: "Wide" },
];

/** Resolve body line-height multiplier. */
export function getLineHeight(formatting: FormattingOptions): number {
  return formatting.lineHeight === "tight" ? 1.3 : formatting.lineHeight === "relaxed" ? 1.7 : 1.5;
}

/** Page padding in px for the on-screen preview. */
export function getMarginPx(formatting: FormattingOptions): number {
  return formatting.margin === "narrow" ? 24 : formatting.margin === "wide" ? 56 : 40;
}

/** Page padding in PDF points (1pt ≈ 1.333px). */
export function getMarginPt(formatting: FormattingOptions): number {
  return formatting.margin === "narrow" ? 24 : formatting.margin === "wide" ? 44 : 34;
}

/** Preview sheet width in px (height grows with content). A4 vs Letter aspect. */
export function getPageWidthPx(formatting: FormattingOptions): number {
  return formatting.pageFormat === "letter" ? 816 : 794; // 96dpi: Letter 8.5in, A4 8.27in
}

/** react-pdf page size string. */
export function getPdfPageSize(formatting: FormattingOptions): "A4" | "LETTER" {
  return formatting.pageFormat === "letter" ? "LETTER" : "A4";
}

/** Resolve the effective, de-duplicated section order (always all keys present). */
export function getSectionOrder(formatting: FormattingOptions): SectionKey[] {
  const provided = formatting.sectionOrder ?? DEFAULT_SECTION_ORDER;
  const seen = new Set<SectionKey>();
  const order: SectionKey[] = [];
  for (const key of provided) {
    if (DEFAULT_SECTION_ORDER.includes(key) && !seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  for (const key of DEFAULT_SECTION_ORDER) {
    if (!seen.has(key)) order.push(key);
  }
  return order;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Format a YYYY-MM (or YYYY-MM-DD / YYYY) date string per the chosen dateFormat. */
export function formatDateValue(value: string | undefined, dateFormat: DateFormat): string {
  if (!value) return "";
  const month = toMonthInput(value); // → YYYY-MM
  if (!month) return value;
  const [yearStr, monStr] = month.split("-");
  const monIndex = Number(monStr) - 1;
  if (monIndex < 0 || monIndex > 11) return yearStr;
  if (dateFormat === "numeric") return `${monStr}/${yearStr}`;
  if (dateFormat === "long") return `${MONTHS_LONG[monIndex]} ${yearStr}`;
  return `${MONTHS_SHORT[monIndex]} ${yearStr}`;
}
