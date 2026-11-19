/**
 * @jest-environment node
 *
 * Arabic in CV PDFs: every PDF font family is a stack [Latin face, Arabic face].
 * react-pdf picks the face per character (@react-pdf/textkit fontSubstitution /
 * pickFontFromFontStack), so Latin text keeps the seeker's font and Arabic
 * text falls through to Amiri. react-pdf loads EVERY family in a
 * stack for every text node, so a missing or broken font file would break all
 * CV PDFs, not just Arabic ones: the files are checked here.
 */
import fs from "fs";
import path from "path";
import {
  CV_ARABIC_FONT, CV_ARABIC_LINE_HEIGHT, CV_FONTS_BY_ID, cvFontFile, pdfFamilies, pdfFamilyNames, withArabicFallback,
} from "@/app/[locale]/(dashboard)/job-seeker/cv/fonts";
import { DEFAULT_FORMATTING, type FormattingOptions } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";

const mockRegister = jest.fn();
let mockFamilies: Record<string, { sources: Array<{ data: unknown; loadResultPromise: unknown }> }> = {};
jest.mock("@react-pdf/renderer", () => ({
  Font: {
    register: (...args: unknown[]) => mockRegister(...args),
    registerHyphenationCallback: () => undefined,
    getRegisteredFonts: () => mockFamilies,
  },
  Text: "Text", View: "View", Link: "Link", StyleSheet: { create: <T,>(s: T) => s },
  Svg: "Svg", Path: "Path", Rect: "Rect", Circle: "Circle", Image: "Image",
}));

import {
  getPDFBoldFont, getPDFFont, getPDFItalicFont, refreshCvPdfFonts, registerCvPdfFonts,
} from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";

const ARABIC = "CV Amiri";
const PUBLIC_DIR = path.join(process.cwd(), "public");

interface Face { src: string; fontWeight: number; fontStyle: string }
interface Registration { family: string; fonts: Face[] }

function registrations(): Registration[] {
  return mockRegister.mock.calls.map((c) => c[0] as Registration);
}

describe("font stacks", () => {
  it("names the Arabic fallback families", () => {
    expect(CV_ARABIC_FONT.family).toBe(ARABIC);
    expect(pdfFamilyNames(CV_ARABIC_FONT)).toEqual({ regular: ARABIC, bold: `${ARABIC} Bold`, italic: `${ARABIC} Italic` });
  });

  it("pdfFamilyNames keeps the single registered names", () => {
    for (const font of Object.values(CV_FONTS_BY_ID)) {
      expect(pdfFamilyNames(font)).toEqual({ regular: font.family, bold: `${font.family} Bold`, italic: `${font.family} Italic` });
    }
  });

  it("pdfFamilies is [Latin family, Arabic family] for regular, bold and italic", () => {
    for (const font of Object.values(CV_FONTS_BY_ID)) {
      expect(pdfFamilies(font)).toEqual({
        regular: [font.family, ARABIC],
        bold: [`${font.family} Bold`, `${ARABIC} Bold`],
        italic: [`${font.family} Italic`, `${ARABIC} Italic`],
      });
    }
  });

  it("getPDFFont / getPDFBoldFont / getPDFItalicFont return the stacks for the chosen font", () => {
    const georgia: FormattingOptions = { ...DEFAULT_FORMATTING, font: "georgia" };
    expect(getPDFFont(georgia)).toEqual(["CV Lora", ARABIC]);
    expect(getPDFBoldFont(georgia)).toEqual(["CV Lora Bold", `${ARABIC} Bold`]);
    expect(getPDFItalicFont(georgia)).toEqual(["CV Lora Italic", `${ARABIC} Italic`]);
    expect(getPDFFont(DEFAULT_FORMATTING)).toEqual(["CV Inter", ARABIC]);
  });

  it("withArabicFallback adds the matching Arabic weight behind a standard PDF font", () => {
    expect(withArabicFallback("Times-Roman")).toEqual(["Times-Roman", ARABIC]);
    expect(withArabicFallback("Times-Bold", "bold")).toEqual(["Times-Bold", `${ARABIC} Bold`]);
    expect(withArabicFallback("Courier", "regular")).toEqual(["Courier", ARABIC]);
    expect(withArabicFallback("Times-Italic", "italic")).toEqual(["Times-Italic", `${ARABIC} Italic`]);
  });
});

