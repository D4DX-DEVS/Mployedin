/**
 * @jest-environment node
 */
/**
 * Handing a background check to a colleague, and getting a verified answer back.
 *
 * These are contract checks over the model, the validator and the route source.
 * They exist because the rules here are easy to regress silently: a colleague's
 * own user id lives on `ctx.member.actorId`, not `ctx.userId` (which has been
 * swapped to the company owner), and an outcome added to the model but not to
 * the validator or the page's translation keys takes the page down at runtime.
 */
import fs from "fs";
import path from "path";
import { backgroundCheckActionSchema, staffBackgroundCheckActionSchema } from "@/lib/validators/backgroundChecks";

const read = (...segments: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

const MODEL = read("src", "models", "BackgroundCheck.ts");
const DETAIL_ROUTE = read(
  "src", "app", "api", "employer", "background-checks", "[id]", "route.ts"
);
const LIST_ROUTE = read("src", "app", "api", "employer", "background-checks", "route.ts");

describe("background check model", () => {
  it("carries the assignment and verification identities", () => {
    for (const field of ["assignedTo", "assignedBy", "assignedAt", "verifiedBy", "verifiedAt"]) {
      expect({ field, present: MODEL.includes(field) }).toEqual({ field, present: true });
    }
  });

  it("admits an unable-to-verify verdict", () => {
    expect(MODEL).toContain("unable_to_verify");
  });

  it("indexes by assignee so a colleague's queue does not scan the collection", () => {
    expect(MODEL).toMatch(/index\(\{\s*assignedTo:\s*1/);
  });
});

const WORKFLOW = read("src", "lib", "backgroundChecks", "workflow.ts");
const STAFF_DETAIL_ROUTE = read("src", "app", "api", "background-checks", "[id]", "route.ts");

describe("background check action validator", () => {
  it("accepts handing a check to someone", () => {
    expect(backgroundCheckActionSchema.safeParse({ action: "assign", assignedTo: "507f1f77bcf86cd799439011" }).success).toBe(true);
  });

  it("accepts leaving a check for whoever starts it", () => {
    expect(backgroundCheckActionSchema.safeParse({ action: "assign", assignedTo: null }).success).toBe(true);
  });

  it("rejects an assignee that is not an id", () => {
    expect(backgroundCheckActionSchema.safeParse({ action: "assign", assignedTo: "nobody" }).success).toBe(false);
  });

  it("completes only with a real verdict", () => {
    expect(backgroundCheckActionSchema.safeParse({ action: "complete", outcome: "unable_to_verify" }).success).toBe(true);
    expect(backgroundCheckActionSchema.safeParse({ action: "complete", outcome: "pending" }).success).toBe(false);
    expect(backgroundCheckActionSchema.safeParse({ action: "complete" }).success).toBe(false);
  });

  it("still rejects an outcome it has never heard of", () => {
    expect(backgroundCheckActionSchema.safeParse({ action: "complete", outcome: "probably_fine" }).success).toBe(false);
  });

  it("rejects a bare field update with no action — every write names its step", () => {
    expect(backgroundCheckActionSchema.safeParse({ status: "completed" }).success).toBe(false);
    expect(backgroundCheckActionSchema.safeParse({ verify: true, outcome: "clear" }).success).toBe(false);
  });

  it("lets agents start, record progress and complete, but not assign, cancel or annotate", () => {
    for (const body of [{ action: "start" }, { action: "progress", backgroundResults: "x" }, { action: "complete", outcome: "clear" }]) {
      expect({ body, ok: staffBackgroundCheckActionSchema.safeParse(body).success }).toEqual({ body, ok: true });
    }
    for (const body of [{ action: "assign", assignedTo: null }, { action: "cancel" }, { action: "notes", backgroundNotes: "x" }]) {
      expect({ body, ok: staffBackgroundCheckActionSchema.safeParse(body).success }).toEqual({ body, ok: false });
    }
  });
});

describe("background check routes", () => {
  it("credits the real person, not the owner whose id a colleague's session borrows", () => {
    expect(DETAIL_ROUTE).toContain("ctx.tenantView?.actorId ?? ctx.member?.actorId ?? ctx.userId");
    expect(LIST_ROUTE).toContain("ctx.tenantView?.actorId ?? ctx.member?.actorId ?? ctx.userId");
  });

  it("records the real requester on a new check", () => {
    expect(LIST_ROUTE).toMatch(/createdBy:\s*ctx\.tenantView\?\.actorId \?\? ctx\.member\?\.actorId \?\? ctx\.userId/);
  });

  it("only lets a manager assign or cancel a check", () => {
    expect(DETAIL_ROUTE).toContain("canManageTeam");
    expect(WORKFLOW).toContain("Only the account owner or a team manager can assign a check.");
  });

  it("claims a check with one conditional update, so two people can't both take it", () => {
    expect(WORKFLOW).toMatch(/status: \{ \$in: OPEN_STATUSES \}, assignedTo: null \}/);
  });

  it("only the holder records progress or the verdict", () => {
    expect(WORKFLOW).toMatch(/status: "in_progress", assignedTo: me/);
  });

  it("records who verified and when", () => {
    expect(WORKFLOW).toMatch(/verifiedBy: me/);
    expect(WORKFLOW).toMatch(/verifiedAt: now/);
  });

  it("refuses a second open check of the same kind for one application", () => {
    expect(LIST_ROUTE).toContain("duplicate_open_check");
  });

  it("offers the assigned-to-me queue on the list endpoint", () => {
    expect(LIST_ROUTE).toContain("assignedToMe");
  });

  it("never sends the employer's notes to staff", () => {
    expect(STAFF_DETAIL_ROUTE).toContain("includeNotes: false");
  });
});

describe("background check page copy", () => {
  it("has a label for every outcome the validator accepts, in both locales", () => {
    const outcomes = ["pending", "clear", "flagged", "failed", "unable_to_verify"];
    for (const locale of ["en", "ar"]) {
      const messages = JSON.parse(read("messages", `${locale}.json`)) as Record<
        string,
        Record<string, Record<string, string>>
      >;
      const labels = messages.employerBackgroundChecks?.outcome ?? {};
      for (const outcome of outcomes) {
        expect({ locale, outcome, present: typeof labels[outcome] === "string" }).toEqual({
          locale,
          outcome,
          present: true,
        });
      }
    }
  });

  it("has the assignment copy in both locales", () => {
    for (const locale of ["en", "ar"]) {
      const messages = JSON.parse(read("messages", `${locale}.json`)) as Record<
        string,
        Record<string, unknown>
      >;
      const section = messages.employerBackgroundChecks ?? {};
      for (const key of [
        "assignedTo",
        "assignedToMe",
        "allChecks",
        "verifiedBy",
        "agentLabel",
      ]) {
        expect({ locale, key, present: typeof section[key] === "string" }).toEqual({
          locale,
          key,
          present: true,
        });
      }
    }
  });
});
