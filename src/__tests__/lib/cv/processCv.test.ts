/**
 * @jest-environment node
 *
 * Reading one CV record: text layer or AI vision, reuse of an identical file,
 * retries and permanent failures, and the profile auto-fill that must never
 * overwrite what the seeker typed.
 */

type Rec = Record<string, unknown>;

// ── A tiny in-memory stand-in for the two collections the reader writes ──────

function get(rec: Rec, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Rec)[k] : undefined), rec);
}

function matches(rec: Rec, filter: Rec): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Rec[]).some((f) => matches(rec, f));
    const value = get(rec, key);
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      const c = cond as Rec;
      if ("$ne" in c) return String(value) !== String(c.$ne);
      if ("$lt" in c) return value instanceof Date && value < (c.$lt as Date);
      if ("$exists" in c) return (value !== undefined) === c.$exists;
      if ("$size" in c) return Array.isArray(value) && value.length === c.$size;
    }
    if (cond === null) return value === null;
    return String(value) === String(cond);
  });
}

function applyUpdate(rec: Rec, update: Rec): void {
  for (const [k, v] of Object.entries((update.$set as Rec) ?? {})) {
    const parts = k.split(".");
    let target = rec;
    for (const p of parts.slice(0, -1)) target = (target[p] ??= {}) as Rec;
    target[parts[parts.length - 1]] = v;
  }
  for (const k of Object.keys((update.$unset as Rec) ?? {})) delete rec[k];
  for (const [k, v] of Object.entries((update.$inc as Rec) ?? {})) rec[k] = ((rec[k] as number) ?? 0) + (v as number);
  rec.updatedAt = new Date();
}

const chain = (value: unknown) => {
  const q = { select: () => q, lean: () => Promise.resolve(value) };
  return q;
};

function collection() {
  const rows: Rec[] = [];
  return {
    rows,
    findById: (id: string) => chain(rows.find((r) => String(r._id) === String(id)) ?? null),
    findOne: (filter: Rec) => chain(rows.find((r) => matches(r, filter)) ?? null),
    exists: async (filter: Rec) => (rows.some((r) => matches(r, filter)) ? { _id: "x" } : null),
    findOneAndUpdate: (filter: Rec, update: Rec) => {
      const row = rows.find((r) => matches(r, filter));
      if (row) applyUpdate(row, update);
      return chain(row ? { ...row } : null);
    },
    updateOne: async (filter: Rec, update: Rec) => {
      const row = rows.find((r) => matches(r, filter));
      if (!row) return { modifiedCount: 0 };
      applyUpdate(row, update);
      return { modifiedCount: 1 };
    },
  };
}

const cvDocs = collection();
const seekers = collection();
const distinct = jest.fn().mockResolvedValue(["job1"]);

/** Resolved at call time: jest hoists the factories above the collections. */
function lazy(target: () => object): object {
  return new Proxy({}, { get: (_t, key) => (target() as Record<string | symbol, unknown>)[key] });
}

jest.mock("@/models/CvDocument", () => ({ __esModule: true, default: lazy(() => cvDocs) }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: lazy(() => seekers) }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { distinct: (...a: unknown[]) => distinct(...a) } }));

