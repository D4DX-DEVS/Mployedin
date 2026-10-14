jest.mock("@/lib/storage/spaces", () => ({
  getPresignedUrl: jest.fn(async (key: string, _ttl: number, opts?: { downloadName?: string }) =>
    `https://signed.example/${key}?${opts?.downloadName ? `dl=${opts.downloadName}` : "inline"}`),
}));

import { canViewResource, signedDownloadUrl, withSignedFileUrls } from "@/lib/resources/fileAccess";
import { fileExtensionLabel, fileTypeOf, isPreviewable } from "@/lib/resources/fileTypes";

describe("canViewResource", () => {
  it("lets admin see inactive and admin-only resources", () => {
    expect(canViewResource({ isActive: false, accessLevel: "admin" }, "admin")).toBe(true);
  });

  it("shows active all-staff and own-role resources to staff", () => {
    expect(canViewResource({ isActive: true, accessLevel: "all_staff" }, "agent")).toBe(true);
    expect(canViewResource({ isActive: true, accessLevel: "agent" }, "agent")).toBe(true);
  });

  it("hides another role's, admin-only and inactive resources", () => {
    expect(canViewResource({ isActive: true, accessLevel: "super_agent" }, "agent")).toBe(false);
    expect(canViewResource({ isActive: true, accessLevel: "admin" }, "super_agent")).toBe(false);
    expect(canViewResource({ isActive: false, accessLevel: "all_staff" }, "agent")).toBe(false);
  });
});

describe("withSignedFileUrls", () => {
  it("replaces stored (private, 403) URLs with signed ones, files and history alike", async () => {
    const file = { fileName: "poster.png", key: "documents/a.png", url: "https://cdn/documents/a.png", contentType: "image/png", size: 1 };
    const out = await withSignedFileUrls({ files: [file], versionHistory: [{ files: [file] }] });
    expect(out.files?.[0].url).toBe("https://signed.example/documents/a.png?inline");
    expect(out.versionHistory?.[0].files?.[0].url).toBe("https://signed.example/documents/a.png?inline");
    expect(file.url).toBe("https://cdn/documents/a.png"); // input untouched
  });

  it("signs downloads under the original file name", async () => {
    await expect(signedDownloadUrl({ key: "documents/a.pdf", fileName: "Brochure 2026.pdf" }))
      .resolves.toBe("https://signed.example/documents/a.pdf?dl=Brochure 2026.pdf");
  });
});

describe("file type helpers", () => {
  it("groups content types", () => {
    expect(fileTypeOf("application/pdf")).toBe("pdf");
    expect(fileTypeOf("image/jpeg")).toBe("image");
    expect(fileTypeOf("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("document");
    expect(fileTypeOf("application/zip")).toBe("archive");
    expect(fileTypeOf("application/octet-stream")).toBe("other");
  });

  it("labels by extension, falling back to the MIME subtype", () => {
    expect(fileExtensionLabel("poster.final.png", "image/png")).toBe("PNG");
    expect(fileExtensionLabel("mployedin poster1 - 2026-09-11T155", "image/png")).toBe("PNG");
  });

  it("previews only what the browser renders inline", () => {
    expect(isPreviewable("application/pdf")).toBe(true);
    expect(isPreviewable("video/mp4")).toBe(true);
    expect(isPreviewable("application/msword")).toBe(false);
  });
});
