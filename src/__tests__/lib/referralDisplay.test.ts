import { registrationDisplayName } from "@/lib/referrals/display";

describe("registrationDisplayName", () => {
  it("uses the company for employer rows, including legacy rows with no kind", () => {
    expect(registrationDisplayName({ companyName: "Acme", email: "a@acme.com" })).toBe("Acme");
    expect(registrationDisplayName({ kind: "employer", companyName: "Acme", email: "a@acme.com" })).toBe("Acme");
  });

  it("uses the seeker name for job-seeker rows and falls back to the email", () => {
    expect(registrationDisplayName({ kind: "job_seeker", name: "Sara Ali", email: "s@x.com" })).toBe("Sara Ali");
    expect(registrationDisplayName({ kind: "job_seeker", email: "s@x.com" })).toBe("s@x.com");
  });

  it("falls back to the email when an employer row has no company", () => {
    expect(registrationDisplayName({ kind: "employer", email: "a@acme.com" })).toBe("a@acme.com");
  });
});
