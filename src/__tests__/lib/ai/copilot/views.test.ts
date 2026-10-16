/**
 * @jest-environment node
 *
 * Read tools whose rows are worth seeing as cards get a view; everything else
 * stays a markdown reply. The input shapes here are copied from each tool's
 * `execute` return, so a tool that changes its rows breaks this test, not the
 * chat panel.
 */
import { presentToolResult, VIEW_ROW_LIMIT } from "@/lib/ai/copilot/views";

const recommendedRow = (id: string) => ({
  jobId: id,
  title: `Job ${id}`,
  company: "Acme",
  location: "Dubai, UAE",
  salary: "AED 8000-12000 monthly",
  matchScore: 91,
  strongMatch: true,
  matchedSkills: ["React", "TypeScript"],
  url: `/en/job-seeker/jobs/${id}`,
});

describe("presentToolResult", () => {
  it("turns recommended_jobs into job cards with the match and the matched skills", () => {
    const view = presentToolResult("recommended_jobs", {
      jobs: [recommendedRow("a")],
      totalMatches: 1,
      hasCv: true,
      limitingFactor: null,
    });
    expect(view).toEqual({
      kind: "jobs",
      jobs: [
        {
          jobId: "a",
          title: "Job a",
          company: "Acme",
          location: "Dubai, UAE",
          salary: "AED 8000-12000 monthly",
          matchScore: 91,
          strongMatch: true,
          skills: ["React", "TypeScript"],
          alreadyApplied: false,
          url: "/en/job-seeker/jobs/a",
        },
      ],
      more: 0,
    });
  });

  it("turns search_jobs rows into job cards that say when the seeker already applied", () => {
    const view = presentToolResult("search_jobs", [
      { jobId: "b", title: "Accountant", location: "Remote", skills: ["Excel"], alreadyApplied: true, url: "/en/job-seeker/jobs/b" },
    ]);
    expect(view).toMatchObject({ kind: "jobs", jobs: [{ jobId: "b", alreadyApplied: true, skills: ["Excel"], matchScore: undefined }] });
  });

  it("shows at most VIEW_ROW_LIMIT cards and counts the rest", () => {
    const rows = Array.from({ length: VIEW_ROW_LIMIT + 3 }, (_, i) => recommendedRow(String(i)));
    const view = presentToolResult("recommended_jobs", { jobs: rows });
    expect(view).toMatchObject({ kind: "jobs", more: 3 });
    expect(view?.kind === "jobs" && view.jobs).toHaveLength(VIEW_ROW_LIMIT);
  });

  it("turns search_candidates into candidate rows", () => {
    const view = presentToolResult("search_candidates", [
      { applicationId: "app1", candidate: "Alice", job: "Frontend Developer", status: "applied", matchScore: 88, experienceYears: 5, skills: ["React"] },
    ]);
    expect(view).toEqual({
      kind: "candidates",
      candidates: [{ id: "app1", name: "Alice", job: "Frontend Developer", status: "applied", matchScore: 88, experienceYears: 5, skills: ["React"] }],
      more: 0,
    });
  });

  it("turns my_applications into dated status rows", () => {
    const view = presentToolResult("my_applications", [
      { title: "Designer", status: "interview_scheduled", appliedAt: new Date("2026-10-01T09:00:00Z"), matchScore: 72 },
      { title: "Bad date", status: "applied", appliedAt: "not a date" },
    ]);
    expect(view).toEqual({
      kind: "applications",
      applications: [
        { title: "Designer", status: "interview_scheduled", appliedAt: "2026-10-01T09:00:00.000Z", matchScore: 72 },
        { title: "Bad date", status: "applied", appliedAt: undefined, matchScore: undefined },
      ],
      more: 0,
    });
  });

  it("turns pipeline_stats into stage tiles and per-job rows, busiest job first", () => {
    const view = presentToolResult("pipeline_stats", {
      byStage: { applied: 7, shortlisted: 2 },
      byJob: [
        { jobId: "j1", title: "Quiet job", applicants: 0 },
        { jobId: "j2", title: "Busy job", applicants: 9 },
      ],
    });
    expect(view).toEqual({
      kind: "stats",
      tiles: [
        { status: "applied", value: 7 },
        { status: "shortlisted", value: 2 },
      ],
      rows: [
        { label: "Busy job", value: 9 },
        { label: "Quiet job", value: 0 },
      ],
    });
  });

  it("turns lead_stats into a total, an overdue count and one tile per status", () => {
    const view = presentToolResult("lead_stats", { total: 12, byStatus: { new: 5, contacted: 7 }, overdueFollowUps: 2 });
    expect(view).toEqual({
      kind: "stats",
      tiles: [
        { metric: "total", value: 12 },
        { metric: "overdue", value: 2 },
        { status: "new", value: 5 },
        { status: "contacted", value: 7 },
      ],
      rows: [],
    });
  });

  it("leaves empty results and unknown tools to the model's own words", () => {
    expect(presentToolResult("recommended_jobs", { jobs: [], limitingFactor: "no_location" })).toBeNull();
    expect(presentToolResult("search_jobs", [])).toBeNull();
    expect(presentToolResult("pipeline_stats", {})).toBeNull();
    expect(presentToolResult("my_profile", { name: "x" })).toBeNull();
    expect(presentToolResult("search_jobs", "not rows")).toBeNull();
  });
});
