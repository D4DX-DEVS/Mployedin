import JSZip from "jszip";
import {
  buildCvZip,
  cvZipFileName,
  extFromResponse,
  safeCvFileName,
  standardisedCvFileName,
  type CvZipEntry,
} from "@/lib/cv/cvZip";

// jsdom Blob has no arrayBuffer() — FileReader does exist.
function blobToBuffer(blob: Blob): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(Buffer.from(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function open(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blobToBuffer(blob));
}

function pathsOf(zip: JSZip): string[] {
  return Object.keys(zip.files).sort();
}

const NBSP = String.fromCharCode(0x00a0);
const RLO = String.fromCharCode(0x202e); // right-to-left override
const BOM = String.fromCharCode(0xfeff);

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function fakeBlob(text: string, type: string): Blob {
  return new Blob([text], { type });
}

/** Minimal RFC 4180 parser (quoted cells, doubled quotes, CRLF/LF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function readReport(zip: JSZip): Promise<string[][]> {
  const text = await zip.file("export-report.csv")!.async("string");
  return parseCsv(stripBom(text));
}

const NOW = new Date(2026, 10, 18, 14, 32); // local time -> 2026-11-18 14:32

describe("standardisedCvFileName", () => {
  it("is the name the export gives the standardised CV", () => {
    expect(standardisedCvFileName("Sara Ahmed", "64f0a1b2c3d4e5f6a7b8c9d0")).toBe("Sara Ahmed - Standardised CV (Mployedin).pdf");
  });

  it("is made safe the same way: Arabic stays, path characters go, an empty name falls back to the id", () => {
    expect(standardisedCvFileName("سارة أحمد", "x")).toBe("سارة أحمد - Standardised CV (Mployedin).pdf");
    expect(standardisedCvFileName("a/b:c", "x")).toBe("abc - Standardised CV (Mployedin).pdf");
    expect(standardisedCvFileName("", "64f0a1b2c3d4e5f6a7b8c9d0")).toBe("Candidate b8c9d0 - Standardised CV (Mployedin).pdf");
  });

  it("is never a name the Mployedin-built heuristic would take for a built upload", () => {
    expect(standardisedCvFileName("Sara", "x")).not.toMatch(/ - Mployedin CV\.pdf$/i);
  });
});

describe("safeCvFileName", () => {
  it("keeps an Arabic name readable", () => {
    expect(safeCvFileName("سارة أحمد", "64f0a1b2c3d4e5f6a7b8c9d0", new Set())).toBe("سارة أحمد");
  });

  it("strips path-illegal characters", () => {
    expect(safeCvFileName('a\\b/c:d*e?f"g<h>i|j', "x", new Set())).toBe("abcdefghij");
  });

  it("strips control characters and bidi overrides", () => {
    expect(safeCvFileName("Sara\u0000\u001F\u007FAli", "x", new Set())).toBe("SaraAli");
    expect(safeCvFileName(`evil${RLO}fdp`, "x", new Set())).toBe("evilfdp");
  });

  it("collapses whitespace and trims", () => {
    expect(safeCvFileName("  Sara \t  \n Ahmed  ", "x", new Set())).toBe("Sara Ahmed");
    expect(safeCvFileName(`Sara${NBSP}${NBSP}Ahmed`, "x", new Set())).toBe("Sara Ahmed");
  });

  it("falls back to the last 6 characters of the id for an empty name", () => {
    expect(safeCvFileName("", "64f0a1b2c3d4e5f6a7b8c9d0", new Set())).toBe("Candidate b8c9d0");
    expect(safeCvFileName("   ", "64f0a1b2c3d4e5f6a7b8c9d0", new Set())).toBe("Candidate b8c9d0");
    expect(safeCvFileName('/\\:*?"<>|', "64f0a1b2c3d4e5f6a7b8c9d0", new Set())).toBe("Candidate b8c9d0");
  });

  it("falls back gracefully when the id is short or empty", () => {
    expect(safeCvFileName("", "abc", new Set())).toBe("Candidate abc");
    expect(safeCvFileName("", "", new Set())).toBe("Candidate");
  });

  it("de-duplicates case-insensitively with (2), (3)", () => {
    const used = new Set<string>();
    expect(safeCvFileName("Sara Ahmed", "a", used)).toBe("Sara Ahmed");
    expect(safeCvFileName("sara ahmed", "b", used)).toBe("sara ahmed (2)");
    expect(safeCvFileName("SARA AHMED", "c", used)).toBe("SARA AHMED (3)");
    expect(safeCvFileName("Omar Ali", "d", used)).toBe("Omar Ali");
  });

  it("de-duplicates the id fallback too", () => {
    const used = new Set<string>();
    expect(safeCvFileName("", "64f0a1b2c3d4e5f6a7b8c9d0", used)).toBe("Candidate b8c9d0");
    expect(safeCvFileName("", "64f0a1b2c3d4e5f6a7b8c9d0", used)).toBe("Candidate b8c9d0 (2)");
  });

  it("caps the name at 80 characters", () => {
    const name = safeCvFileName("A".repeat(100), "x", new Set());
    expect(name).toBe("A".repeat(80));
  });

  it("does not split a surrogate pair when capping", () => {
    // 79 ASCII + emoji: a naive slice(0, 80) would keep a lone high surrogate.
    const cut = safeCvFileName(`${"a".repeat(79)}😀 tail`, "x", new Set());
    expect(cut).toBe("a".repeat(79));

    // Emoji only: 40 pairs fit exactly in 80 UTF-16 units.
    const emoji = safeCvFileName("😀".repeat(50), "x", new Set());
    expect(emoji.length).toBeLessThanOrEqual(80);
    expect(Array.from(emoji).every((ch) => ch === "😀")).toBe(true);
  });

  it("re-trims after the cap so the name never ends with a space", () => {
    const cut = safeCvFileName(`${"a".repeat(79)} b`, "x", new Set());
    expect(cut).toBe("a".repeat(79));
  });

  it("keeps a de-duplicated long name within 80 characters", () => {
    const used = new Set<string>();
    const first = safeCvFileName("A".repeat(100), "x", used);
    const second = safeCvFileName("A".repeat(100), "y", used);
    expect(first).toHaveLength(80);
    expect(second.length).toBeLessThanOrEqual(80);
    expect(second.endsWith(" (2)")).toBe(true);
    expect(second).not.toBe(first);
  });

  describe("UTF-8 byte budget (whole file name <= 200 bytes)", () => {
    // Longest suffix is " - Standardised CV (Mployedin).pdf" = 34 bytes -> the stem gets 166.
    const STEM_BUDGET = 166;
    const hasLoneSurrogate = (s: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

    it("keeps an 80-character Arabic name whole (160 bytes fits)", () => {
      const name = safeCvFileName("س".repeat(100), "x", new Set());
      expect(name).toBe("س".repeat(80));
      expect(bytes(name)).toBeLessThanOrEqual(STEM_BUDGET);
    });

    it("cuts 3-byte (CJK) names to the byte budget, below the 80-character cap", () => {
      const name = safeCvFileName("漢".repeat(100), "x", new Set());
      expect(name).toBe("漢".repeat(55)); // 55 * 3 = 165 <= 166, 56 * 3 = 168 > 166
      expect(bytes(name)).toBeLessThanOrEqual(STEM_BUDGET);
    });

    it("never splits a surrogate pair when the byte budget cuts mid-emoji", () => {
      // 55 * 3 = 165 bytes; the next emoji needs 4 more (169 > 166) so it must be dropped whole.
      const name = safeCvFileName(`${"漢".repeat(55)}😀😀`, "x", new Set());
      expect(name).toBe("漢".repeat(55));
      expect(hasLoneSurrogate(name)).toBe(false);

      // An emoji that exactly fits is kept: 54 * 3 + 4 = 166.
      const exact = safeCvFileName(`${"漢".repeat(54)}😀😀`, "x", new Set());
      expect(exact).toBe(`${"漢".repeat(54)}😀`);
      expect(bytes(exact)).toBe(STEM_BUDGET);
    });

    it("counts the de-duplication suffix inside the byte budget", () => {
      const used = new Set<string>();
      const first = safeCvFileName("漢".repeat(100), "x", used);
      const second = safeCvFileName("漢".repeat(100), "y", used);
      const third = safeCvFileName("漢".repeat(100), "z", used);
      expect(first).not.toBe(second);
      expect(second.endsWith(" (2)")).toBe(true);
      expect(third.endsWith(" (3)")).toBe(true);
      for (const n of [first, second, third]) {
        expect(bytes(n)).toBeLessThanOrEqual(STEM_BUDGET);
        expect(n.length).toBeLessThanOrEqual(80);
        expect(hasLoneSurrogate(n)).toBe(false);
      }
    });
  });
});

describe("extFromResponse", () => {
  it.each([
    ["application/pdf", "pdf"],
    ["application/pdf; charset=binary", "pdf"],
    ["APPLICATION/PDF", "pdf"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["application/msword", "doc"],
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/jpg", "jpg"],
    ["image/webp", "webp"],
  ])("maps %s to %s", (contentType, ext) => {
    expect(extFromResponse(contentType)).toBe(ext);
  });

  it("lets a known content type win over the URL extension", () => {
    expect(extFromResponse("application/pdf", "https://x.test/cv.docx")).toBe("pdf");
  });

  it("falls back to the URL extension for a generic or missing content type", () => {
    expect(extFromResponse("application/octet-stream", "https://x.test/files/Sara%20CV.docx?sig=1")).toBe("docx");
    expect(extFromResponse(null, "/uploads/cv.JPEG#frag")).toBe("jpg");
    expect(extFromResponse("", "/uploads/cv.doc")).toBe("doc");
  });

  it("falls back to the URL extension for a content type we do not know", () => {
    expect(extFromResponse("text/html", "/uploads/cv.png")).toBe("png");
  });

  it("defaults to pdf when nothing is recognisable", () => {
    expect(extFromResponse(undefined)).toBe("pdf");
    expect(extFromResponse("application/octet-stream")).toBe("pdf");
    expect(extFromResponse("application/x-weird", "/api/cv/123")).toBe("pdf");
    expect(extFromResponse(null, "/uploads/cv.exe")).toBe("pdf");
  });
});

describe("cvZipFileName", () => {
  it("formats the local date and time with zero padding", () => {
    expect(cvZipFileName(NOW)).toBe("Mployedin-CVs-2026-11-18-1432.zip");
    expect(cvZipFileName(new Date(2026, 0, 5, 9, 7))).toBe("Mployedin-CVs-2026-01-05-0907.zip");
  });
});

describe("buildCvZip layout", () => {
  const entries: CvZipEntry[] = [
    {
      id: "a1",
      name: "Sara Ahmed",
      standardised: { status: "ok", blob: fakeBlob("STD-SARA", "application/pdf") },
      original: { status: "ok", blob: fakeBlob("ORIG-SARA", "application/pdf"), ext: "pdf" },
    },
    {
      id: "b2",
      name: "Omar Ali",
      standardised: { status: "ok", blob: fakeBlob("STD-OMAR", "application/pdf") },
      original: {
        status: "ok",
        blob: fakeBlob("ORIG-OMAR", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ext: "docx",
      },
    },
  ];

  it("standardised mode: only Standardised/ folder", async () => {
    const { blob, fileName } = await buildCvZip({ mode: "standardised", entries, now: NOW });
    expect(fileName).toBe("Mployedin-CVs-2026-11-18-1432.zip");
    const zip = await open(blob);
    expect(pathsOf(zip)).toEqual([
      "Standardised/",
      "Standardised/Omar Ali - Standardised CV (Mployedin).pdf",
      "Standardised/Sara Ahmed - Standardised CV (Mployedin).pdf",
      "export-report.csv",
    ]);
    expect(await zip.file("Standardised/Sara Ahmed - Standardised CV (Mployedin).pdf")!.async("string")).toBe("STD-SARA");
  });

  it("original mode: only Original/ folder, real extensions kept", async () => {
    const { blob } = await buildCvZip({ mode: "original", entries, now: NOW });
    const zip = await open(blob);
    expect(pathsOf(zip)).toEqual([
      "Original/",
      "Original/Omar Ali - Original CV.docx",
      "Original/Sara Ahmed - Original CV.pdf",
      "export-report.csv",
    ]);
    expect(await zip.file("Original/Omar Ali - Original CV.docx")!.async("string")).toBe("ORIG-OMAR");
  });

  it("both mode: two flat folders, no per-candidate folders", async () => {
    const { blob } = await buildCvZip({ mode: "both", entries, now: NOW });
    const zip = await open(blob);
    expect(pathsOf(zip)).toEqual([
      "Original/",
      "Original/Omar Ali - Original CV.docx",
      "Original/Sara Ahmed - Original CV.pdf",
      "Standardised/",
      "Standardised/Omar Ali - Standardised CV (Mployedin).pdf",
      "Standardised/Sara Ahmed - Standardised CV (Mployedin).pdf",
      "export-report.csv",
    ]);
  });

  it("ignores results for a type the mode did not ask for", async () => {
    const { blob, report } = await buildCvZip({ mode: "standardised", entries, now: NOW });
    const zip = await open(blob);
    expect(pathsOf(zip).some((p) => p.startsWith("Original"))).toBe(false);
    expect(report.map((r) => r.original)).toEqual(["", ""]);
  });

  it("keeps Arabic names as UTF-8 paths", async () => {
    const { blob } = await buildCvZip({
      mode: "both",
      entries: [
        {
          id: "c3",
          name: "سارة أحمد",
          standardised: { status: "ok", blob: fakeBlob("STD", "application/pdf") },
          original: { status: "ok", blob: fakeBlob("ORIG", "application/pdf"), ext: "pdf" },
        },
      ],
      now: NOW,
    });
    const zip = await open(blob);
    expect(zip.file("Standardised/سارة أحمد - Standardised CV (Mployedin).pdf")).not.toBeNull();
    expect(zip.file("Original/سارة أحمد - Original CV.pdf")).not.toBeNull();
  });

  it("uses the same de-duplicated name in both folders", async () => {
    const dup = (id: string, tag: string): CvZipEntry => ({
      id,
      name: "Sara Ahmed",
      standardised: { status: "ok", blob: fakeBlob(`STD-${tag}`, "application/pdf") },
      original: { status: "ok", blob: fakeBlob(`ORIG-${tag}`, "application/pdf"), ext: "pdf" },
    });
    const { blob } = await buildCvZip({ mode: "both", entries: [dup("a1", "1"), dup("a2", "2")], now: NOW });
    const zip = await open(blob);
    expect(await zip.file("Standardised/Sara Ahmed (2) - Standardised CV (Mployedin).pdf")!.async("string")).toBe("STD-2");
    expect(await zip.file("Original/Sara Ahmed (2) - Original CV.pdf")!.async("string")).toBe("ORIG-2");
    expect(await zip.file("Original/Sara Ahmed - Original CV.pdf")!.async("string")).toBe("ORIG-1");
  });

  it("falls back to a sanitised extension when the given one is unusable", async () => {
    const { blob } = await buildCvZip({
      mode: "original",
      entries: [
        {
          id: "a1",
          name: "Sara",
          original: { status: "ok", blob: fakeBlob("X", "application/pdf"), ext: "../../evil" },
        },
      ],
      now: NOW,
    });
    const zip = await open(blob);
    expect(zip.file("Original/Sara - Original CV.pdf")).not.toBeNull();
  });

  it("skips missing / errored files but still builds a zip", async () => {
    const { blob, fileCount, exportedCandidates, skippedCandidates } = await buildCvZip({
      mode: "both",
      entries: [
        entries[0],
        { id: "z9", name: "Nour Hassan", standardised: { status: "missing" }, original: { status: "no access" } },
      ],
      now: NOW,
    });
    const zip = await open(blob);
    expect(pathsOf(zip).filter((p) => !p.endsWith("/"))).toEqual([
      "Original/Sara Ahmed - Original CV.pdf",
      "Standardised/Sara Ahmed - Standardised CV (Mployedin).pdf",
      "export-report.csv",
    ]);
    expect(fileCount).toBe(2);
    expect(exportedCandidates).toBe(1);
    expect(skippedCandidates).toBe(1);
  });

  it("reports zero files when everything failed", async () => {
    const result = await buildCvZip({
      mode: "standardised",
      entries: [{ id: "z9", name: "Nour", standardised: { status: "error", note: "timeout" } }],
      now: NOW,
    });
    expect(result.fileCount).toBe(0);
    expect(result.exportedCandidates).toBe(0);
    expect(result.skippedCandidates).toBe(1);
  });

  it("creates no type folder when no file of that type was written", async () => {
    // Both requested, but every original is missing: no Original/ folder at all.
    const noOriginals = await buildCvZip({
      mode: "both",
      entries: [
        {
          id: "a1",
          name: "Sara Ahmed",
          standardised: { status: "ok", blob: fakeBlob("S", "application/pdf") },
          original: { status: "missing" },
        },
        { id: "b2", name: "Omar Ali", standardised: { status: "ok", blob: fakeBlob("O", "application/pdf") } },
      ],
      now: NOW,
    });
    expect(pathsOf(await open(noOriginals.blob))).toEqual([
      "Standardised/",
      "Standardised/Omar Ali - Standardised CV (Mployedin).pdf",
      "Standardised/Sara Ahmed - Standardised CV (Mployedin).pdf",
      "export-report.csv",
    ]);

    // And the other way round.
    const noStandardised = await buildCvZip({
      mode: "both",
      entries: [
        {
          id: "a1",
          name: "Sara Ahmed",
          standardised: { status: "error", note: "x" },
          original: { status: "ok", blob: fakeBlob("O", "application/pdf"), ext: "pdf" },
        },
      ],
      now: NOW,
    });
    expect(pathsOf(await open(noStandardised.blob))).toEqual([
      "Original/",
      "Original/Sara Ahmed - Original CV.pdf",
      "export-report.csv",
    ]);

    // Nothing written at all: only the report.
    const nothing = await buildCvZip({
      mode: "both",
      entries: [{ id: "z9", name: "Nour", standardised: { status: "missing" }, original: { status: "no access" } }],
      now: NOW,
    });
    expect(pathsOf(await open(nothing.blob))).toEqual(["export-report.csv"]);
  });

  it("keeps every whole file name (stem, suffix, extension) within 200 UTF-8 bytes", async () => {
    const longNames = ["漢".repeat(100), "😀".repeat(60), "س".repeat(100), `${"a".repeat(70)}${"漢".repeat(30)}`];
    const make = (id: string, name: string): CvZipEntry => ({
      id,
      name,
      standardised: { status: "ok", blob: fakeBlob("S", "application/pdf") },
      original: { status: "ok", blob: fakeBlob("O", "application/pdf"), ext: "docx" },
    });
    // Every name twice so the " (2)" de-duplication suffix is exercised too.
    const many = [...longNames, ...longNames].map((n, i) => make(`id${i}`, n));
    const { blob, fileCount } = await buildCvZip({ mode: "both", entries: many, now: NOW });
    const zip = await open(blob);
    const files = Object.keys(zip.files).filter((p) => !p.endsWith("/") && p !== "export-report.csv");
    expect(files).toHaveLength(fileCount);
    expect(fileCount).toBe(16);
    for (const path of files) {
      const leaf = path.split("/").pop() as string;
      expect(bytes(leaf)).toBeLessThanOrEqual(200);
      expect(leaf).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no orphaned high surrogate
    }
  });
});

describe("buildCvZip report", () => {
  it("writes a header and one row per candidate with statuses", async () => {
    const { blob, report } = await buildCvZip({
      mode: "both",
      entries: [
        {
          id: "a1",
          name: "Sara Ahmed",
          standardised: { status: "ok", blob: fakeBlob("S", "application/pdf") },
          original: { status: "ok", blob: fakeBlob("O", "application/pdf"), ext: "pdf" },
        },
        {
          id: "b2",
          name: "Omar Ali",
          standardised: { status: "missing", note: "CV not built yet" },
          original: { status: "no access", note: "not your candidate" },
        },
        {
          id: "c3",
          name: "Nour Hassan",
          standardised: { status: "error", note: "render timed out" },
          original: { status: "error" },
        },
        { id: "d4", name: "Layla Omar" }, // nothing supplied for a requested type -> missing
      ],
      now: NOW,
    });

    expect(report).toEqual([
      {
        name: "Sara Ahmed",
        standardised: "ok",
        original: "ok",
        note: "",
        files: ["Standardised/Sara Ahmed - Standardised CV (Mployedin).pdf", "Original/Sara Ahmed - Original CV.pdf"],
      },
      {
        name: "Omar Ali",
        standardised: "missing",
        original: "no access",
        note: "Standardised: CV not built yet; Original: not your candidate",
        files: [],
      },
      {
        name: "Nour Hassan",
        standardised: "error",
        original: "error",
        note: "Standardised: render timed out",
        files: [],
      },
      { name: "Layla Omar", standardised: "missing", original: "missing", note: "", files: [] },
    ]);

    const rows = await readReport(await open(blob));
    expect(rows[0]).toEqual(["name", "standardised", "original", "note", "files"]);
    expect(rows).toHaveLength(5);
    expect(rows[1]).toEqual([
      "Sara Ahmed",
      "ok",
      "ok",
      "",
      "Standardised/Sara Ahmed - Standardised CV (Mployedin).pdf | Original/Sara Ahmed - Original CV.pdf",
    ]);
    expect(rows[2]).toEqual([
      "Omar Ali",
      "missing",
      "no access",
      "Standardised: CV not built yet; Original: not your candidate",
      "",
    ]);
  });

  it("lists the actual written file path(s), so duplicate names match their (2) files", async () => {
    const dup = (id: string): CvZipEntry => ({
      id,
      name: "Sara Ahmed",
      standardised: { status: "ok", blob: fakeBlob(`S-${id}`, "application/pdf") },
      original: { status: "ok", blob: fakeBlob(`O-${id}`, "application/vnd.ms-word"), ext: "DOC" },
    });
    const { blob, report } = await buildCvZip({
      mode: "both",
      entries: [dup("a1"), dup("a2"), { id: "a3", name: "Sara Ahmed", standardised: { status: "missing" } }],
      now: NOW,
    });
    expect(report.map((r) => r.name)).toEqual(["Sara Ahmed", "Sara Ahmed", "Sara Ahmed"]);
    expect(report[0].files).toEqual([
      "Standardised/Sara Ahmed - Standardised CV (Mployedin).pdf",
      "Original/Sara Ahmed - Original CV.doc",
    ]);
    expect(report[1].files).toEqual([
      "Standardised/Sara Ahmed (2) - Standardised CV (Mployedin).pdf",
      "Original/Sara Ahmed (2) - Original CV.doc",
    ]);
    expect(report[2].files).toEqual([]);

    // Every listed path really exists in the ZIP, and nothing else is a CV file.
    const zip = await open(blob);
    const listed = report.flatMap((r) => r.files).sort();
    const actual = Object.keys(zip.files)
      .filter((p) => !p.endsWith("/") && p !== "export-report.csv")
      .sort();
    expect(listed).toEqual(actual);

    // The same paths are in the CSV, joined with " | " ("|" cannot occur in a file name).
    const rows = await readReport(zip);
    expect(rows[2][4]).toBe(report[1].files.join(" | "));
    expect(rows[3][4]).toBe("");
  });

  it("lists only the requested type's file in single-type modes", async () => {
    const { report } = await buildCvZip({
      mode: "standardised",
      entries: [
        {
          id: "a1",
          name: "Sara",
          standardised: { status: "ok", blob: fakeBlob("S", "application/pdf") },
          original: { status: "ok", blob: fakeBlob("O", "application/pdf"), ext: "pdf" },
        },
      ],
      now: NOW,
    });
    expect(report[0].files).toEqual(["Standardised/Sara - Standardised CV (Mployedin).pdf"]);
  });

  it("omits the type label from notes when only one type was requested", async () => {
    const { report } = await buildCvZip({
      mode: "original",
      entries: [{ id: "a1", name: "Sara", original: { status: "error", note: "HTTP 500" } }],
      now: NOW,
    });
    expect(report[0]).toEqual({ name: "Sara", standardised: "", original: "error", note: "HTTP 500", files: [] });
  });

  it("starts the CSV with a UTF-8 BOM so Excel shows Arabic", async () => {
    const { blob } = await buildCvZip({
      mode: "standardised",
      entries: [{ id: "a1", name: "سارة أحمد", standardised: { status: "missing" } }],
      now: NOW,
    });
    const zip = await open(blob);
    const bytes = await zip.file("export-report.csv")!.async("uint8array");
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const rows = await readReport(zip);
    expect(rows[1][0]).toBe("سارة أحمد");
  });

  it("quotes cells containing commas, quotes and newlines", async () => {
    const { blob } = await buildCvZip({
      mode: "standardised",
      entries: [
        {
          id: "a1",
          name: 'Ali, "AJ" Khan',
          standardised: { status: "error", note: "line one\nline two, with comma" },
        },
      ],
      now: NOW,
    });
    const zip = await open(blob);
    const raw = stripBom(await zip.file("export-report.csv")!.async("string"));
    expect(raw).toContain('"Ali, ""AJ"" Khan"');
    const rows = parseCsv(raw);
    expect(rows[1]).toEqual(['Ali, "AJ" Khan', "error", "", "line one\nline two, with comma", ""]);
  });

  it("neutralises spreadsheet formula injection", async () => {
    const { blob } = await buildCvZip({
      mode: "standardised",
      entries: [
        { id: "a1", name: "=HYPERLINK(\"http://evil\")", standardised: { status: "error", note: "+SUM(A1)" } },
        { id: "b2", name: "@cmd", standardised: { status: "error", note: "-2+3" } },
        { id: "c3", name: "\tTabbed", standardised: { status: "missing" } },
      ],
      now: NOW,
    });
    const rows = await readReport(await open(blob));
    expect(rows[1][0]).toBe("'=HYPERLINK(\"http://evil\")");
    expect(rows[1][3]).toBe("'+SUM(A1)");
    expect(rows[2][0]).toBe("'@cmd");
    expect(rows[2][3]).toBe("'-2+3");
    // Leading tab/CR cannot survive: names and notes are trimmed before they reach the CSV.
    expect(rows[3][0]).toBe("Tabbed");
  });

  it("uses the generated fallback name in the report for a nameless candidate", async () => {
    const { report } = await buildCvZip({
      mode: "standardised",
      entries: [{ id: "64f0a1b2c3d4e5f6a7b8c9d0", name: "", standardised: { status: "missing" } }],
      now: NOW,
    });
    expect(report[0].name).toBe("Candidate b8c9d0");
  });
});

describe("buildCvZip candidates.xlsx", () => {
  const entries: CvZipEntry[] = [
    {
      id: "a1",
      name: "Sara Ahmed",
      standardised: { status: "ok", blob: fakeBlob("S", "application/pdf") },
      original: { status: "missing" },
    },
    {
      id: "b2",
      name: "Omar Ali",
      standardised: { status: "error" },
      original: { status: "ok", blob: fakeBlob("O", "application/pdf"), ext: "pdf" },
    },
  ];
  const details = {
    header: ["Name", "Email"],
    rowsById: new Map<string, string[]>([
      ["a1", ["Sara Ahmed", "sara@example.com"]],
      ["b2", ["Omar Ali", "omar@example.com"]],
    ]),
  };

  async function sheetCells(zipBlob: Blob): Promise<string[][]> {
    const outer = await open(zipBlob);
    const xlsx = await outer.file("candidates.xlsx")!.async("uint8array");
    const inner = await JSZip.loadAsync(xlsx);
    const xml = await inner.file("xl/worksheets/sheet1.xml")!.async("string");
    return Array.from(xml.matchAll(/<row [^>]*>(.*?)<\/row>/g)).map((row) =>
      Array.from(row[1].matchAll(/<t[^>]*>(.*?)<\/t>/g)).map((c) => c[1]),
    );
  }

  it("is omitted when no details are given", async () => {
    const { blob } = await buildCvZip({ mode: "both", entries, now: NOW });
    expect((await open(blob)).file("candidates.xlsx")).toBeNull();
  });

  it("appends Standardised / Original Yes/No columns in both mode", async () => {
    const { blob } = await buildCvZip({ mode: "both", entries, details, now: NOW });
    expect(await sheetCells(blob)).toEqual([
      ["Name", "Email", "Standardised", "Original"],
      ["Sara Ahmed", "sara@example.com", "Yes", "No"],
      ["Omar Ali", "omar@example.com", "No", "Yes"],
    ]);
  });

  it("leaves the column blank for a type the export did not include", async () => {
    const { blob } = await buildCvZip({ mode: "standardised", entries, details, now: NOW });
    const cells = await sheetCells(blob);
    expect(cells[0]).toEqual(["Name", "Email", "Standardised", "Original"]);
    // An empty cell is still emitted as an (empty) <t/>, which the matcher reads as "".
    expect(cells[1].slice(0, 3)).toEqual(["Sara Ahmed", "sara@example.com", "Yes"]);
    expect(cells[2].slice(0, 3)).toEqual(["Omar Ali", "omar@example.com", "No"]);
    expect(cells[1][3] ?? "").toBe("");
  });

  it("matches details to entries by id, whatever order the map was built in", async () => {
    // Map built in the opposite order from entries: rows follow entries, flags follow ids.
    const reversed = {
      header: ["Name", "Email"],
      rowsById: new Map<string, string[]>([
        ["b2", ["Omar Ali", "omar@example.com"]],
        ["a1", ["Sara Ahmed", "sara@example.com"]],
      ]),
    };
    const { blob } = await buildCvZip({ mode: "both", entries, details: reversed, now: NOW });
    expect(await sheetCells(blob)).toEqual([
      ["Name", "Email", "Standardised", "Original"],
      ["Sara Ahmed", "sara@example.com", "Yes", "No"],
      ["Omar Ali", "omar@example.com", "No", "Yes"],
    ]);

    // And entries in a different order than the details were supplied in.
    const { blob: swapped } = await buildCvZip({
      mode: "both",
      entries: [entries[1], entries[0]],
      details,
      now: NOW,
    });
    expect(await sheetCells(swapped)).toEqual([
      ["Name", "Email", "Standardised", "Original"],
      ["Omar Ali", "omar@example.com", "No", "Yes"],
      ["Sara Ahmed", "sara@example.com", "Yes", "No"],
    ]);
  });

  it("omits entries that have no details row and ignores details for unknown ids", async () => {
    const partial = {
      header: ["Name", "Email"],
      rowsById: new Map<string, string[]>([
        ["b2", ["Omar Ali", "omar@example.com"]],
        ["ghost", ["Nobody", "nobody@example.com"]],
      ]),
    };
    const { blob } = await buildCvZip({ mode: "both", entries, details: partial, now: NOW });
    expect(await sheetCells(blob)).toEqual([
      ["Name", "Email", "Standardised", "Original"],
      ["Omar Ali", "omar@example.com", "No", "Yes"],
    ]);
  });

  it("pads or trims a row to the header width so the flag columns stay aligned", async () => {
    const ragged = {
      header: ["Name", "Email", "Phone"],
      rowsById: new Map<string, string[]>([
        ["a1", ["Sara Ahmed"]], // short
        ["b2", ["Omar Ali", "omar@example.com", "0501234567", "extra"]], // long
      ]),
    };
    const { blob } = await buildCvZip({ mode: "both", entries, details: ragged, now: NOW });
    expect(await sheetCells(blob)).toEqual([
      ["Name", "Email", "Phone", "Standardised", "Original"],
      ["Sara Ahmed", "", "", "Yes", "No"],
      ["Omar Ali", "omar@example.com", "0501234567", "No", "Yes"],
    ]);
  });
});

describe("buildCvZip compression", () => {
  /** Compression method per entry, read from the ZIP's central directory (0 = stored, 8 = deflated). */
  function methodsOf(buf: Buffer): Record<string, number> {
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const methods: Record<string, number> = {};
    for (let n = 0; n < count; n += 1) {
      const nameLength = buf.readUInt16LE(p + 28);
      const extraLength = buf.readUInt16LE(p + 30);
      const commentLength = buf.readUInt16LE(p + 32);
      methods[buf.toString("utf8", p + 46, p + 46 + nameLength)] = buf.readUInt16LE(p + 10);
      p += 46 + nameLength + extraLength + commentLength;
    }
    return methods;
  }

  const STORED = 0;
  const DEFLATED = 8;

  const entries: CvZipEntry[] = [
    {
      id: "a1",
      name: "Sara",
      standardised: { status: "ok", blob: fakeBlob("%PDF-STD ".repeat(40), "application/pdf") },
      original: { status: "ok", blob: fakeBlob("%PDF-ORIG ".repeat(40), "application/pdf"), ext: "pdf" },
    },
    { id: "b2", name: "Omar", original: { status: "ok", blob: fakeBlob("DOCX ".repeat(40), "application/zip"), ext: "docx" } },
    { id: "c3", name: "Lina", original: { status: "ok", blob: fakeBlob("PNG ".repeat(40), "image/png"), ext: "png" } },
    { id: "d4", name: "Hana", original: { status: "ok", blob: fakeBlob("JPG ".repeat(40), "image/jpeg"), ext: "jpg" } },
    { id: "e5", name: "Tariq", original: { status: "ok", blob: fakeBlob("plain text ".repeat(40), "text/plain"), ext: "txt" } },
  ];
  const details = { header: ["Name"], rowsById: new Map<string, string[]>([["a1", ["Sara"]]]) };

  it("stores already-compressed CV files and deflates the text and the sheet", async () => {
    const { blob } = await buildCvZip({ mode: "both", entries, details, now: NOW });
    const methods = methodsOf(await blobToBuffer(blob));

    expect(methods["Standardised/Sara - Standardised CV (Mployedin).pdf"]).toBe(STORED);
    expect(methods["Original/Sara - Original CV.pdf"]).toBe(STORED);
    expect(methods["Original/Omar - Original CV.docx"]).toBe(STORED);
    expect(methods["Original/Lina - Original CV.png"]).toBe(STORED);
    expect(methods["Original/Hana - Original CV.jpg"]).toBe(STORED);
    // Text compresses well, so it is still deflated.
    expect(methods["Original/Tariq - Original CV.txt"]).toBe(DEFLATED);
    expect(methods["candidates.xlsx"]).toBe(DEFLATED);
    expect(methods["export-report.csv"]).toBe(DEFLATED);
  });

  it("does not change what is inside the stored files", async () => {
    const { blob } = await buildCvZip({ mode: "both", entries, now: NOW });
    const zip = await open(blob);
    expect(await zip.file("Original/Omar - Original CV.docx")!.async("string")).toBe("DOCX ".repeat(40));
    expect(await zip.file("Standardised/Sara - Standardised CV (Mployedin).pdf")!.async("string")).toBe("%PDF-STD ".repeat(40));
  });
});
