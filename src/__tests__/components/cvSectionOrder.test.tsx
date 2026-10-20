/**
 * CV builder: section order and visibility, preview vs PDF (2026-10-20).
 *
 * Modern, Executive, Creative and Professional ignored the seeker's section
 * order — the live preview and the downloaded PDF both used a fixed layout.
 * Every template now renders one order (the seeker's), two-column templates
 * keep each section in its own column, and hidden sections are left out of
 * the preview and the PDF alike.
 *
 * The PDF side renders each template's react-pdf twin with the primitives
 * swapped for plain elements (jest cannot load the ESM-only renderer), which
 * checks the document tree the PDF is laid out from. The real downloaded file
 * is checked end to end by e2e/cv-builder-pdf.spec.ts.
 */
import React from "react";
import { render } from "@testing-library/react";
import {
  DEFAULT_FORMATTING, DEFAULT_SECTION_ORDER, TEMPLATES, TEMPLATE_COLUMNS,
  getColumnOrder, getSectionOrder, getVisibleForm,
  type CVForm, type FormattingOptions, type SectionKey,
} from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import { TemplateRenderer } from "@/app/[locale]/(dashboard)/job-seeker/cv/templates";
import { CVPDFDocument, type CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/cv-pdf-document";

jest.mock("@react-pdf/renderer", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const element = (tag: string) =>
    function PdfPrimitive({ children }: { children?: React.ReactNode }) {
      return react.createElement(tag, null, children);
    };
  const nothing = () => null;
  return {
    Document: element("div"),
    Page: element("div"),
    View: element("div"),
    Text: element("span"),
    Link: element("span"),
    Image: nothing,
    Svg: nothing,
    Path: nothing,
    Rect: nothing,
    Circle: nothing,
    StyleSheet: { create: <T,>(styles: T) => styles },
    Font: { register: () => undefined, registerHyphenationCallback: () => undefined },
  };
});

const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
const COLUMN_TEMPLATES = Object.keys(TEMPLATE_COLUMNS) as (keyof typeof TEMPLATE_COLUMNS)[];

/* Labels are looked up by key; the key itself is a fine heading for these checks. */
const labels = new Proxy({} as CVPDFLabels, {
  get: (_target, key) => (typeof key === "string" ? key : undefined),
});

/** A marker no template text can contain by accident, e.g. "QSKILLS3Q". */
const marker = (key: SectionKey, i: number) => `Q${key.toUpperCase()}${i}Q`;

function buildForm(entries: number): CVForm {
  const range = Array.from({ length: entries }, (_, i) => i);
  return {
    fullName: "Test Person",
    email: "test.person@example.com",
    phone: "+971 50 000 0000",
    nationality: "Jordanian",
    currentLocation: "Dubai",
    headline: "Operations lead",
    photo: "",
    linkedin: "",
    portfolio: "",
    additionalLinks: [],
    experience: range.map((i) => ({
      jobTitle: marker("experience", i),
      company: "Acme Trading",
      country: "UAE",
      startDate: "2019-01",
      endDate: "2021-06",
      isCurrent: false,
      description: "<p>Ran the regional warehouse team.</p>",
    })),
    education: range.map((i) => ({
      degree: marker("education", i),
      institution: "City University",
      field: "Logistics",
      graduationDate: "2018-06",
      grade: "",
    })),
    skills: range.map((i) => marker("skills", i)),
    projects: range.map((i) => ({
      title: marker("projects", i),
      description: "<p>Cut picking time.</p>",
      techStack: ["SAP"],
      projectUrl: "",
      repoUrl: "",
    })),
    languages: range.map((i) => ({ language: marker("languages", i), proficiency: "native" as const })),
    certifications: range.map((i) => marker("certifications", i)),
  };
}

const withOrder = (sectionOrder: SectionKey[]): FormattingOptions => ({ ...DEFAULT_FORMATTING, sectionOrder });

function previewText(templateId: string, data: CVForm, formatting: FormattingOptions): string {
  const { container, unmount } = render(<TemplateRenderer templateId={templateId} data={data} formatting={formatting} />);
  const text = container.textContent ?? "";
  unmount();
  return text;
}

function pdfText(templateId: string, data: CVForm, formatting: FormattingOptions): string {
  const { container, unmount } = render(
    <CVPDFDocument templateId={templateId} data={data} formatting={formatting} labels={labels} />,
  );
  const text = container.textContent ?? "";
  unmount();
  return text;
}

/** Sections in the order their first entry appears in the text; absent sections are left out. */
function sectionSequence(text: string): SectionKey[] {
  return DEFAULT_SECTION_ORDER
    .filter((key) => text.includes(marker(key, 0)))
    .sort((a, b) => text.indexOf(marker(a, 0)) - text.indexOf(marker(b, 0)));
}

/**
 * What a template should show: the seeker's order (per column for two-column
 * templates) among the sections shown. Callers check separately that no
 * visible section is missing.
 */
