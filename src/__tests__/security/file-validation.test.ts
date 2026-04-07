import { validateUploadedFile } from "@/lib/security/file-validation";

describe("validateUploadedFile - CV documents", () => {
  it("accepts valid DOCX files for cv category", () => {
    const encoder = new TextEncoder();
    const markerBytes = encoder.encode("[Content_Types].xml word/document.xml _rels/.rels");
    const docxBytes = new Uint8Array(64 + markerBytes.length);
    docxBytes.set([0x50, 0x4b, 0x03, 0x04], 0);
    docxBytes.set(markerBytes, 16);

    const file = new File([docxBytes], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const result = validateUploadedFile(file, "cv", docxBytes.buffer);

    expect(result).toBeNull();
  });

  it("rejects ZIP files masquerading as DOCX", () => {
    const zipLikeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const file = new File([zipLikeBytes], "fake.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const result = validateUploadedFile(file, "cv", zipLikeBytes.buffer);

    expect(result).toContain("Invalid DOCX structure");
  });

  it("rejects legacy DOC uploads for cv category", () => {
    const docBytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00]).buffer;
    const file = new File([docBytes], "resume.doc", { type: "application/msword" });

    const result = validateUploadedFile(file, "cv", docBytes);

    expect(result).toContain("not allowed");
  });
});
