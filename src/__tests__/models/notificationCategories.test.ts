/**
 * @jest-environment node
 */
/**
 * Every notification category a settings page offers must exist in the schema.
 *
 * The agent and super-agent settings pages have always shown five categories —
 * placements, commissions, team, jobs, system — but only two of them were
 * declared on NotificationPreference. The PATCH route builds
 * `$set: { "categories.placements.enabled": false }`, Mongoose strict mode
 * dropped the unknown path, and the route still answered 200 `{success:true}`.
 * The toggle looked saved and reverted on the next load.
 *
 * These tests pin the three things that made that possible:
 *  1. the schema declares every category a page renders,
 *  2. the validator refuses a category the schema does not have, and
 *  3. the staff notification types map onto the staff categories rather than
 *     falling through to "system".
 */
import fs from "fs";
import path from "path";
import { CATEGORY_DEFAULTS, CATEGORY_KEYS, typeToCategory } from "@/models/NotificationPreference";
import { notificationPreferencesUpdateSchema } from "@/lib/validators/settings";

const DASHBOARD = path.join(process.cwd(), "src", "app", "[locale]", "(dashboard)");

/**
 * The category keys a settings page actually renders, read from the default
 * preference object each page declares. Reading the source keeps this honest:
 * a page that adds a sixth category fails here until the schema gains it.
 */
function categoriesRenderedBy(relativePath: string): string[] {
  const source = fs.readFileSync(path.join(DASHBOARD, relativePath), "utf8");
  const block = source.match(/categories:\s*\{([\s\S]*?)\n\s{4}\},/);
  if (!block) throw new Error(`no categories block in ${relativePath}`);
  return [...block[1].matchAll(/^\s*(\w+):\s*\{\s*enabled:/gm)].map((m) => m[1]);
}

describe("notification preference categories", () => {
  it.each([
    ["agent/settings/page.tsx"],
    ["super-agent/settings/page.tsx"],
  ])("declares every category %s renders", (page) => {
    const rendered = categoriesRenderedBy(page);
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.filter((c) => !CATEGORY_KEYS.includes(c as never))).toEqual([]);
  });

  it("gives every declared category a default", () => {
    for (const key of CATEGORY_KEYS) {
      expect(CATEGORY_DEFAULTS[key]).toEqual(
        expect.objectContaining({ enabled: expect.any(Boolean), channels: expect.any(Array) })
      );
    }
  });

  it("rejects a category the schema does not have", () => {
    // This is what silently no-opped before: accepted by zod, stripped by Mongoose.
    const result = notificationPreferencesUpdateSchema.safeParse({
      categories: { not_a_category: { enabled: false } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts the staff categories", () => {
    const result = notificationPreferencesUpdateSchema.safeParse({
      categories: {
        placements: { enabled: false },
        commissions: { enabled: true, channels: ["email"] },
        team: { enabled: false },
      },
    });
    expect(result.success).toBe(true);
  });

  it("routes staff notification types to the staff categories", () => {
    // Commission payouts are the only emitter of "payment", and both go to an
    // agent or super-agent — so this is the toggle that should mute them.
    expect(typeToCategory("payment")).toBe("commissions");
    expect(typeToCategory("placement")).toBe("placements");
    expect(typeToCategory("placement_completed")).toBe("placements");
    expect(typeToCategory("agent_joined")).toBe("team");
    for (const type of ["target_assigned", "target_updated", "target_at_risk", "target_milestone"]) {
      expect(typeToCategory(type)).toBe("team");
    }
  });

  it("leaves the seeker and employer categories where they were", () => {
    expect(typeToCategory("application_received")).toBe("applications");
    expect(typeToCategory("interview_scheduled")).toBe("interviews");
    expect(typeToCategory("offer_update")).toBe("offers");
    expect(typeToCategory("new_job_posted")).toBe("jobs");
    expect(typeToCategory("profile_update")).toBe("profile_views");
    expect(typeToCategory("system")).toBe("system");
    expect(typeToCategory("something_unmapped")).toBe("system");
  });
});
