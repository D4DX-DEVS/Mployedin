/**
 * @jest-environment node
 */
import {
  analyzeResumeText,
  computeKeywordCoverage,
  type ExtractResult,
} from "@/lib/ats/analyzeCv";

function extract(text: string, fileType: ExtractResult["fileType"] = "pdf", pageCount = 1): ExtractResult {
  return { text, fileType, pageCount };
}

const GOOD_CV = `
John Doe
john.doe@example.com  +1 415 555 0132
San Francisco, CA

Professional Summary
Senior frontend engineer with 6 years building React and TypeScript applications.

Experience
Acme Corp — Senior Frontend Engineer
Jan 2021 - Present
Led migration of the dashboard to Next.js and improved performance.

Globex — Frontend Engineer
Jun 2018 - Dec 2020
Built reusable component library used across 4 products.

Education
B.Tech in Computer Science, MIT, 2014 - 2018

Skills
React, TypeScript, Next.js, Node.js, GraphQL, Jest

Certifications
AWS Certified Developer

Languages
English (native), Spanish (intermediate)
`.trim();

describe("analyzeResumeText", () => {
  it("scores a clean, well-structured CV highly", () => {
    const report = analyzeResumeText(extract(GOOD_CV));
    expect(report.parseable).toBe(true);
    expect(report.atsScore).toBeGreaterThanOrEqual(85);
    expect(report.rating).toBe("excellent");
    expect(report.fileType).toBe("pdf");
  });

  it("flags an image-only CV as not ATS-readable and caps the score", () => {
    const report = analyzeResumeText(extract("", "image", 1));
    expect(report.parseable).toBe(false);
    expect(report.atsScore).toBeLessThanOrEqual(25);
    expect(report.rating).toBe("poor");
    const mr = report.checks.find((c) => c.id === "machine_readable");
    expect(mr?.status).toBe("fail");
    const ff = report.checks.find((c) => c.id === "file_format");
    expect(ff?.status).toBe("fail");
  });

  it("detects missing contact info", () => {
    const noContact = GOOD_CV.replace("john.doe@example.com  +1 415 555 0132", "");
    const report = analyzeResumeText(extract(noContact));
    const contact = report.checks.find((c) => c.id === "contact_info");
    expect(contact?.status).toBe("fail");
    expect(report.recommendations.some((r) => r.toLowerCase().includes("email"))).toBe(true);
  });

  it("warns on multi-column / tabular layout artifacts", () => {
    const columnar = Array.from({ length: 12 })
      .map((_, i) => `Skill ${i}          Detail value ${i}`)
      .join("\n");
    const report = analyzeResumeText(extract(`${GOOD_CV}\n${columnar}`));
    const layout = report.checks.find((c) => c.id === "layout_simple");
    expect(layout?.status).toBe("warn");
  });

  it("is deterministic — identical input yields identical score", () => {
    const a = analyzeResumeText(extract(GOOD_CV));
    const b = analyzeResumeText(extract(GOOD_CV));
    expect(a.atsScore).toBe(b.atsScore);
  });
});

describe("computeKeywordCoverage", () => {
  it("matches required keywords case-insensitively", () => {
    const cov = computeKeywordCoverage(GOOD_CV, ["React", "typescript", "Kubernetes"]);
    expect(cov.matched).toEqual(expect.arrayContaining(["React", "typescript"]));
    expect(cov.missing).toContain("Kubernetes");
    expect(cov.coverage).toBe(67);
  });

  it("returns 0 coverage when nothing matches", () => {
    const cov = computeKeywordCoverage("plain text resume", ["Rust", "Go"]);
    expect(cov.coverage).toBe(0);
    expect(cov.matched).toHaveLength(0);
  });
});
