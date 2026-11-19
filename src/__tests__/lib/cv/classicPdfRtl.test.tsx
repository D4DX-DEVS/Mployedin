/**
 * Classic CV PDF in Arabic: right-to-left layout.
 *
 * react-pdf is replaced by plain elements that carry their style as a data
 * attribute, so the test can read what the classic template asks for:
 * direction / textAlign on every text block, mirrored flex rows, the Arabic
 * font fallback in every font stack, and no letter-spacing on Arabic headings
 * (it pulls joined letters apart). Real glyph shaping is proven separately by
 * rendering real PDFs (see task-2-report.md).
 */
import React from "react";
import { render } from "@testing-library/react";
import {
  DEFAULT_FORMATTING, type CVForm, type FormattingOptions,
} from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import { CV_ARABIC_LINE_HEIGHT } from "@/app/[locale]/(dashboard)/job-seeker/cv/fonts";
import { CVPDFDocument, type CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/cv-pdf-document";

jest.mock("@react-pdf/renderer", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const element = (tag: string) =>
    function PdfPrimitive({ children, style }: { children?: React.ReactNode; style?: unknown }) {
      return react.createElement(tag, { "data-style": JSON.stringify(style ?? {}) }, children);
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

const ENGLISH_LABELS: CVPDFLabels = {
  yourName: "Your name", present: "Present", experience: "Experience", education: "Education", grade: "Grade",
  skills: "Skills", projects: "Projects", languages: "Languages", certifications: "Certifications",
  professionalExperience: "Professional Experience", keyProjects: "Key Projects", coreCompetencies: "Core Competencies",
  decoratedExperience: "Experience", decoratedEducation: "Education", decoratedSkills: "Skills", decoratedProjects: "Projects",
  atCompany: "at {company}",
  proficiency: { basic: "Basic", conversational: "Conversational", professional: "Professional", native: "Native" },
};

const ARABIC_LABELS: CVPDFLabels = {
  ...ENGLISH_LABELS,
  yourName: "اسمك", present: "حتى الآن", experience: "الخبرات", education: "التعليم", grade: "التقدير",
  skills: "المهارات", projects: "المشاريع", languages: "اللغات", certifications: "الشهادات",
};

const ARABIC_CV: CVForm = {
  fullName: "سارة أحمد",
  email: "sara@example.com",
  phone: "+971500000000",
  nationality: "مصرية",
  currentLocation: "دبي",
  headline: "محاسبة أولى بخبرة ثماني سنوات في الإمارات",
  photo: "",
  linkedin: "linkedin.com/in/sara",
  portfolio: "",
  additionalLinks: [],
  skills: ["إكسل", "المعايير الدولية للتقارير المالية"],
  experience: [
    { jobTitle: "محاسبة أولى", company: "شركة النور", country: "الإمارات", startDate: "2020-01", endDate: "", isCurrent: true, description: "<ul><li>إقفال الدفاتر الشهرية</li><li>إعداد القوائم المالية</li></ul>" },
  ],
  education: [{ degree: "بكالوريوس", institution: "جامعة القاهرة", field: "المحاسبة", graduationDate: "2016-06", grade: "جيد جدا" }],
  languages: [{ language: "العربية", proficiency: "native" }, { language: "الإنجليزية", proficiency: "professional" }],
  certifications: ["محاسب قانوني معتمد"],
  projects: [{ title: "تطبيق نظام ERP", description: "قيادة المشروع", techStack: ["SAP"], projectUrl: "", repoUrl: "" }],
};

const ENGLISH_CV: CVForm = {
  ...ARABIC_CV,
  fullName: "Sarah Ahmed",
  headline: "Senior accountant with eight years in the UAE",
  nationality: "Egyptian",
  currentLocation: "Dubai",
  skills: ["Excel", "IFRS"],
  experience: [
    // An Arabic company name inside an English CV must NOT flip the layout.
    { jobTitle: "Senior Accountant", company: "شركة النور", country: "UAE", startDate: "2020-01", endDate: "", isCurrent: true, description: "<ul><li>Closed the books</li></ul>" },
  ],
  education: [{ degree: "BCom", institution: "Cairo University", field: "Accounting", graduationDate: "2016-06", grade: "A" }],
  languages: [{ language: "Arabic", proficiency: "native" }],
  certifications: ["CPA"],
  projects: [{ title: "ERP roll-out", description: "Led it", techStack: ["SAP"], projectUrl: "", repoUrl: "" }],
};

type Style = Record<string, unknown>;

function renderClassic(data: CVForm, labels: CVPDFLabels, formatting: FormattingOptions = DEFAULT_FORMATTING) {
  return render(<CVPDFDocument data={data} templateId="classic" formatting={formatting} labels={labels} />);
}

function styleOf(el: Element | null): Style {
  return JSON.parse(el?.getAttribute("data-style") ?? "{}") as Style;
}

/** The nearest styled element (react-pdf Text) holding exactly this text. */
function textStyle(container: HTMLElement, text: string): Style {
  const match = Array.from(container.querySelectorAll("span, div")).find((e) => e.children.length === 0 && e.textContent === text);
  if (!match) throw new Error(`no element with the text "${text}"`);
  return styleOf(match);
}

function allStyles(container: HTMLElement): Style[] {
  return Array.from(container.querySelectorAll("[data-style]")).map(styleOf);
}

describe("classic PDF, Arabic CV (right-to-left)", () => {
  it("sets direction rtl and right alignment on the name, summary and entries", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    for (const text of ["سارة أحمد", ARABIC_CV.headline, "محاسبة أولى", "شركة النور · الإمارات", "بكالوريوس – المحاسبة","جامعة القاهرة", "تطبيق نظام ERP"]) {
      const style = textStyle(container, text);
      expect({ text, direction: style.direction, textAlign: style.textAlign }).toEqual({ text, direction: "rtl", textAlign: "right" });
    }
  });

  it("does not put the English word 'in' between an Arabic degree and field", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    expect(container.textContent).not.toContain(" in ");
    expect(container.textContent).toContain("بكالوريوس – المحاسبة");
  });

  it("sets direction rtl on description paragraphs", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    const paragraph = Array.from(container.querySelectorAll("span")).find((e) => e.textContent?.includes("إقفال الدفاتر الشهرية"));
    expect(paragraph).toBeDefined();
    const style = styleOf(paragraph!);
    expect(style.direction).toBe("rtl");
    expect(style.textAlign).toBe("right");
  });

  /* The bullet sits in a text node of its own, beside the text, not as the first
     character of an Arabic paragraph: a wrapped line then stays beside the text
     (hanging bullet) and the bullet takes no part in the Arabic line's reordering. */
  it("draws every bullet in its own node at the right edge, never inside the Arabic text", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    const bullets = Array.from(container.querySelectorAll("span")).filter((e) => e.textContent === "•");
    // 2 description bullets + 1 certification
    expect(bullets).toHaveLength(3);
    for (const bullet of bullets) {
      const row = bullet.parentElement as HTMLElement;
      expect(styleOf(row).flexDirection).toBe("row-reverse");
      expect(row.firstElementChild).toBe(bullet);        // first child of a row-reverse = the right edge
      expect(row.children).toHaveLength(2);
      expect(row.children[1].textContent).not.toContain("•");
    }
    // no Arabic text node carries a bullet character any more
    const withBullet = Array.from(container.querySelectorAll("span")).filter((e) => e.children.length === 0 && e.textContent !== "•" && e.textContent?.includes("•"));
    expect(withBullet).toEqual([]);
  });

  it("gives the first certification its bullet, like the others", () => {
    const cv = { ...ARABIC_CV, certifications: ["محاسب قانوني معتمد (CPA)", "شهادة إدارة المخاطر المالية"] };
    const { container } = renderClassic(cv, ARABIC_LABELS);
    for (const text of cv.certifications) {
      const label = Array.from(container.querySelectorAll("span")).find((e) => e.textContent === text);
      expect(label).toBeDefined();
      const row = label!.parentElement as HTMLElement;
      expect(row.firstElementChild?.textContent).toBe("•");
      expect(styleOf(label!).direction).toBe("rtl");
      expect(styleOf(label!).flexShrink).toBe(1);        // a long certification wraps inside its box, beside the bullet
    }
  });

  it("numbers a numbered list in its own node too", () => {
    const cv = { ...ARABIC_CV, experience: [{ ...ARABIC_CV.experience[0], description: "<ol><li>الأولى</li><li>الثانية</li></ol>" }] };
    const { container } = renderClassic(cv, ARABIC_LABELS);
    const numbers = Array.from(container.querySelectorAll("span")).filter((e) => /^\d+\.$/.test(e.textContent ?? ""));
    expect(numbers.map((n) => n.textContent)).toEqual(["1.", "2."]);
    for (const n of numbers) expect((n.parentElement as HTMLElement).firstElementChild).toBe(n);
  });

  it("mirrors every flex row (nothing is left as a plain 'row')", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    const styles = allStyles(container);
    expect(styles.filter((s) => s.flexDirection === "row")).toEqual([]);
    expect(styles.filter((s) => s.flexDirection === "row-reverse").length).toBeGreaterThan(3);
  });

  it("pushes the header to the right edge", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    const header = Array.from(container.querySelectorAll("div")).map(styleOf).find((s) => s.borderBottomWidth === 2);
    expect(header?.alignItems).toBe("flex-end");
  });

  /* The name line has a fixed line-height (1.2 x font size). Amiri is much
     taller than that (ascent+descent = 1.758 em), so an Arabic name in a
     1.2 line box hung out of it and was drawn over the first line under it
     (live check: an Arabic name on an English CV). The name line of Arabic
     text must be as tall as the Arabic face; English names keep 1.2. */
  describe("header name line height", () => {
    const ARABIC_NAME_ENGLISH_CV: CVForm = { ...ENGLISH_CV, fullName: "عبدالرحمن ابوالنور" };

    it("gives an Arabic name the height of the Arabic face, even on an English (left-to-right) CV", () => {
      const { container } = renderClassic(ARABIC_NAME_ENGLISH_CV, ENGLISH_LABELS);
      const name = textStyle(container, "عبدالرحمن ابوالنور");
      expect(name.fontFamily).toBe("CV Amiri Bold");
      expect(name.lineHeight).toBeGreaterThanOrEqual(CV_ARABIC_LINE_HEIGHT);
    });

    it("gives the Arabic name of an Arabic CV the same height", () => {
      const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
      expect(textStyle(container, "سارة أحمد").lineHeight).toBeGreaterThanOrEqual(CV_ARABIC_LINE_HEIGHT);
    });

    it("leaves an English name exactly as before (1.2)", () => {
      const { container } = renderClassic(ENGLISH_CV, ENGLISH_LABELS);
      expect(textStyle(container, "Sarah Ahmed").lineHeight).toBe(1.2);
    });

    it("scales with the name size: the line box is at least the Arabic face's ascent+descent at that size", () => {
      const big: FormattingOptions = { ...DEFAULT_FORMATTING, nameSize: "large" };
      const { container } = renderClassic(ARABIC_NAME_ENGLISH_CV, ENGLISH_LABELS, big);
      const name = textStyle(container, "عبدالرحمن ابوالنور");
      expect(name.fontSize).toBeGreaterThan(20);
      expect((name.fontSize as number) * (name.lineHeight as number)).toBeGreaterThanOrEqual((name.fontSize as number) * 1.758);
    });
  });

  it("keeps centred headers centred", () => {
    const centred: FormattingOptions = { ...DEFAULT_FORMATTING, headerAlign: "center" };
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS, centred);
    expect(textStyle(container, "سارة أحمد").textAlign).toBe("center");
    const header = Array.from(container.querySelectorAll("div")).map(styleOf).find((s) => s.borderBottomWidth === 2);
    expect(header?.alignItems).toBe("center");
  });

  /* "Jan 2020 – حتى الآن" is ONE string with Arabic in it, drawn in the Arabic
     face (Inter has no Arabic glyphs, and a [Inter, Amiri] stack cuts the
     phrase into runs that react-pdf reorders wrongly). So when the "Present"
     label is Arabic, EVERY date string of the CV uses that face: no date looks
     different from its neighbours. */
  const WITH_PAST_JOB = { ...ARABIC_CV, experience: [...ARABIC_CV.experience, { ...ARABIC_CV.experience[0], isCurrent: false, startDate: "2016-07", endDate: "2019-12" }] };

  it("draws all dates in one face: the Arabic one when the Present label is Arabic", () => {
    const { container } = renderClassic(WITH_PAST_JOB, ARABIC_LABELS);
    for (const text of ["Jan 2020 – حتى الآن", "Jul 2016 – Dec 2019", "Jun 2016"]) {
      expect({ text, fontFamily: textStyle(container, text).fontFamily }).toEqual({ text, fontFamily: "CV Amiri" });
    }
  });

  it("draws all dates in the page font when the Present label is not Arabic, even in an Arabic CV", () => {
    const { container } = renderClassic(WITH_PAST_JOB, ENGLISH_LABELS);
    for (const text of ["Jan 2020 – Present", "Jul 2016 – Dec 2019", "Jun 2016"]) {
      expect({ text, fontFamily: textStyle(container, text).fontFamily }).toEqual({ text, fontFamily: ["CV Inter", "CV Amiri"] });
    }
  });

  it("draws the dates of an English CV in one face too when only the labels are Arabic", () => {
    const { container } = renderClassic(ENGLISH_CV, ARABIC_LABELS);
    for (const text of ["Jan 2020 – حتى الآن", "Jun 2016"]) {
      expect({ text, fontFamily: textStyle(container, text).fontFamily }).toEqual({ text, fontFamily: "CV Amiri" });
    }
  });

  it("uses no letter-spacing on Arabic section headings", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    for (const heading of ["الخبرات", "التعليم", "المهارات", "اللغات", "الشهادات", "المشاريع"]) {
      expect({ heading, letterSpacing: textStyle(container, heading).letterSpacing }).toEqual({ heading, letterSpacing: 0 });
    }
  });

  it("draws every piece of text that has Arabic in the Arabic face ALONE (one run, not a stack)", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    const faceOf = (text: string) => textStyle(container, text).fontFamily;
    // bold nodes use the bold-only Arabic family...
    for (const text of ["سارة أحمد", "محاسبة أولى", "بكالوريوس – المحاسبة", "تطبيق نظام ERP", "الخبرات"]) {
      expect({ text, fontFamily: faceOf(text) }).toEqual({ text, fontFamily: "CV Amiri Bold" });
    }
    // ...the rest the regular one
    for (const text of [ARABIC_CV.headline, "شركة النور · الإمارات", "جامعة القاهرة", "إكسل", "محاسب قانوني معتمد", "دبي"]) {
      expect({ text, fontFamily: faceOf(text) }).toEqual({ text, fontFamily: "CV Amiri" });
    }
  });

  it("keeps the page font stack for Latin-only text, with the Arabic face behind it", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    const page = allStyles(container).find((s) => s.padding !== undefined);
    expect(page?.fontFamily).toEqual(["CV Inter", "CV Amiri"]);
    // the e-mail address has no Arabic: no font of its own, it inherits the page stack
    expect(textStyle(container, "sara@example.com").fontFamily).toBeUndefined();
  });

  it("draws an Arabic description paragraph in the Arabic face", () => {
    const { container } = renderClassic(ARABIC_CV, ARABIC_LABELS);
    const paragraph = Array.from(container.querySelectorAll("span")).find((e) => e.textContent?.includes("إقفال الدفاتر الشهرية"));
    expect(styleOf(paragraph!).fontFamily).toBe("CV Amiri");
  });
});

