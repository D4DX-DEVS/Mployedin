/**
 * @jest-environment node
 *
 * "Create job with AI" from an uploaded file: which reader gets the document
 * and which model answers. A PDF's own text goes to the text model (no page
 * images); only a scan or an image goes to the vision path. Every path uses
 * the extraction model, because the answer carries the job's skills and
 * Qwen supported only 3/10 extracted skills in the 2026-10-16 probe.
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const PDF_MIME = "application/pdf";
const JOBS_JSON = JSON.stringify({ jobs: [{ title: "Staff Nurse", requirements: { skills: ["Patient care"] } }] });
const LONG_LAYER = "Staff Nurse wanted at Gulf Care Clinic, Dubai. ".repeat(10);

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => ({ user: { id: EMPLOYER_USER, role: "employer" } })) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
  RATE_LIMIT_CONFIGS: { upload: {} },
}));
jest.mock("@/lib/ai/dailyQuota", () => ({ enforceDailyAiQuota: jest.fn(async () => null) }));
jest.mock("@/lib/security/file-validation", () => ({ validateUploadedFile: jest.fn(() => null) }));
jest.mock("@/lib/security/malware-scan", () => ({ scanForMalware: jest.fn(async () => ({ clean: true })) }));
jest.mock("@/lib/jobs/agentPosting", () => ({ agentPostingFor: jest.fn() }));

const generateMultimodal = jest.fn();
const generateText = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  generateMultimodal: (...a: unknown[]) => generateMultimodal(...a),
  generateText: (...a: unknown[]) => generateText(...a),
  extractionModel: () => "extraction-model",
  GEMINI_MODELS: { flash: "flash" },
}));

const extractResumeText = jest.fn();
jest.mock("@/lib/ats/analyzeCv", () => ({ extractResumeText: (...a: unknown[]) => extractResumeText(...a) }));

const lean = (value: unknown) => ({ select: () => ({ lean: async () => value }), lean: async () => value });
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn(() => lean({ _id: EMPLOYER_ID, companyName: "Gulf Care Clinic" })),
    findById: jest.fn(() => lean({ _id: EMPLOYER_ID, companyName: "Gulf Care Clinic" })),
  },
}));
jest.mock("@/models/ExtractionDraft", () => ({ ExtractionDraft: { create: jest.fn(async () => ({ _id: "draft1" })) } }));

function upload(name: string, type: string, bytes: number[]) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return new NextRequest("http://localhost/api/ai/job-extract", { method: "POST", body: form });
}
const pdf = () => upload("vacancy.pdf", PDF_MIME, [0x25, 0x50, 0x44, 0x46]);

beforeEach(() => {
  generateMultimodal.mockReset().mockResolvedValue(JOBS_JSON);
  generateText.mockReset().mockResolvedValue(JOBS_JSON);
  extractResumeText.mockReset();
});

describe("job-extract: reader and model per file", () => {
  it("sends a PDF's own text to the text model, with no page images", async () => {
    extractResumeText.mockResolvedValue({ text: LONG_LAYER });
    const { POST } = await import("@/app/api/ai/job-extract/route");
    const res = await POST(pdf());
    expect(res.status).toBe(200);
    expect(generateMultimodal).not.toHaveBeenCalled();
    expect(generateText).toHaveBeenCalledTimes(1);
    const [prompt, model] = generateText.mock.calls[0];
    expect(prompt).toContain("Staff Nurse wanted at Gulf Care Clinic");
    expect(model).toBe("extraction-model");
  });

  it("sends a scanned PDF (almost no text of its own) to the vision path", async () => {
    extractResumeText.mockResolvedValue({ text: "Page 1" });
    const { POST } = await import("@/app/api/ai/job-extract/route");
    const res = await POST(pdf());
    expect(res.status).toBe(200);
    expect(generateText).not.toHaveBeenCalled();
    expect(generateMultimodal).toHaveBeenCalledTimes(1);
    const [parts, model] = generateMultimodal.mock.calls[0];
    expect(parts[1].inlineData.mimeType).toBe(PDF_MIME);
    expect(model).toBe("extraction-model");
  });

  it("falls back to the vision path when the PDF text can't be read", async () => {
    extractResumeText.mockRejectedValue(new Error("bad xref"));
    const { POST } = await import("@/app/api/ai/job-extract/route");
    const res = await POST(pdf());
    expect(res.status).toBe(200);
    expect(generateMultimodal).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("sends an image straight to the vision path, without looking for a text layer", async () => {
    const { POST } = await import("@/app/api/ai/job-extract/route");
    const res = await POST(upload("poster.png", "image/png", [0x89, 0x50, 0x4e, 0x47]));
    expect(res.status).toBe(200);
    expect(extractResumeText).not.toHaveBeenCalled();
    expect(generateMultimodal).toHaveBeenCalledTimes(1);
    expect(generateMultimodal.mock.calls[0][1]).toBe("extraction-model");
  });
});