describe("registerCvPdfFonts", () => {
  beforeAll(() => {
    mockRegister.mockClear();
    registerCvPdfFonts();
  });

  it("registers the three Arabic families with all four faces each", () => {
    for (const family of [ARABIC, `${ARABIC} Bold`, `${ARABIC} Italic`]) {
      const reg = registrations().find((r) => r.family === family);
      expect(reg).toBeDefined();
      expect(reg!.fonts).toHaveLength(4);
      const keys = reg!.fonts.map((f) => `${f.fontWeight}/${f.fontStyle}`).sort();
      expect(keys).toEqual(["400/italic", "400/normal", "700/italic", "700/normal"]);
    }
  });

  it("points every Arabic face at the regular or bold normal file (there is no Arabic italic)", () => {
    const regular = cvFontFile(CV_ARABIC_FONT, 400, "normal");
    const bold = cvFontFile(CV_ARABIC_FONT, 700, "normal");
    expect(regular).toBe("/fonts/cv/amiri-400-normal.ttf");
    expect(bold).toBe("/fonts/cv/amiri-700-normal.ttf");

    const face = (family: string, weight: number, style: string) =>
      registrations().find((r) => r.family === family)!.fonts.find((f) => f.fontWeight === weight && f.fontStyle === style)!.src;

    for (const style of ["normal", "italic"]) {
      expect(face(ARABIC, 400, style)).toBe(regular);
      expect(face(ARABIC, 700, style)).toBe(bold);
      expect(face(`${ARABIC} Italic`, 400, style)).toBe(regular);
      expect(face(`${ARABIC} Italic`, 700, style)).toBe(bold);
      // The bold-only family is bold at every weight, like the Latin ones.
      expect(face(`${ARABIC} Bold`, 400, style)).toBe(bold);
      expect(face(`${ARABIC} Bold`, 700, style)).toBe(bold);
    }
  });

  it("still registers every Latin family", () => {
    for (const font of Object.values(CV_FONTS_BY_ID)) {
      for (const family of [font.family, `${font.family} Bold`, `${font.family} Italic`]) {
        expect(registrations().some((r) => r.family === family)).toBe(true);
      }
    }
  });

  it("only references font files that exist in /public (a 404 would break every CV PDF)", () => {
    const sources = new Set(registrations().flatMap((r) => r.fonts.map((f) => f.src)));
    expect(sources.size).toBeGreaterThan(0);
    for (const src of sources) {
      expect(fs.existsSync(path.join(PUBLIC_DIR, src))).toBe(true);
    }
  });
});

