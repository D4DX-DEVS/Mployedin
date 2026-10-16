/**
 * @jest-environment node
 */

const generateMultimodal = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  GEMINI_MODELS: { flash: "flash" },
  generateMultimodal: (...args: unknown[]) => generateMultimodal(...args),
}));

import { EmptyOcrError, ocrDocument, OCR_PROMPT, OCR_MAX_TOKENS } from "@/lib/ai/visionOcr";

beforeEach(() => generateMultimodal.mockReset());

describe("ocrDocument", () => {
  it("sends the transcription prompt and the file, and returns the trimmed text", async () => {
    generateMultimodal.mockResolvedValue("  Anagha Damodaran\nHR Executive  \n");
    const file = Buffer.from("%PDF-1.7 scan");

    const text = await ocrDocument(file, "application/pdf");

    expect(text).toBe("Anagha Damodaran\nHR Executive");
    expect(generateMultimodal).toHaveBeenCalledWith(
      [{ text: OCR_PROMPT }, { inlineData: { mimeType: "application/pdf", data: file.toString("base64") } }],
      "flash",
      OCR_MAX_TOKENS,
    );
  });

  it("asks for a verbatim transcription, not a summary", () => {
    expect(OCR_PROMPT).toMatch(/exactly as written/);
    expect(OCR_PROMPT).toMatch(/Do not summarise/);
  });

  it("lets a provider failure through for the caller to handle", async () => {
    const providerError = new Error("OpenRouter returned no text (content_filter)");
    generateMultimodal.mockRejectedValue(providerError);

    const result = ocrDocument(Buffer.from("x"), "image/png");

    // The same error, not converted into a blank-scan error.
    await expect(result).rejects.toBe(providerError);
    await expect(result).rejects.not.toBeInstanceOf(EmptyOcrError);
  });

  // A blank or unreadable scan: the model answers, but with nothing in it.
  it.each([
    ["an empty answer", ""],
    ["a whitespace-only answer", "  \n\t \n"],
  ])("throws EmptyOcrError for %s instead of returning an empty transcription", async (_label, answer) => {
    generateMultimodal.mockResolvedValue(answer);

    const result = ocrDocument(Buffer.from("%PDF-1.7 blank scan"), "application/pdf");

    await expect(result).rejects.toBeInstanceOf(EmptyOcrError);
    await expect(result).rejects.toMatchObject({
      name: "EmptyOcrError",
      message: "The model returned no text for this document",
    });
  });

  it("EmptyOcrError is an Error, so generic handlers still catch it", () => {
    const err = new EmptyOcrError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("EmptyOcrError");
  });
});
