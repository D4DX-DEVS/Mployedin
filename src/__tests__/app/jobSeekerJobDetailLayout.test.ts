/**
 * @jest-environment node
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Guard: the seeker job detail page puts Similar Jobs in the SECOND row of the
 * content column, beside the tall apply rail. When it sat below the whole grid
 * the rail (~1470px with the inline Easy Apply form) stretched the grid row and
 * left ~420px of blank page under "Related tags".
 *
 * The public job page keeps Similar Jobs stand-alone — its rail is shorter than
 * the content column, so it has no hole to fill and keeps the divider.
 */
const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("job detail page layout", () => {
  const seekerPage = read("src/app/[locale]/(dashboard)/job-seeker/jobs/[id]/page.tsx");
  const publicPage = read("src/app/[locale]/(public)/jobs/[id]/page.tsx");
  const similarJobs = read("src/components/features/job-seeker/SimilarJobs.tsx");

  it("declares two explicit rows so the rail's extra height falls below the content", () => {
    expect(seekerPage).toMatch(/lg:grid-cols-\[minmax\(0,1\.7fr\)_320px\][^"]*lg:grid-rows-\[auto_1fr\]/);
  });

  it("spans the apply rail across both rows of the second column", () => {
    const rail = seekerPage.match(/<div className="space-y-4 sm:space-y-5([^"]*)"/);
    expect(rail).not.toBeNull();
    expect(rail![1]).toContain("lg:col-start-2");
    expect(rail![1]).toContain("lg:row-span-2");
  });

  it("renders Similar Jobs as the second row of the content column", () => {
    const call = seekerPage.match(/<SimilarJobs[\s\S]*?\/>/);
    expect(call).not.toBeNull();
    expect(call![0]).toContain("lg:col-start-1");
    expect(call![0]).toContain("lg:row-start-2");
  });

  it("keeps Similar Jobs stand-alone on the public job page", () => {
    const call = publicPage.match(/<SimilarJobs[\s\S]*?\/>/);
    expect(call).not.toBeNull();
    expect(call![0]).not.toContain("className");
  });

  it("falls back to the stand-alone divider when no className is passed", () => {
    expect(similarJobs).toMatch(/className \?\? "mt-8 border-t border-border pt-8"/);
  });

  it("sizes the similar-job cards against their own column, not the viewport", () => {
    expect(similarJobs).toContain("@container/similar");
    expect(similarJobs).not.toMatch(/sm:grid-cols-2 lg:grid-cols-3/);
  });
});
