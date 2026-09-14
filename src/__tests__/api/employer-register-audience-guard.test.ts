/**
 * @jest-environment node
 */
/**
 * The employer registration route is multipart + eleven collaborators; a full
 * route test buys little here. This guards the one line that keeps a
 * job-seeker link from being redeemed as an employer referral.
 */
import fs from "node:fs";
import path from "node:path";

describe("employer-register ignores job-seeker referral links", () => {
  it("filters ReferralLink by audience when resolving the code", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/auth/employer-register/route.ts"), "utf8");
    expect(src).toMatch(
      /ReferralLink\.findOne\(\{\s*code:\s*referralCode,\s*isActive:\s*true,\s*audience:\s*\{\s*\$ne:\s*"job_seeker"\s*\}\s*\}\)/,
    );
  });
});
