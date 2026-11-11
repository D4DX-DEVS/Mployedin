import {
  HIDDEN_COMPANY_LOGO,
  HIDDEN_COMPANY_NAME,
  displayCompanyLogo,
  displayCompanyName,
  isCompanyHidden,
  maskJobEmployer,
} from "@/lib/jobs/companyDisclosure";
import { maskSeekerApplicationJob, stripSeekerHiddenFields } from "@/lib/applications/seekerView";

describe("company disclosure", () => {
  it("hides only when explicitly false (legacy jobs stay disclosed)", () => {
    expect(isCompanyHidden({ discloseCompany: false })).toBe(true);
    expect(isCompanyHidden({ discloseCompany: true })).toBe(false);
    expect(isCompanyHidden({})).toBe(false);
    expect(isCompanyHidden(null)).toBe(false);
  });

  it("shows the platform name for a hidden job and the company otherwise", () => {
    expect(displayCompanyName({ discloseCompany: false }, "Acme")).toBe(HIDDEN_COMPANY_NAME);
    expect(displayCompanyName({ discloseCompany: true }, "Acme")).toBe("Acme");
    expect(displayCompanyName({}, undefined, "Company")).toBe("Company");
  });

  it("shows the Mployedin mark for a hidden job and the company's logo otherwise", () => {
    expect(displayCompanyLogo({ discloseCompany: false }, "acme.png")).toBe(HIDDEN_COMPANY_LOGO);
    expect(displayCompanyLogo({ discloseCompany: false }, undefined)).toBe(HIDDEN_COMPANY_LOGO);
    expect(displayCompanyLogo({ discloseCompany: true }, "acme.png")).toBe("acme.png");
    expect(displayCompanyLogo({}, "")).toBeUndefined();
  });

  it("replaces the populated employer with the Mployedin name and mark, no id or details", () => {
    const job: Record<string, unknown> = {
      discloseCompany: false,
      employerId: { _id: "e1", companyName: "Acme", logo: "x.png", website: "acme.com" },
    };
    maskJobEmployer(job);
    expect(job.employerId).toEqual({ companyName: HIDDEN_COMPANY_NAME, logo: HIDDEN_COMPANY_LOGO });
  });

  it("leaves a disclosed job untouched", () => {
    const employer = { _id: "e1", companyName: "Acme" };
    const job: Record<string, unknown> = { discloseCompany: true, employerId: employer };
    maskJobEmployer(job);
    expect(job.employerId).toBe(employer);
  });
});

describe("a seeker's application to a hidden-company job", () => {
  const employer = { _id: "e1", companyName: "Acme", logo: "acme.png" };

  it("shows Mployedin on the populated job without touching the original", () => {
    const app = { _id: "a1", jobId: { _id: "j1", title: "Driver", discloseCompany: false, employerId: employer } };
    const out = maskSeekerApplicationJob(app);
    expect(out.jobId.employerId).toEqual({ companyName: HIDDEN_COMPANY_NAME, logo: HIDDEN_COMPANY_LOGO });
    expect(out.jobId.title).toBe("Driver");
    // The route's ownership check reads the real employer before masking.
    expect(app.jobId.employerId).toBe(employer);
  });

  it("keeps the company on a disclosed or legacy job, and an unpopulated job id as is", () => {
    const disclosed = { jobId: { discloseCompany: true, employerId: employer } };
    expect(maskSeekerApplicationJob(disclosed)).toBe(disclosed);
    const legacy = { jobId: { employerId: employer } };
    expect(maskSeekerApplicationJob(legacy)).toBe(legacy);
    const bare = { jobId: "j1" };
    expect(maskSeekerApplicationJob(bare)).toBe(bare);
  });

  it("is applied by the seeker list's field stripping", () => {
    const row = { notes: ["x"], jobId: { discloseCompany: false, employerId: employer } };
    const out = stripSeekerHiddenFields(row) as Record<string, unknown>;
    expect(out.notes).toBeUndefined();
    expect((out.jobId as { employerId: unknown }).employerId).toEqual({
      companyName: HIDDEN_COMPANY_NAME,
      logo: HIDDEN_COMPANY_LOGO,
    });
  });
});
