/**
 * @jest-environment node
 *
 * qwen/qwen3.7-flash reads images but not PDFs. generateMultimodal renders a
 * PDF to one PNG per page for any model that cannot read PDFs, and gives
 * vision calls a longer timeout: Qwen took ~33 s per 2-page CV on 2026-10-15,
 * against the 20 s default. Gemini still gets the PDF itself.
 */

const providerFetch = jest.fn();
jest.mock("@/lib/ai/providerFetch", () => ({
  providerFetch: (...args: unknown[]) => providerFetch(...args),
}));
const pdfToImages = jest.fn();
jest.mock("@/lib/cv/pdfToImages", () => ({
  pdfToImages: (...args: unknown[]) => pdfToImages(...args),
}));

import { generateMultimodal, GEMINI_MODELS } from "@/lib/ai/gemini";
import { visionTimeoutMs } from "@/lib/ai/visionInput";
import { modelReadsPdf } from "@/lib/ai/modelCapabilities";

interface SentBody {
  model: string;
  messages: { content: Record<string, unknown>[] }[];
  plugins?: unknown;
}

const PDF_B64 = Buffer.from("%PDF-1.4 test").toString("base64");
const saved = { ...process.env };

function sent(call = 0): { body: SentBody; timeout: unknown } {
  const [, init, , timeout] = providerFetch.mock.calls[call] as [string, RequestInit, string, unknown];
  return { body: JSON.parse(init.body as string) as SentBody, timeout };
}

function page(pageNumber: number, bytes: number[]) {
  return { pageNumber, png: Uint8Array.from(bytes), dataUrl: "", width: 1400, height: 1980 };
}

const pngPart = (bytes: number[]) => ({
  type: "image_url",
  image_url: { url: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` },
});

beforeEach(() => {
  providerFetch.mockReset();
  pdfToImages.mockReset();
  process.env.OPENROUTER_API_KEY = "or-test-key";
  delete process.env.AI_TEXT_PROVIDER;
  process.env.OPENROUTER_TEXT_MODEL = "qwen/qwen3.7-flash";
  // A fresh Response per call: a body can be read only once.
  providerFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content: "read" }, finish_reason: "stop" }] }), {
        status: 200,
      }),
    ),
  );
});

afterAll(() => {
  process.env = { ...saved };
});

describe("generateMultimodal with a model that cannot read PDFs", () => {
  it("sends one image per page, no PDF parser, and a vision-sized timeout", async () => {
    pdfToImages.mockResolvedValue({ totalPages: 2, pages: [page(1, [1, 2, 3]), page(2, [4, 5, 6])] });

    const text = await generateMultimodal(
      [{ text: "Transcribe" }, { inlineData: { mimeType: "application/pdf", data: PDF_B64 } }],
      GEMINI_MODELS.flash,
      8000,
    );

    expect(text).toBe("read");
    expect(pdfToImages).toHaveBeenCalledWith(Buffer.from(PDF_B64, "base64"));
    const { body, timeout } = sent();
    expect(body.model).toBe("qwen/qwen3.7-flash");
    expect(body.messages[0].content).toEqual([{ type: "text", text: "Transcribe" }, pngPart([1, 2, 3]), pngPart([4, 5, 6])]);
    expect(body.plugins).toBeUndefined();
    expect(timeout).toBe(visionTimeoutMs(2));
  });

  it("passes an image through untouched and still sizes the timeout for vision", async () => {
    await generateMultimodal([{ text: "Transcribe" }, { inlineData: { mimeType: "image/png", data: "aGk=" } }]);

    expect(pdfToImages).not.toHaveBeenCalled();
    const { body, timeout } = sent();
    expect(body.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,aGk=" } });
    expect(timeout).toBe(visionTimeoutMs(1));
  });

  it("refuses a PDF with no pages instead of sending the model nothing", async () => {
    pdfToImages.mockResolvedValue({ totalPages: 0, pages: [] });
    await expect(
      generateMultimodal([{ inlineData: { mimeType: "application/pdf", data: PDF_B64 } }]),
    ).rejects.toThrow(/no pages/);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});

describe("generateMultimodal with Gemini", () => {
  it("still sends the PDF itself, with Gemini's own reader and the default timeout", async () => {
    process.env.OPENROUTER_TEXT_MODEL = "google/gemini-3.1-flash-lite";
    await generateMultimodal([{ text: "Extract" }, { inlineData: { mimeType: "application/pdf", data: PDF_B64 } }]);

    expect(pdfToImages).not.toHaveBeenCalled();
    const { body, timeout } = sent();
    expect(body.messages[0].content[1]).toMatchObject({ type: "file" });
    expect(body.plugins).toEqual([{ id: "file-parser", pdf: { engine: "native" } }]);
    expect(timeout).toBeUndefined();
  });
});

describe("helpers", () => {
  it("knows which models read PDFs", () => {
    expect(modelReadsPdf("google/gemini-3.1-flash-lite")).toBe(true);
    expect(modelReadsPdf("qwen/qwen3.7-flash")).toBe(false);
  });

  it("grows the vision timeout with page count, capped at 150 s", () => {
    expect(visionTimeoutMs(1)).toBe(50_000);
    expect(visionTimeoutMs(2)).toBe(70_000);
    expect(visionTimeoutMs(10)).toBe(150_000);
  });
});
