/**
 * @jest-environment node
 *
 * SEC-B1 — only storage objects the seeker uploaded may be attached to (and
 * presigned for) their application. A victim's CV key must be refused.
 */

const cvDocExists = jest.fn();
jest.mock("@/models/CvDocument", () => ({
  __esModule: true,
  CvDocument: { exists: (...a: unknown[]) => cvDocExists(...a) },
}));

const CDN = "https://bucket.blr1.cdn.digitaloceanspaces.com";

describe("document key ownership", () => {
  const OLD_ENV = process.env;
  beforeAll(() => {
    process.env = { ...OLD_ENV, DO_SPACES_CDN_ENDPOINT: CDN };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });
  beforeEach(() => cvDocExists.mockReset().mockResolvedValue(null));

  it("classifies bucket URLs and bare keys as storage objects, external links as not", async () => {
    const { isStorageObjectUrl } = await import("@/lib/security/documentAccess");
    expect(isStorageObjectUrl(`${CDN}/cvs/abc.pdf`)).toBe(true);
    expect(isStorageObjectUrl("cvs/abc.pdf")).toBe(true);
    expect(isStorageObjectUrl("https://other.fra1.digitaloceanspaces.com/cvs/x.pdf")).toBe(true);
    expect(isStorageObjectUrl("https://github.com/someone")).toBe(false);
  });

  it("accepts the seeker's own CV and profile documents", async () => {
    const { seekerOwnsStorageObject } = await import("@/lib/security/documentAccess");
    const seeker = {
      _id: "s1",
      cv: { originalUrl: `${CDN}/cvs/mine.pdf` },
      documents: [{ url: `${CDN}/documents/cert.pdf` }],
    };
    await expect(seekerOwnsStorageObject(seeker, `${CDN}/cvs/mine.pdf`)).resolves.toBe(true);
    // Same object spelled as a bare key.
    await expect(seekerOwnsStorageObject(seeker, "documents/cert.pdf")).resolves.toBe(true);
  });

  it("refuses another seeker's CV key", async () => {
    const { seekerOwnsStorageObject } = await import("@/lib/security/documentAccess");
    const seeker = { _id: "s1", cv: { originalUrl: `${CDN}/cvs/mine.pdf` }, documents: [] };
    await expect(seekerOwnsStorageObject(seeker, `${CDN}/cvs/victim.pdf`)).resolves.toBe(false);
    expect(cvDocExists).toHaveBeenCalledWith(expect.objectContaining({ jobSeekerId: "s1" }));
  });

  it("accepts a replaced CV still recorded in the seeker's CV registry", async () => {
    cvDocExists.mockResolvedValue({ _id: "cv1" });
    const { seekerOwnsStorageObject } = await import("@/lib/security/documentAccess");
    const seeker = { _id: "s1", cv: { originalUrl: `${CDN}/cvs/new.pdf` }, documents: [] };
    await expect(seekerOwnsStorageObject(seeker, `${CDN}/cvs/old.pdf`)).resolves.toBe(true);
  });
});
