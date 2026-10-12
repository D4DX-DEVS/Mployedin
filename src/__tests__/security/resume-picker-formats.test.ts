/**
 * @jest-environment node
 */
/**
 * The onboarding résumé picker offered .doc and .rtf and its hint read
 * "DOC, DOCx, PDF, RTF", but the upload goes through validateUploadedFile(…,
 * "cv") which only takes PDF, DOCX and images — so a seeker who picked a .doc
 * was refused after choosing it. The picker may only offer what the server
 * takes.
 */
import fs from "node:fs";
import path from "node:path";
import { ALLOWED_FILE_TYPES } from "@/lib/security/file-validation";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".rtf": "application/rtf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/[locale]/(onboarding)/onboarding/page.tsx"),
  "utf8",
);

it("the onboarding résumé picker offers only formats the CV upload accepts", () => {
  const accepts = [...page.matchAll(/accept="([^"]+)"/g)].map((m) => m[1]);
  expect(accepts.length).toBeGreaterThan(0);
  const cvMimes = ALLOWED_FILE_TYPES.cv as readonly string[];
  for (const list of accepts) {
    for (const ext of list.split(",").map((s) => s.trim().toLowerCase())) {
      expect({ ext, accepted: cvMimes.includes(EXT_MIME[ext] ?? "unknown") }).toEqual({ ext, accepted: true });
    }
  }
});

it("the format hint does not promise DOC or RTF", () => {
  for (const msgs of [en, ar] as Array<{ onboarding: { resumeFormats: string } }>) {
    expect(msgs.onboarding.resumeFormats).not.toMatch(/\bDOC\b|RTF/);
  }
});
