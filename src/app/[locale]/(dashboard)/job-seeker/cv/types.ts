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
}

/* ── Template Definitions ── */

export type TemplateTier = "free" | "pro";

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  tier: TemplateTier;
}

/* ── Constants ── */

export const THEME_COLORS: ThemeColor[] = [
  { id: "blue",   label: "Blue",   primary: "#2563eb", light: "#eff6ff", css: "text-blue-600",   bg: "bg-blue-600",   border: "border-blue-600" },
  { id: "teal",   label: "Teal",   primary: "#0d9488", light: "#f0fdfa", css: "text-teal-600",   bg: "bg-teal-600",   border: "border-teal-600" },
  { id: "green",  label: "Green",  primary: "#16a34a", light: "#f0fdf4", css: "text-green-700",  bg: "bg-green-700",  border: "border-green-700" },
  { id: "purple", label: "Purple", primary: "#7c3aed", light: "#f5f3ff", css: "text-purple-600", bg: "bg-purple-600", border: "border-purple-600" },
  { id: "amber",  label: "Amber",  primary: "#b45309", light: "#fffbeb", css: "text-amber-700",  bg: "bg-amber-700",  border: "border-amber-700" },
];

export const FONT_OPTIONS: { value: FontFamily; label: string; stack: string }[] = [
  { value: "inter",        label: "Inter",        stack: "'Inter', system-ui, sans-serif" },
  { value: "georgia",      label: "Georgia",      stack: "'Georgia', serif" },
  { value: "merriweather", label: "Merriweather", stack: "'Merriweather', serif" },
  { value: "roboto",       label: "Roboto",       stack: "'Roboto', sans-serif" },
  { value: "playfair",     label: "Playfair",     stack: "'Playfair Display', serif" },
];

export const TEMPLATES: TemplateDefinition[] = [
  { id: "classic",    name: "Classic",    description: "Clean professional layout with blue accents",     tier: "free" },
  { id: "modern",     name: "Modern",     description: "Contemporary design with sidebar layout",         tier: "free" },
  { id: "minimal",    name: "Minimal",    description: "Simple, ATS-friendly single-column design",       tier: "free" },
  { id: "executive",  name: "Executive",  description: "Premium two-column layout for senior roles",      tier: "free" },
  { id: "creative",   name: "Creative",   description: "Bold design with colored header and skill bars",  tier: "free" },
  { id: "elegant",    name: "Elegant",    description: "Refined serif typography with gold accents",      tier: "free" },
];

export const DEFAULT_FORMATTING: FormattingOptions = {
  font: "inter",
  fontSize: "medium",
  spacing: "medium",
  themeColor: "blue",
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

/** Get the resolved ThemeColor for current formatting */
export function getTheme(formatting: FormattingOptions): ThemeColor {
  return THEME_COLORS.find((c) => c.id === formatting.themeColor) ?? THEME_COLORS[0];
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
