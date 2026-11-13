import { z } from "zod";

/**
 * The CV builder's look — template, formatting and hidden sections — saved on
 * the job-seeker profile by "Add to Profile" so the builder reopens as it was
 * left. These lists are the single source for the builder's option types
 * (job-seeker/cv/types.ts), the PATCH validator and the JobSeeker model.
 */

export const CV_TEMPLATE_IDS = [
  "classic", "modern", "minimal", "executive", "creative", "elegant",
  "professional", "compact", "timeline", "academic", "technical", "banner",
] as const;
export const CV_FONTS = ["inter", "georgia", "merriweather", "roboto", "playfair"] as const;
export const CV_FONT_SIZES = ["small", "medium", "large"] as const;
export const CV_SPACINGS = ["compact", "medium", "spacious"] as const;
export const CV_PAGE_FORMATS = ["a4", "letter"] as const;
export const CV_DATE_FORMATS = ["short", "long", "numeric"] as const;
export const CV_LINE_HEIGHTS = ["tight", "normal", "relaxed"] as const;
export const CV_MARGINS = ["narrow", "normal", "wide"] as const;
/* Layout controls. "auto" keeps each template's own look. */
export const CV_HEADER_ALIGNS = ["auto", "left", "center"] as const;
export const CV_TEXT_ALIGNS = ["left", "justify"] as const;
export const CV_HEADING_STYLES = ["auto", "underline", "plain", "band"] as const;
export const CV_SKILLS_STYLES = ["auto", "chips", "comma", "columns"] as const;
export const CV_NAME_SIZES = ["small", "medium", "large"] as const;
export const CV_BULLET_STYLES = ["dot", "dash", "arrow"] as const;
export const CV_DATE_POSITIONS = ["auto", "right", "below"] as const;
export const CV_PHOTO_SHAPES = ["circle", "rounded", "square"] as const;
export const CV_SECTION_KEYS = [
  "experience", "education", "skills", "projects", "languages", "certifications",
] as const;

/** A preset id ("blue") or a custom colour ("#2563eb"). */
export const CV_THEME_COLOR_PATTERN = /^(?:[a-z]{1,20}|#[0-9a-fA-F]{6})$/;

export const cvFormattingSchema = z.object({
  font: z.enum(CV_FONTS),
  fontSize: z.enum(CV_FONT_SIZES),
  spacing: z.enum(CV_SPACINGS),
  themeColor: z.string().regex(CV_THEME_COLOR_PATTERN),
  pageFormat: z.enum(CV_PAGE_FORMATS),
  dateFormat: z.enum(CV_DATE_FORMATS),
  lineHeight: z.enum(CV_LINE_HEIGHTS),
  margin: z.enum(CV_MARGINS),
  sectionOrder: z.array(z.enum(CV_SECTION_KEYS)).max(CV_SECTION_KEYS.length).optional(),
  // Optional: designs saved before these existed still validate.
  headerAlign: z.enum(CV_HEADER_ALIGNS).optional(),
  textAlign: z.enum(CV_TEXT_ALIGNS).optional(),
  headingStyle: z.enum(CV_HEADING_STYLES).optional(),
  skillsStyle: z.enum(CV_SKILLS_STYLES).optional(),
  nameSize: z.enum(CV_NAME_SIZES).optional(),
  bulletStyle: z.enum(CV_BULLET_STYLES).optional(),
  datePosition: z.enum(CV_DATE_POSITIONS).optional(),
  photoShape: z.enum(CV_PHOTO_SHAPES).optional(),
});

export const cvDesignSchema = z.object({
  templateId: z.enum(CV_TEMPLATE_IDS),
  formatting: cvFormattingSchema,
  hiddenSections: z.array(z.enum(CV_SECTION_KEYS)).max(CV_SECTION_KEYS.length),
});

export type CvDesign = z.infer<typeof cvDesignSchema>;
