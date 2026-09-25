/**
 * @jest-environment node
 */
/**
 * A super-agent's referral link does not say which agent should run the
 * account. Registration used to hand every such signup to the super-agent's
 * FIRST agent (`agentIds[0]`) — an arbitrary pick. Now the employer arrives
 * with no agent and an admin assigns one from the Employers page.
 *
 * Source guard, same approach as employer-register-audience-guard.test.ts:
 * the route is multipart with eleven collaborators.
 */
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/auth/employer-register/route.ts"), "utf8");

describe("employer-register with a super-agent link", () => {
  it("never picks an agent off the super-agent's team", () => {
    expect(src).not.toMatch(/agentIds\[0\]/);
    expect(src).not.toMatch(/SuperAgent\.find(?:ById|One)\([^)]*\)\.select\("userId agentIds"\)/);
  });

  it("still assigns the agent named on an agent's own link", () => {
    expect(src).toMatch(/if \(rl\.agentId\) \{[\s\S]*?referrerAgentId = agentRef\._id\.toString\(\);/);
  });
});
