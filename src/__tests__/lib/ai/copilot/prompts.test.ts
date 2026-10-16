/**
 * @jest-environment node
 *
 * Every role's Copilot prompt carries the reply-style rules: short chat-panel
 * answers, and no retyping of rows the panel already drew as cards.
 */
import { getCopilotSystemPrompt } from "@/lib/ai/copilot/prompts";
import type { UserRole } from "@/types/user";

const ROLES: UserRole[] = ["job_seeker", "employer", "agent", "super_agent", "admin"];

describe("getCopilotSystemPrompt reply style", () => {
  it.each(ROLES)("tells the %s Copilot not to repeat rows shown as cards", (role) => {
    const prompt = getCopilotSystemPrompt(role);
    expect(prompt).toContain("## Reply Style");
    expect(prompt).toMatch(/shownToUser[\s\S]*never list or tabulate them again/);
  });

  it("only asks for a counts table when no cards were shown", () => {
    expect(getCopilotSystemPrompt("employer")).toMatch(/Unless the tool result has shownToUser, present them sorted and complete/);
  });
});
