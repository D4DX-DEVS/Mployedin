/**
 * Source guards for client report 2026-09-30 (#13): "no way to assign agents to
 * a super agent, or employers to an agent, from User Management".
 *
 * The assignments stay on the pages that own them (Agents, Super Agents,
 * Employers) — User Management links there and each page opens its own dialog
 * from `?open=` / `?add=`. These pin that wiring against a quiet refactor.
 */
import fs from "fs";
import path from "path";

const read = (page: string) =>
  fs.readFileSync(path.join(process.cwd(), `src/app/[locale]/(dashboard)/admin/${page}/page.tsx`), "utf8");

const users = read("users");
const agents = read("agents");
const superAgents = read("super-agents");
const employers = read("employers");

describe("User Management → assignment pages", () => {
  it("offers an Assign action that links to the page owning the assignment", () => {
    expect(users).toContain("assignmentHref(user, locale)");
    expect(users).toContain("onSelect: () => router.push(assignHref)");
  });

  it("sends new agents and super agents to the pages where their area and team are chosen", () => {
    expect(users).toMatch(/agent: \{ page: "agents"/);
    expect(users).toMatch(/super_agent: \{ page: "super-agents"/);
    expect(users).toContain("?add=1");
    // The create handler cannot make an agent without a super agent or area.
    expect(users).toContain("if (createdElsewhere) return;");
  });

  it("each target page opens its own dialog for the linked row", () => {
    expect(employers).toContain("useOpenFromUrl(employers, setAssignItem)");
    expect(superAgents).toContain("useOpenFromUrl(superAgents, openEdit)");
    // Agents wait for the super agent list, or Edit would show "None" and a
    // save would take the agent off their super agent.
    expect(agents).toContain("useOpenFromUrl(superAgentsLoaded ? agents : [], openEdit)");
  });

  it("agents and super agents open Add from ?add=1", () => {
    for (const source of [agents, superAgents]) {
      expect(source).toContain('useUrlFilter("add", "")');
      expect(source).toContain("setShowAdd(true)");
    }
  });
});
