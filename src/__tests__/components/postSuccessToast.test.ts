import { postSuccessToastOptions } from "@/components/features/employer/job-form/postSuccessToast";

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