const downloadBuffer = jest.fn();
jest.mock("@/lib/storage/spaces", () => ({ downloadBuffer: (...a: unknown[]) => downloadBuffer(...a) }));
const extractResumeText = jest.fn();
jest.mock("@/lib/ats/analyzeCv", () => ({ extractResumeText: (...a: unknown[]) => extractResumeText(...a) }));
const generateText = jest.fn();
const generateMultimodal = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  GEMINI_MODELS: { flash: "flash" },
  generateText: (...a: unknown[]) => generateText(...a),
  generateMultimodal: (...a: unknown[]) => generateMultimodal(...a),
}));
jest.mock("@/lib/ai/sanitize", () => ({ AI_TOKEN_LIMITS: { cv_extract: 16000 } }));
jest.mock("@/lib/jobSeeker/profileCompleteness", () => ({ profileCompletenessScore: jest.fn(() => 77) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { processCvDocument, MAX_CV_ATTEMPTS } from "@/lib/cv/processCv";
import { CV_PARSER_VERSION } from "@/lib/cv/parsedCv";

const SEEKER = "seeker1";
const URL = "https://cdn/cvs/antony.pdf";
const LONG_TEXT = "Antony P — Sales leader. Channel Sales, Distribution Management. ".repeat(10);
const AI_JSON = JSON.stringify({
  headline: "Sales leader",
  currentLocation: "Cherthala, Kerala",
  skills: [{ name: "Channel Sales" }, { name: "Distribution Management" }],
  experience: [{ jobTitle: "AGM Sales", company: "Sowparnika", from: "2023-02", to: "present", current: true }],
  education: [{ degree: "MBA", institution: "Kerala University", to: "2008" }],
  languages: [{ language: "English", level: "fluent" }],
  certifications: [],
});

function addCv(extra: Rec = {}): string {
  const id = `cv${cvDocs.rows.length + 1}`;
  cvDocs.rows.push({ _id: id, jobSeekerId: SEEKER, fileUrl: URL, status: "uploaded", attempts: 0, updatedAt: new Date(), ...extra });
  return id;
}

const row = (id: string) => cvDocs.rows.find((r) => r._id === id) as Rec;
const seeker = () => seekers.rows.find((r) => r._id === SEEKER) as Rec;

beforeEach(() => {
  cvDocs.rows.length = 0;
  seekers.rows.length = 0;
  jest.clearAllMocks();
  distinct.mockResolvedValue(["job1"]);
  downloadBuffer.mockResolvedValue(Buffer.from("%PDF file bytes"));
  extractResumeText.mockResolvedValue({ text: LONG_TEXT });
  generateText.mockResolvedValue(AI_JSON);
  generateMultimodal.mockResolvedValue(AI_JSON);
  // The seeker typed their job history but left skills and location empty.
  seekers.rows.push({
    _id: SEEKER,
    cv: { originalUrl: URL },
    skills: [],
    experience: [{ jobTitle: "Typed role", company: "Typed Co" }],
    currentLocation: "",
  });
});

describe("processCvDocument", () => {
  it("ignores a record that does not exist here (another environment's event)", async () => {
    await expect(processCvDocument("nope")).resolves.toEqual({ outcome: "missing" });
    expect(downloadBuffer).not.toHaveBeenCalled();
  });

  it("skips a CV already read by this parser", async () => {
    const id = addCv({ status: "processed", parserVersion: CV_PARSER_VERSION });
    await expect(processCvDocument(id)).resolves.toEqual({ outcome: "skipped", status: "processed" });
    expect(downloadBuffer).not.toHaveBeenCalled();
  });

  it("skips a CV another run is reading right now", async () => {
    const id = addCv({ status: "processing" });
    await expect(processCvDocument(id)).resolves.toEqual({ outcome: "skipped", status: "processing" });
  });

  it("reads the text layer, parses it once, fills only the empty profile sections", async () => {
    const id = addCv();
    const result = await processCvDocument(id);

    expect(result).toEqual({
      outcome: "processed",
      textSource: "text_layer",
      parsed: true,
      profileFilled: ["skills", "education", "languages", "currentLocation", "summary"],
      jobIds: ["job1"],
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][0]).toContain("CV text:\nAntony P");
    expect(generateMultimodal).not.toHaveBeenCalled();

    const doc = row(id);
    expect(doc).toMatchObject({ status: "processed", textSource: "text_layer", parserVersion: CV_PARSER_VERSION, attempts: 0 });
    expect(doc.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((doc.parsed as { skills: string[] }).skills).toEqual(["Channel Sales", "Distribution Management"]);

    const s = seeker();
    expect(s.skills).toEqual(["Channel Sales", "Distribution Management"]);
    // What the seeker typed is untouched.
    expect(s.experience).toEqual([{ jobTitle: "Typed role", company: "Typed Co" }]);
    expect(s.currentLocation).toBe("Cherthala, Kerala");
    expect((s.cv as Rec).rawText).toBe(LONG_TEXT);
    expect(s.profileCompleteness).toBe(77);
  });

  it("re-scores the applications sent with the file, and the resume-less ones when it is the profile CV", async () => {
    const id = addCv();
    await processCvDocument(id);
    expect(distinct).toHaveBeenCalledWith("jobId", {
      jobSeekerId: SEEKER,
      status: { $ne: "withdrawn" },
      $or: [{ "documents.url": URL }, { "documents.type": { $ne: "resume" } }],
    });
  });

  it("fills the stated total only while the profile's is still the default 0", async () => {
    generateText.mockResolvedValue(JSON.stringify({ ...JSON.parse(AI_JSON), totalExperienceYears: 6 }));
    const id = addCv();
    const result = await processCvDocument(id);
    expect(result).toMatchObject({ outcome: "processed", profileFilled: expect.arrayContaining(["totalExperienceYears"]) });
    expect(seeker().totalExperienceYears).toBe(6);

    // Read again after the seeker typed their own total: it stays theirs.
    seeker().totalExperienceYears = 9;
    row(id).status = "uploaded";
    await processCvDocument(id);
    expect(seeker().totalExperienceYears).toBe(9);
  });

  it("does not touch the profile for a CV that is not the profile CV", async () => {
    const id = addCv({ fileUrl: "https://cdn/documents/old.pdf" });
    const result = await processCvDocument(id);
    expect(result).toMatchObject({ outcome: "processed", profileFilled: [] });
    expect(seeker().skills).toEqual([]);
    expect(distinct.mock.calls[0][1].$or).toEqual([{ "documents.url": "https://cdn/documents/old.pdf" }]);
  });

  it("copies the reading of an identical file instead of paying for it again", async () => {
    const buffer = Buffer.from("%PDF same bytes");
    downloadBuffer.mockResolvedValue(buffer);
    const { createHash } = await import("crypto");
    const fingerprint = createHash("sha256").update(buffer).digest("hex");
    addCv({ fileUrl: "https://cdn/documents/first.pdf", status: "processed", parserVersion: CV_PARSER_VERSION, fingerprint, text: "first text", parsed: JSON.parse(AI_JSON) });
    const id = addCv();

    const result = await processCvDocument(id);
    expect(result).toMatchObject({ outcome: "processed", textSource: "reused", parsed: true });
    expect(generateText).not.toHaveBeenCalled();
    expect(extractResumeText).not.toHaveBeenCalled();
    expect(row(id).text).toBe("first text");
  });

  it("lets the AI read a scan with no text layer", async () => {
    extractResumeText.mockResolvedValue({ text: "" });
    const id = addCv();
    const result = await processCvDocument(id);
    expect(result).toMatchObject({ outcome: "processed", textSource: "ai_vision" });
    expect(generateMultimodal).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();
    expect(row(id).text).toContain("Skills: Channel Sales, Distribution Management");
  });

  it("marks a scan the AI finds nothing in as unreadable, without retrying", async () => {
    extractResumeText.mockResolvedValue({ text: "" });
    generateMultimodal.mockResolvedValue("{}");
    const id = addCv();
    await expect(processCvDocument(id)).resolves.toEqual({ outcome: "failed", error: "unreadable", jobIds: ["job1"] });
    expect(row(id)).toMatchObject({ status: "failed", error: "unreadable" });
  });

  it("marks a missing file failed at once", async () => {
    downloadBuffer.mockRejectedValue(Object.assign(new Error("gone"), { name: "NoSuchKey" }));
    const id = addCv();
    await expect(processCvDocument(id)).resolves.toMatchObject({ outcome: "failed", error: "file_missing" });
    expect(row(id).attempts).toBe(1);
  });

  it("refuses a file type it cannot read (an old .doc)", async () => {
    extractResumeText.mockResolvedValue({ text: "" });
    const id = addCv({ fileUrl: "https://cdn/cvs/old.doc" });
    await expect(processCvDocument(id)).resolves.toMatchObject({ outcome: "failed", error: "unsupported_type" });
    expect(generateMultimodal).not.toHaveBeenCalled();
  });

  it("puts a transient failure back for the queue to retry", async () => {
    generateText.mockRejectedValue(new Error("AI 503"));
    const id = addCv();
    await expect(processCvDocument(id)).rejects.toThrow("AI 503");
    expect(row(id)).toMatchObject({ status: "uploaded", error: "error", attempts: 1 });
  });

  it("keeps the text when the parser still fails on the last attempt", async () => {
    generateText.mockRejectedValue(new Error("AI 503"));
    const id = addCv({ attempts: MAX_CV_ATTEMPTS - 1 });
    const result = await processCvDocument(id);
    expect(result).toMatchObject({ outcome: "processed", textSource: "text_layer", parsed: false });
    expect(row(id)).toMatchObject({ status: "processed", error: "parse_failed", text: LONG_TEXT, parsed: null });
    // Text only: the profile keeps its text evidence, no section is filled.
    expect((seeker().cv as Rec).rawText).toBe(LONG_TEXT);
    expect(seeker().skills).toEqual([]);
  });

  it("gives up after the last attempt when the file cannot be fetched", async () => {
    downloadBuffer.mockRejectedValue(new Error("socket hang up"));
    const id = addCv({ attempts: MAX_CV_ATTEMPTS - 1 });
    await expect(processCvDocument(id)).resolves.toMatchObject({ outcome: "failed", error: "error" });
    expect(row(id).status).toBe("failed");
  });

  it("reclaims a record stuck in a run that died", async () => {
    const id = addCv({ status: "processing", attempts: 1 });
    row(id).updatedAt = new Date(Date.now() - 60 * 60 * 1000);
    await expect(processCvDocument(id)).resolves.toMatchObject({ outcome: "processed" });
    expect(row(id).status).toBe("processed");
  });

  it("gives a re-read under a new parser the full retry budget", async () => {
    // Read on its last try: the count restarts once the reading is saved.
    const id = addCv({ attempts: MAX_CV_ATTEMPTS - 1 });
    await processCvDocument(id);
    expect(row(id).attempts).toBe(0);

    // A parser bump queues it again; a transient failure is retried, not final.
    row(id).parserVersion = CV_PARSER_VERSION - 1;
    generateText.mockRejectedValue(new Error("AI 503"));
    await expect(processCvDocument(id)).rejects.toThrow("AI 503");
    expect(row(id)).toMatchObject({ status: "uploaded", attempts: 1 });
  });

  it("writes nothing to the profile when a newer CV replaced this one before the writes", async () => {
    const id = addCv();
    // The seeker swaps the profile CV right after the "is it the profile CV?" check.
    const realFindOne = seekers.findOne;
    seekers.findOne = (filter: Rec) => {
      const query = realFindOne(filter);
      (seeker().cv as Rec).originalUrl = "https://cdn/cvs/newer.pdf";
      return query;
    };
    try {
      const result = await processCvDocument(id);
      expect(result).toMatchObject({ outcome: "processed", profileFilled: [] });
    } finally {
      seekers.findOne = realFindOne;
    }
    expect((seeker().cv as Rec).rawText).toBeUndefined();
    expect(seeker().skills).toEqual([]);
  });
});
