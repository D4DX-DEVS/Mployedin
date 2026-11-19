import { withDownloadFlag } from "@/lib/cv/downloadFlag";

const ID = "650000000000000000000330";
const APP = "650000000000000000000310";

describe("withDownloadFlag: marks a candidate CV address as an actual download (counted), never a preview", () => {
  it("adds ?download=1 before the hash the viewer uses for file-type detection", () => {
    expect(withDownloadFlag(`/api/employers/candidates/${ID}/cv#cv.pdf`)).toBe(`/api/employers/candidates/${ID}/cv?download=1#cv.pdf`);
  });

  it("adds &download=1 to an address that already has a query", () => {
    expect(withDownloadFlag(`/api/employers/candidates/${ID}/cv?applicationId=${APP}#cv.docx`)).toBe(
      `/api/employers/candidates/${ID}/cv?applicationId=${APP}&download=1#cv.docx`,
    );
  });

  it("works without a hash", () => {
    expect(withDownloadFlag(`/api/employers/candidates/${ID}/cv`)).toBe(`/api/employers/candidates/${ID}/cv?download=1`);
  });

  it("is idempotent", () => {
    const once = withDownloadFlag(`/api/employers/candidates/${ID}/cv?applicationId=${APP}`);
    expect(withDownloadFlag(once)).toBe(once);
  });

  it("leaves every other address alone: other files, other routes, empty", () => {
    expect(withDownloadFlag("https://cdn/cvs/a.pdf")).toBe("https://cdn/cvs/a.pdf");
    expect(withDownloadFlag(`/api/applications/${APP}/documents/download?cv=1`)).toBe(`/api/applications/${APP}/documents/download?cv=1`);
    expect(withDownloadFlag("")).toBe("");
    expect(withDownloadFlag(null)).toBeNull();
    expect(withDownloadFlag(undefined)).toBeUndefined();
  });

  it("never marks the Standardised view (kind=built) as a download", () => {
    const built = `/api/employers/candidates/${ID}/cv?kind=built`;
    expect(withDownloadFlag(built)).toBe(built);
  });
});
