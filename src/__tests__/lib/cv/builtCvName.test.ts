import { BUILT_CV_NAME } from "@/lib/cv/builtCvName";

describe("BUILT_CV_NAME: the one rule for a file the CV builder made", () => {
  it("matches '{name} - Mployedin CV.pdf' in any case, including Arabic names", () => {
    expect(BUILT_CV_NAME.test("Sara Ali - Mployedin CV.pdf")).toBe(true);
    expect(BUILT_CV_NAME.test("سارة أحمد - mployedin cv.PDF")).toBe(true);
  });

  it("does not match an upload that merely mentions it", () => {
    expect(BUILT_CV_NAME.test("Mployedin CV.pdf")).toBe(false);
    expect(BUILT_CV_NAME.test("Sara - Mployedin CV.pdf.docx")).toBe(false);
  });
});