describe("refreshCvPdfFonts", () => {
  /* A faithful stand-in for @react-pdf/font's FontSource (4.0.8): load() runs
     _load() ONCE and remembers the promise, and _load() parses the file into
     a new fontkit object. "parses" counts how many times the file was parsed.
     The contract test below keeps this stand-in honest. */
  class FakeFontSource {
    data: { parse: number } | null = null;
    loadResultPromise: Promise<void> | null = null;
    parses = 0;

    async _load(): Promise<void> {
      this.parses += 1;
      this.data = { parse: this.parses };
    }

    async load(): Promise<void> {
      if (this.loadResultPromise === null) this.loadResultPromise = this._load();
      return this.loadResultPromise;
    }
  }

  const family = (...sources: FakeFontSource[]) => ({ sources });
  const useFamilies = (families: Record<string, { sources: FakeFontSource[] }>) => {
    mockFamilies = families as unknown as typeof mockFamilies;
  };

  it("makes the next load parse the file AGAIN, into a new font object", async () => {
    const inter = new FakeFontSource();
    useFamilies({ "CV Inter": family(inter) });

    await inter.load();
    const first = inter.data;
    expect(inter.parses).toBe(1);

    // without a refresh the cached parse is reused
    await inter.load();
    expect(inter.parses).toBe(1);
    expect(inter.data).toBe(first);

    refreshCvPdfFonts();
    await inter.load();
    expect(inter.parses).toBe(2);
    expect(inter.data).not.toBe(first);
    expect(inter.data).toEqual({ parse: 2 });
  });

  it("re-parses every CV face of every CV family, and only those", async () => {
    const [a, b, c] = [new FakeFontSource(), new FakeFontSource(), new FakeFontSource()];
    const helvetica = new FakeFontSource();
    useFamilies({ "CV Lora": family(a, b), "CV Amiri Bold": family(c), Helvetica: family(helvetica) });
    await Promise.all([a, b, c, helvetica].map((f) => f.load()));

    refreshCvPdfFonts();
    await Promise.all([a, b, c, helvetica].map((f) => f.load()));

    expect([a.parses, b.parses, c.parses]).toEqual([2, 2, 2]);
    expect(helvetica.parses).toBe(1);   // built-in fonts are loaded once at start-up and never again
  });

  it("clearing only `data` (what Font.reset() does) would leave the font empty: both fields must be cleared", async () => {
    const inter = new FakeFontSource();
    await inter.load();
    inter.data = null;                  // Font.reset()
    await inter.load();
    expect(inter.parses).toBe(1);       // load() returns the remembered promise: nothing is parsed again
    expect(inter.data).toBeNull();      // ...and the font is gone: react-pdf then crashes reading unitsPerEm

    const fixed = new FakeFontSource();
    useFamilies({ "CV Inter": family(fixed) });
    await fixed.load();
    refreshCvPdfFonts();
    await fixed.load();
    expect(fixed.parses).toBe(2);
    expect(fixed.data).not.toBeNull();
  });

  it("does nothing when no font is registered yet", () => {
    useFamilies({});
    expect(() => refreshCvPdfFonts()).not.toThrow();
  });

  it("relies on react-pdf internals that are still there (the stand-in above matches the installed library)", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "node_modules/@react-pdf/font/lib/index.js"), "utf8");
    // FontSource.load(): runs _load() once and remembers the promise
    expect(source).toMatch(/if \(this\.loadResultPromise === null\) \{\s*this\.loadResultPromise = this\._load\(\);\s*\}/);
    // _load() parses the file into `data`
    expect(source).toMatch(/this\.data = data;/);
    // both fields start out null on a font that has not been loaded
    expect(source).toMatch(/this\.data = null;/);
    expect(source).toMatch(/this\.loadResultPromise = null;/);
    // the registered families (and their sources) are reachable through the public getRegisteredFonts()
    expect(source).toMatch(/getRegisteredFonts = \(\) => this\.fontFamilies;/);
    expect(source).toMatch(/this\.sources\.push\(new FontSource\(/);
  });
});