function expectOrder(templateId: string, sequence: SectionKey[], formatting: FormattingOptions) {
  const shown = (keys: SectionKey[]) => keys.filter((key) => sequence.includes(key));
  if (templateId in TEMPLATE_COLUMNS) {
    const id = templateId as keyof typeof TEMPLATE_COLUMNS;
    for (const column of ["main", "side"] as const) {
      const members: readonly SectionKey[] = TEMPLATE_COLUMNS[id][column];
      expect(sequence.filter((key) => members.includes(key))).toEqual(shown(getColumnOrder(formatting, id, column)));
    }
  } else {
    expect(sequence).toEqual(shown(getSectionOrder(formatting)));
  }
}

const ORDERS: SectionKey[][] = [
  DEFAULT_SECTION_ORDER,
  [...DEFAULT_SECTION_ORDER].reverse(),
  ["skills", "certifications", "experience", "languages", "projects", "education"],
  ["projects", "education", "languages", "skills", "experience", "certifications"],
];

describe("getSectionOrder", () => {
  it("uses the default order until the seeker arranges one", () => {
    expect(getSectionOrder(DEFAULT_FORMATTING)).toEqual(DEFAULT_SECTION_ORDER);
    expect(getSectionOrder({ ...DEFAULT_FORMATTING, sectionOrder: undefined })).toEqual(DEFAULT_SECTION_ORDER);
  });

  it("keeps the seeker's order exactly", () => {
    for (const order of ORDERS) expect(getSectionOrder(withOrder(order))).toEqual(order);
  });

  it("drops duplicates and appends missing sections, so nothing disappears", () => {
    expect(getSectionOrder(withOrder(["skills", "skills", "projects"]))).toEqual([
      "skills", "projects", "experience", "education", "languages", "certifications",
    ]);
  });
});

describe("two-column templates", () => {
  it.each(COLUMN_TEMPLATES)("%s places every section in exactly one column", (id) => {
    const { main, side } = TEMPLATE_COLUMNS[id];
    const all: SectionKey[] = [...main, ...side];
    expect([...all].sort()).toEqual([...DEFAULT_SECTION_ORDER].sort());
  });

  it.each(COLUMN_TEMPLATES)("%s applies the seeker's order within each column", (id) => {
    const formatting = withOrder(["certifications", "projects", "languages", "education", "skills", "experience"]);
    const main = getColumnOrder(formatting, id, "main");
    const side = getColumnOrder(formatting, id, "side");
    expect(new Set(main)).toEqual(new Set(TEMPLATE_COLUMNS[id].main));
    expect(new Set(side)).toEqual(new Set(TEMPLATE_COLUMNS[id].side));
    const position = (key: SectionKey) => formatting.sectionOrder!.indexOf(key);
    for (const column of [main, side]) {
      expect([...column].sort((a, b) => position(a) - position(b))).toEqual(column);
    }
  });
});

describe.each(TEMPLATE_IDS)("%s template", (templateId) => {
  const form = buildForm(2);

  it.each(ORDERS.map((order) => [order.join(" > "), order]))(
    "renders the preview and the PDF in the seeker's order (%s)",
    (_name, order) => {
      const formatting = withOrder(order as SectionKey[]);
      const preview = sectionSequence(previewText(templateId, form, formatting));
      const pdf = sectionSequence(pdfText(templateId, form, formatting));
      expect(preview).toHaveLength(DEFAULT_SECTION_ORDER.length);
      expectOrder(templateId, preview, formatting);
      expect(pdf).toEqual(preview);
    },
  );

  it("leaves hidden sections out of the preview and the PDF, without deleting them", () => {
    const formatting = withOrder(ORDERS[2]);
    const hidden = new Set<SectionKey>(["projects", "languages"]);
    const visible = getVisibleForm(form, hidden);
    const preview = sectionSequence(previewText(templateId, visible, formatting));
    const pdf = sectionSequence(pdfText(templateId, visible, formatting));

    expect(preview).not.toContain("projects");
    expect(preview).not.toContain("languages");
    expect(preview).toHaveLength(DEFAULT_SECTION_ORDER.length - hidden.size);
    expectOrder(templateId, preview, formatting);
    expect(pdf).toEqual(preview);
    expect(form.projects).toHaveLength(2);
    expect(form.languages).toHaveLength(2);
  });

  it("prints every entry of a long CV, in order, in the preview and the PDF", () => {
    const long = buildForm(12);
    const preview = previewText(templateId, long, DEFAULT_FORMATTING);
    const pdf = pdfText(templateId, long, DEFAULT_FORMATTING);
    for (const key of DEFAULT_SECTION_ORDER) {
      for (const text of [preview, pdf]) {
        const positions = Array.from({ length: 12 }, (_, i) => text.indexOf(marker(key, i)));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      }
    }
  });
});

describe("switching templates", () => {
  it("keeps every section and the seeker's order in all 12 templates", () => {
    const form = buildForm(3);
    const formatting = withOrder(ORDERS[3]);
    const before = JSON.stringify({ form, formatting });
    for (const templateId of TEMPLATE_IDS) {
      const preview = sectionSequence(previewText(templateId, form, formatting));
      expect(preview).toHaveLength(DEFAULT_SECTION_ORDER.length);
      expectOrder(templateId, preview, formatting);
    }
    expect(JSON.stringify({ form, formatting })).toBe(before);
  });
});
