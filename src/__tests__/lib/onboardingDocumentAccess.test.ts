/**
 * @jest-environment node
 *
 * Onboarding uploads are private objects: the stored address answered
 * "AccessDenied" when the employer or the candidate clicked the document.
 */
const getPresignedUrl = jest.fn();

jest.mock("@/lib/storage/spaces", () => ({
  getPresignedUrl: (...args: unknown[]) => getPresignedUrl(...args),
  isStoredFileUrl: (url: string) => url.startsWith("https://cdn.test/"),
  urlToKey: (url: string) => url.replace("https://cdn.test/", ""),
}));

import { signedOnboardingDocUrl, withSignedDocUrls } from "@/lib/onboarding/documentAccess";

describe("onboarding document addresses", () => {
  beforeEach(() => {
    getPresignedUrl.mockReset();
    getPresignedUrl.mockImplementation(async (key: string) => `https://signed.test/${key}?sig=1`);
  });

  it("signs our own stored files so they open inline", async () => {
    await expect(signedOnboardingDocUrl("https://cdn.test/documents/a.pdf")).resolves.toBe(
      "https://signed.test/documents/a.pdf?sig=1",
    );
    expect(getPresignedUrl).toHaveBeenCalledWith("documents/a.pdf", 3600, { inline: true });
  });

  it("leaves a link to another site alone", async () => {
    await expect(signedOnboardingDocUrl("https://drive.example.com/handbook")).resolves.toBe(
      "https://drive.example.com/handbook",
    );
    expect(getPresignedUrl).not.toHaveBeenCalled();
  });

  it("keeps documents without a file as they are and never changes the input", async () => {
    const docs = [{ name: "Passport" }, { name: "Payslip", url: "https://cdn.test/documents/b.pdf" }];
    const signed = await withSignedDocUrls(docs);
    expect(signed[0]).toEqual({ name: "Passport" });
    expect(signed[1].url).toBe("https://signed.test/documents/b.pdf?sig=1");
    expect(docs[1].url).toBe("https://cdn.test/documents/b.pdf");
  });

  it("falls back to the stored address when signing fails", async () => {
    getPresignedUrl.mockRejectedValue(new Error("no credentials"));
    await expect(signedOnboardingDocUrl("https://cdn.test/documents/a.pdf")).resolves.toBe(
      "https://cdn.test/documents/a.pdf",
    );
  });
});
