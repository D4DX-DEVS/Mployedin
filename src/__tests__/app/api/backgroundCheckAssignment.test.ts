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
import { backgroundCheckUpdateSchema } from "@/lib/validators/backgroundChecks";

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

describe("background check update validator", () => {
  it("accepts an assignment", () => {
    const parsed = backgroundCheckUpdateSchema.safeParse({
      assignedTo: "507f1f77bcf86cd799439011",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts clearing an assignment with null", () => {
    expect(backgroundCheckUpdateSchema.safeParse({ assignedTo: null }).success).toBe(true);
  });

  it("rejects an assignee that is not an id", () => {
    expect(backgroundCheckUpdateSchema.safeParse({ assignedTo: "nobody" }).success).toBe(false);
  });

  it("accepts the verify flag and the new outcome", () => {
    const parsed = backgroundCheckUpdateSchema.safeParse({
      verify: true,
      outcome: "unable_to_verify",
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects an outcome it has never heard of", () => {
    expect(backgroundCheckUpdateSchema.safeParse({ outcome: "probably_fine" }).success).toBe(false);
  });
});

describe("background check routes", () => {
  it("credits the colleague, not the owner whose id was swapped in", () => {
    expect(DETAIL_ROUTE).toContain("ctx.member?.actorId ?? ctx.userId");
    expect(LIST_ROUTE).toContain("ctx.member?.actorId ?? ctx.userId");
  });

  it("only lets a manager assign a check", () => {
    expect(DETAIL_ROUTE).toContain("canManageTeam");
  });

  it("refuses a verdict on a check assigned to somebody else", () => {
    expect(DETAIL_ROUTE).toContain("assigned to somebody else");
  });

  it("records who verified and when", () => {
    expect(DETAIL_ROUTE).toMatch(/check\.verifiedBy\s*=/);
    expect(DETAIL_ROUTE).toMatch(/check\.verifiedAt\s*=/);
  });

  it("writes a distinct audit action for assigning and for verifying", () => {
    expect(DETAIL_ROUTE).toContain("background_check.assign");
    expect(DETAIL_ROUTE).toContain("background_check.verify");
  });

  it("offers the assigned-to-me queue on the list endpoint", () => {
    expect(LIST_ROUTE).toContain("assignedToMe");
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
        "unassigned",
        "assignTo",
        "recordVerdict",
        "verifiedBy",
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