describe("classic PDF, English CV (unchanged layout)", () => {
  it("sets no direction anywhere and keeps every row left-to-right, even with an Arabic company name", () => {
    const { container } = renderClassic(ENGLISH_CV, ENGLISH_LABELS);
    const styles = allStyles(container);
    expect(styles.filter((s) => s.direction !== undefined)).toEqual([]);
    expect(styles.filter((s) => s.flexDirection === "row-reverse")).toEqual([]);
    expect(styles.filter((s) => s.flexDirection === "row").length).toBeGreaterThan(3);
    expect(textStyle(container, "Sarah Ahmed").textAlign).toBe("left");
  });

  it("keeps the bullet inside the certification text, exactly as before", () => {
    const { container } = renderClassic(ENGLISH_CV, ENGLISH_LABELS);
    const cert = Array.from(container.querySelectorAll("span")).find((e) => e.textContent === "• CPA");
    expect(cert).toBeDefined();
    expect(Array.from(container.querySelectorAll("span")).filter((e) => e.textContent === "•")).toEqual([]);
  });

  it("keeps the ' in ' joiner between degree and field", () => {
    const { container } = renderClassic(ENGLISH_CV, ENGLISH_LABELS);
    expect(container.textContent).toContain("BCom in Accounting");
  });

  it("keeps the letter-spacing on Latin section headings", () => {
    const { container } = renderClassic(ENGLISH_CV, ENGLISH_LABELS);
    expect(textStyle(container, "Experience").letterSpacing).toBe(0.8);
  });

  it("keeps the Latin stacks for English text, with the Arabic face behind them", () => {
    const { container } = renderClassic(ENGLISH_CV, ENGLISH_LABELS);
    expect(textStyle(container, "Sarah Ahmed").fontFamily).toEqual(["CV Inter Bold", "CV Amiri Bold"]);
    expect(textStyle(container, "Senior Accountant").fontFamily).toEqual(["CV Inter Bold", "CV Amiri Bold"]);
  });

  it("draws only the line that has the Arabic company name in the Arabic face", () => {
    const { container } = renderClassic(ENGLISH_CV, ENGLISH_LABELS);
    expect(textStyle(container, "شركة النور · UAE").fontFamily).toBe("CV Amiri");
    expect(textStyle(container, "Cairo University").fontFamily).toEqual(["CV Inter", "CV Amiri"]);
  });
});