describe("Amiri files (the Arabic face)", () => {
  interface Glyph { codePoints?: number[] }
  interface Font {
    hasGlyphForCodePoint(cp: number): boolean;
    familyName: string;
    GPOS?: { featureList: Array<{ tag: string; feature: { lookupListIndexes: number[] } }> };
    layout(text: string, features?: unknown, script?: unknown, language?: unknown, direction?: string): { glyphs: Glyph[]; positions: Array<{ xAdvance: number }> };
  }
  const fontkit = require("fontkit") as { openSync: (file: string) => Font };
  const open = (weight: 400 | 700) => fontkit.openSync(path.join(PUBLIC_DIR, cvFontFile(CV_ARABIC_FONT, weight, "normal")));

  it.each([400, 700] as const)("the %i file really contains Arabic letters, digits and the punctuation a CV uses", (weight) => {
    const font = open(weight);
    expect(font.familyName).toBe("Amiri CV");   // the derived file (see the next describe's note), not the upstream name
    const must: Record<string, number> = {
      alef: 0x0627, beh: 0x0628, meem: 0x0645, heh: 0x0647, yeh: 0x064a, teh_marbuta: 0x0629,
      alef_hamza_above: 0x0623, alef_hamza_below: 0x0625, lam_alef_ligature: 0xfefb,
      arabic_indic_one: 0x0661, ascii_one: 0x0031, space: 0x0020, comma: 0x002c, arabic_comma: 0x060c,
      en_dash: 0x2013, bullet: 0x2022,
    };
    for (const [name, cp] of Object.entries(must)) {
      expect({ name, has: font.hasGlyphForCodePoint(cp) }).toEqual({ name, has: true });
    }
  });

  /* react-pdf (textkit 6.3) lays text out with fontkit and then reorders it
     right to left using each glyph's code points. A glyph with NO code point
     (fontkit emits these for multiple-substitution, e.g. Noto Sans Arabic's
     hamza forms) throws "Cannot read properties of undefined (reading 'id')"
     and fails the whole PDF. This is the exact call textkit makes. */
  const PHRASES = [
    "سارة أحمد", "بكالوريوس", "جيد جدا", "إكسل المتقدم", "فاطمة الزهراء", "نورة السعيد", "ياسمين إبراهيم",
    "محاسبة أولى", "الإنجليزية", "مجموعة الخليج التجارية", "قيادة ترحيل بيانات الحسابات إلى النظام الجديد",
    "مُحَمَّد عَبْدُ اللَّهِ", "لا", "الله", "محاسب قانوني معتمد (CPA)", "2020 - 2024", "٢٠٢٠",
  ];

  it.each([400, 700] as const)("the %i file gives every glyph a code point and loses none (no textkit bidi crash)", (weight) => {
    const font = open(weight);
    for (const phrase of PHRASES) {
      const { glyphs } = font.layout(phrase, undefined, undefined, undefined, "ltr");
      const withoutCodePoint = glyphs.filter((g) => !g.codePoints || g.codePoints.length === 0).length;
      const kept = glyphs.reduce((n, g) => n + (g.codePoints?.length ?? 0), 0);
      expect({ phrase, withoutCodePoint, kept }).toEqual({ phrase, withoutCodePoint: 0, kept: [...phrase].length });
    }
  });

  /* react-pdf (textkit 6.3) asks fontkit to shape EVERY run with direction
     "ltr", Arabic included, and positions the glyphs from what comes back. The
     upstream Amiri joins letters such as meem+hah, beh+khah, jeem+hah with
     cursive attachment (the GPOS "curs" feature), and fontkit applies that
     differently per direction: shaped "ltr" the pair's advance collapses to 0
     where it is 664 units shaped "rtl" (how it is read). Result in the PDF: a
     line was measured too narrow, so right-aligned text ran ~5 pt past the
     margin and the next word was drawn ON TOP of the pair ("محاسبين" over
     "من ثلاثة", "للمقاولات" with its lam-meem-qaf squashed, "محترف" garbled).
     The shipped files are Amiri with the cursive-attachment lookups emptied
     (scripts/derive-cv-amiri.py), so both directions measure the same. */
  const PAIR_PHRASES = [
    "مح", "بخ", "جح", "مخ", "محاسبة", "محاسبة أولى", "الإنجليزية (محترف)", "شركة النور للمقاولات", "مخطط",
    "الإشراف على فريق من ثلاثة محاسبين", "محاسب قانوني معتمد (CPA)", "بحث نجح منح نحن", "مجموعة الخليج التجارية",
  ];
  const advance = (font: Font, phrase: string, direction: string, script?: string, language?: string): number =>
    font.layout(phrase, undefined, script, language, direction).positions.reduce((sum, p) => sum + p.xAdvance, 0);

  it.each([400, 700] as const)("the %i file measures a line the same shaped left-to-right (what react-pdf does) as right-to-left (how it is read)", (weight) => {
    const font = open(weight);
    for (const phrase of [...PHRASES, ...PAIR_PHRASES]) {
      const asRendered = advance(font, phrase, "ltr");
      const asRead = advance(font, phrase, "rtl", "arab", "ar");
      expect({ phrase, width: asRendered }).toEqual({ phrase, width: asRead });
    }
  });

  it.each([400, 700] as const)("the %i file has no cursive-attachment lookups left", (weight) => {
    const gpos = open(weight).GPOS;
    const cursive = (gpos?.featureList ?? []).filter((f) => f.tag === "curs");
    for (const feature of cursive) expect(feature.feature.lookupListIndexes).toEqual([]);
  });

  it.each([400, 700] as const)("CV_ARABIC_LINE_HEIGHT is at least the %i file's own height (ascent + descent), so a fixed line box does not clip it", (weight) => {
    const font = open(weight) as Font & { ascent: number; descent: number; unitsPerEm: number };
    const natural = (font.ascent - font.descent) / font.unitsPerEm;
    expect(natural).toBeGreaterThan(1.5);                       // the reason a 1.2 line box is too small
    expect(CV_ARABIC_LINE_HEIGHT).toBeGreaterThanOrEqual(natural);
  });

  it("ships with its licence next to the other CV fonts", () => {
    const licence = fs.readFileSync(path.join(PUBLIC_DIR, "fonts/cv/OFL-amiri.txt"), "utf8");
    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(licence).toContain("Amiri Project Authors");
  });
});
