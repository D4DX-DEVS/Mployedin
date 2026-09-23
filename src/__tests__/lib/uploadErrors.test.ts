/**
 * @jest-environment node
 *
 * 2026-09-23 audit: a spoofed file (an .exe renamed .pdf) got a 500 "Upload
 * failed. Please try again later." — the user was told to retry a file that can
 * never pass. An 11MB body got a bare 500 because Next truncates bodies over
 * 10MB and req.formData() threw outside any try.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { FileValidationError, readUploadForm, uploadErrorResponse } from "@/lib/storage/uploadErrors";
import { MalwareDetectedError } from "@/lib/security/malware-scan";

describe("uploadErrorResponse", () => {
  it("returns the validation reason as a 400", async () => {
    const res = uploadErrorResponse(new FileValidationError("File type not allowed or corrupted."));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File type not allowed or corrupted." });
  });

  it("maps a malware hit to 422", () => {
    expect(uploadErrorResponse(new MalwareDetectedError("bad")).status).toBe(422);
  });

  it("maps a missing bucket to 503", () => {
    expect(uploadErrorResponse({ Code: "NoSuchBucket" }).status).toBe(503);
  });

  it("keeps a generic 500 for real storage failures", async () => {
    const res = uploadErrorResponse(new Error("socket hang up"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/socket/);
  });
});

describe("readUploadForm", () => {
  it("returns the form data for a well-formed multipart body", async () => {
    const fd = new FormData();
    fd.append("file", new File(["x"], "a.pdf", { type: "application/pdf" }));
    const out = await readUploadForm(new NextRequest("http://localhost/api/x", { method: "POST", body: fd }));
    expect(out).toBeInstanceOf(FormData);
  });

  it("answers 413 when the body can't be parsed (truncated at the 10MB proxy limit)", async () => {
    const req = new NextRequest("http://localhost/api/x", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=zzz" },
      body: "--zzz\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.pdf\"\r\n\r\ntruncated",
    });
    const out = await readUploadForm(req);
    expect(out).not.toBeInstanceOf(FormData);
    expect((out as Response).status).toBe(413);
  });
});

describe("upload routes", () => {
  const routes = [
    "src/app/api/agent/avatar/route.ts",
    "src/app/api/employers/documents/route.ts",
    "src/app/api/employers/logo/route.ts",
    "src/app/api/job-seeker/cv/route.ts",
    "src/app/api/job-seeker/documents/route.ts",
    "src/app/api/job-seeker/onboarding/[id]/upload/route.ts",
    "src/app/api/job-seekers/avatar/route.ts",
    "src/app/api/super-agent/avatar/route.ts",
  ];
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

  it("covers every route that calls uploadFile()", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "route.ts" && /\buploadFile\(/.test(fs.readFileSync(p, "utf8"))) {
          found.push(path.relative(process.cwd(), p).split(path.sep).join("/"));
        }
      }
    };
    walk(path.join(process.cwd(), "src/app/api"));
    expect(found.sort()).toEqual([...routes].sort());
  });

  it.each(routes)("%s uses the shared parse + error mapping", (f) => {
    const src = read(f);
    expect(src).toContain("readUploadForm(req)");
    expect(src).toContain("uploadErrorResponse(err)");
    expect(src).not.toMatch(/await req\.formData\(\)/);
  });

  it.each(routes)("%s removes the replaced file only after the new upload succeeded", (f) => {
    const src = read(f);
    const upload = src.indexOf("uploadFile(");
    // deleteFile() of the previous object must not run before the new one is stored.
    const deletes = [...src.matchAll(/deleteFile\(/g)].map((m) => m.index!);
    const postHandler = src.slice(0, src.search(/async function deleteHandler|export const POST/));
    for (const at of deletes.filter((i) => i < postHandler.length)) {
      expect(at).toBeGreaterThan(upload);
    }
  });
});
