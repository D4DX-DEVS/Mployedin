/**
 * @jest-environment node
 */
/**
 * The three ways a super agent or agent brings an employer on outside the
 * public sign-up each check the admin's employer onboarding switches before
 * writing anything. These routes carry many collaborators; this guards the
 * check and its place ahead of the first write.
 */
import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), "src/app/api", rel), "utf8");

describe("employer creation follows Admin → Settings → Employer onboarding", () => {
  it("POST /api/employers checks the role's switch before creating the user", () => {
    const src = read("employers/route.ts");
    const check = src.indexOf("canRoleCreateEmployers(ctx.role)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(src.indexOf("User.create("));
    expect(src).toContain('code: "EMPLOYER_CREATE_DISABLED"');
  });

  it("lead → employer account checks the role's switch before touching the lead", () => {
    const src = read("leads/[id]/convert/route.ts");
    const check = src.indexOf("canRoleCreateEmployers(ctx.role)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(src.indexOf("Lead.findById("));
  });

  it("new employer invite links are refused while invite links are paused", () => {
    const src = read("referral-links/route.ts");
    expect(src).toMatch(/audience !== "job_seeker" && !\(await getEmployerOnboardingFlags\(\)\)\.employerInviteLinksEnabled/);
  });

  it("employer sign-up checks the switch before any upload", () => {
    const src = read("auth/employer-register/route.ts");
    const check = src.indexOf("checkEmployerSignup(");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(src.indexOf("uploadBuffer("));
  });
});
