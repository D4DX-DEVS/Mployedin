/**
 * @jest-environment node
 *
 * "Changed the CV template, pressed Add to Profile, refreshed — the old
 * template came back" (client report, 2026-10-01). The template, formatting
 * and hidden sections lived only in page state: the save body never carried
 * them, the validator would have stripped them, the model had no path for
 * them, and the page always started from "classic" + defaults.
 */
import JobSeeker from "@/models/JobSeeker";
import { jobSeekerProfileUpdateSchema } from "@/lib/validators/job-seekers";
import {
  CV_TEMPLATE_IDS, CV_FONTS, CV_FONT_SIZES, CV_SPACINGS, CV_PAGE_FORMATS,
  CV_DATE_FORMATS, CV_LINE_HEIGHTS, CV_MARGINS, CV_SECTION_KEYS,
} from "@/lib/jobSeeker/cvDesign";
import {
  TEMPLATES, FONT_OPTIONS, PAGE_FORMAT_OPTIONS, DATE_FORMAT_OPTIONS,
  LINE_HEIGHT_OPTIONS, MARGIN_OPTIONS, SECTION_META, DEFAULT_FORMATTING,
  restoreCvDesign,
} from "@/app/[locale]/(dashboard)/job-seeker/cv/types";

const savedDesign = {
  templateId: "modern",
  formatting: {
    font: "georgia",
    fontSize: "large",
    spacing: "compact",
    themeColor: "#123abc",
    pageFormat: "letter",
    dateFormat: "long",
    lineHeight: "relaxed",
    margin: "wide",
    sectionOrder: ["skills", "experience", "education", "projects", "languages", "certifications"],
  },
  hiddenSections: ["projects"],
};

describe("saving the CV design with Add to Profile", () => {
  it("keeps the template, formatting and hidden sections in the PATCH body", () => {
    const parsed = jobSeekerProfileUpdateSchema.parse({ cvDesign: savedDesign });
    expect(parsed.cvDesign).toEqual(savedDesign);
  });

  it("rejects a template the builder does not offer", () => {
    const result = jobSeekerProfileUpdateSchema.safeParse({
      cvDesign: { ...savedDesign, templateId: "not-a-template" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a formatting value outside the builder's options", () => {
    const result = jobSeekerProfileUpdateSchema.safeParse({
      cvDesign: { ...savedDesign, formatting: { ...savedDesign.formatting, font: "comic-sans" } },
    });
    expect(result.success).toBe(false);
  });

  it("has somewhere to store it on the job-seeker profile", () => {
    expect(JobSeeker.schema.path("cvDesign.templateId")).toBeDefined();
    expect(JobSeeker.schema.path("cvDesign.formatting.font")).toBeDefined();
    expect(JobSeeker.schema.path("cvDesign.formatting.sectionOrder")).toBeDefined();
    expect(JobSeeker.schema.path("cvDesign.hiddenSections")).toBeDefined();
  });

  it("stores the design intact instead of strict mode dropping it", () => {
    const doc = new JobSeeker({ cvDesign: savedDesign });
    expect(doc.validateSync()?.errors?.["cvDesign.templateId"]).toBeUndefined();
    expect(doc.toObject().cvDesign).toEqual(savedDesign);
  });
});

describe("restoreCvDesign (opening the builder again)", () => {
  it("brings back the saved template, formatting and hidden sections", () => {
    const design = restoreCvDesign(savedDesign);
    expect(design.templateId).toBe("modern");
    expect(design.formatting).toEqual(savedDesign.formatting);
    expect([...design.hiddenSections]).toEqual(["projects"]);
  });

  it("starts from Classic and the default formatting when nothing was saved", () => {
    const design = restoreCvDesign(undefined);
    expect(design.templateId).toBe("classic");
    expect(design.formatting).toEqual(DEFAULT_FORMATTING);
    expect(design.hiddenSections.size).toBe(0);
  });

  it("keeps the valid parts of a damaged record and defaults the rest", () => {
    const design = restoreCvDesign({
      templateId: "retired-template",
      formatting: { font: "roboto", fontSize: "huge" },
      hiddenSections: ["skills", "nonsense"],
    });
    expect(design.templateId).toBe("classic");
    expect(design.formatting).toEqual({ ...DEFAULT_FORMATTING, font: "roboto" });
    expect([...design.hiddenSections]).toEqual(["skills"]);
  });
});

describe("builder options and stored options stay in step", () => {
  it("matches every offered template", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([...CV_TEMPLATE_IDS]);
  });

  it("matches every formatting option list", () => {
    expect(FONT_OPTIONS.map((o) => o.value)).toEqual([...CV_FONTS]);
    expect(PAGE_FORMAT_OPTIONS.map((o) => o.value)).toEqual([...CV_PAGE_FORMATS]);
    expect(DATE_FORMAT_OPTIONS.map((o) => o.value)).toEqual([...CV_DATE_FORMATS]);
    expect(LINE_HEIGHT_OPTIONS.map((o) => o.value)).toEqual([...CV_LINE_HEIGHTS]);
    expect(MARGIN_OPTIONS.map((o) => o.value)).toEqual([...CV_MARGINS]);
    expect(SECTION_META.map((s) => s.key)).toEqual([...CV_SECTION_KEYS]);
    expect(CV_FONT_SIZES).toContain(DEFAULT_FORMATTING.fontSize);
    expect(CV_SPACINGS).toContain(DEFAULT_FORMATTING.spacing);
  });
});
