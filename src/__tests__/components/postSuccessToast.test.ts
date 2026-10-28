import { jobLandingHref, postSuccessToastOptions } from "@/components/features/employer/job-form/postSuccessToast";

const labels = {
  description: "Share it as a poster on LinkedIn & social media.",
  descriptionNoPoster: "Share the job link on LinkedIn & social media.",
  createPoster: "Create Poster",
};

describe("postSuccessToastOptions", () => {
  it("never mentions posters or offers the poster action while posters are hidden", () => {
    for (const basePath of ["employer", "admin", "agent"]) {
      const push = jest.fn();
      const opts = postSuccessToastOptions({ basePath, posterHref: "/en/employer/jobs/j1?poster=1", push, labels, postersEnabled: false });
      expect(opts.description).toBe(labels.descriptionNoPoster);
      expect(opts.action).toBeUndefined();
    }
  });

  it("offers Create Poster to employers only while posters are on", () => {
    const push = jest.fn();
    const employer = postSuccessToastOptions({ basePath: "employer", posterHref: "/en/employer/jobs/j1?poster=1", push, labels, postersEnabled: true });
    expect(employer.description).toBe(labels.description);
    const action = employer.action as { label: string; onClick: () => void };
    expect(action.label).toBe("Create Poster");
    action.onClick();
    expect(push).toHaveBeenCalledWith("/en/employer/jobs/j1?poster=1");

    // Admin and agent job pages have no poster maker; the old admin link did nothing.
    for (const basePath of ["admin", "agent"]) {
      expect(postSuccessToastOptions({ basePath, posterHref: "x", push, labels, postersEnabled: true }).action).toBeUndefined();
    }
  });

  it("defaults to the feature flag", () => {
    const opts = postSuccessToastOptions({ basePath: "employer", posterHref: "x", push: jest.fn(), labels });
    expect(opts.description).toBe(labels.descriptionNoPoster);
  });
});

describe("jobLandingHref (bug 2026-10-28: admin Save Draft landed on a 404)", () => {
  it("sends employers and agents to the job's own page", () => {
    expect(jobLandingHref("en", "employer", "6ae19fe9095dd7e184e1fe1b")).toBe("/en/employer/jobs/6ae19fe9095dd7e184e1fe1b");
    expect(jobLandingHref("ar", "agent", "6ae19fe9095dd7e184e1fe1b")).toBe("/ar/agent/jobs/6ae19fe9095dd7e184e1fe1b");
  });

  it("sends admins to the jobs list — there is no admin job page", () => {
    expect(jobLandingHref("en", "admin", "6ae19fe9095dd7e184e1fe1b")).toBe("/en/admin/jobs");
  });

  it("falls back to the jobs list when the save returned no id", () => {
    expect(jobLandingHref("en", "employer", undefined)).toBe("/en/employer/jobs");
  });
});
