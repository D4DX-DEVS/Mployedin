/**
 * @jest-environment node
 *
 * Every registered copilot tool must survive the JSON-schema conversion the
 * chat route performs before the first model call — one bad parameter block
 * takes the whole copilot down with a generic "AI service error".
 */
import { getToolsForUser, getToolByName } from "@/lib/ai/copilot/registry";
import { toJsonSchema } from "@/lib/ai/copilot/paramSchema";
import type { UserRole } from "@/types/user";

const ROLES: UserRole[] = ["employer", "job_seeker", "agent", "super_agent", "admin"];

describe("copilot tool registry", () => {
  it.each(ROLES)("every %s tool converts to a JSON schema", (role) => {
    const tools = getToolsForUser(role, "role_default", undefined);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      const schema = toJsonSchema(tool.parameters) as { type?: string; properties?: Record<string, unknown> };
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
    }
  });

  it("registers shortlist_top_candidates for employers as a mutating tool with a preview", () => {
    const tool = getToolByName("shortlist_top_candidates");
    expect(tool?.mutates).toBe(true);
    expect(typeof tool?.preview).toBe("function");
    expect(getToolsForUser("employer", "role_default", undefined).some((t) => t.name === "shortlist_top_candidates")).toBe(true);
    expect(getToolsForUser("job_seeker", "role_default", undefined).some((t) => t.name === "shortlist_top_candidates")).toBe(false);
  });
});
