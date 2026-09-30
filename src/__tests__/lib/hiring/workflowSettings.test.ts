/**
 * @jest-environment node
 */
import {
  HIRING_RULE_DEFAULTS,
  SHORTLIST_TARGET_MAX,
  SHORTLIST_TARGET_MIN,
  STRONG_MATCH_THRESHOLD,
  pickHiringRuleFields,
  resolveHiringRules,
  shouldAutoShortlist,
} from "@/lib/hiring/workflowSettings";

describe("resolveHiringRules", () => {
  it("falls back to safe defaults when nothing is stored", () => {
    expect(resolveHiringRules(undefined, undefined)).toEqual({
      autoRejectEnabled: false,
      autoRejectBelow: 40,
      notifyOnStageChange: true,
      shortlistTarget: 50,
      autoShortlistEnabled: false,
      autoShortlistAbove: 80,
    });
    expect(HIRING_RULE_DEFAULTS.autoRejectEnabled).toBe(false);
    expect(STRONG_MATCH_THRESHOLD).toBe(80);
  });

  it("treats legacy documents (threshold stored, no enabled flag) as auto-reject OFF", () => {
    // Every Job created before 2026-09-10 carries { aiAutoScreen: true, autoRejectBelow: 40 }.
    const rules = resolveHiringRules(
      { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 40 },
      { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 40 },
    );
    expect(rules.autoRejectEnabled).toBe(false);
    expect(rules.autoRejectBelow).toBe(40);
  });

  it("resolves each field independently: job value, then employer value, then default", () => {
    const rules = resolveHiringRules(
      { shortlistTarget: 20 },
      { notifyOnStageChange: false, autoRejectEnabled: true, autoRejectBelow: 55 },
    );
    expect(rules).toEqual({
      autoRejectEnabled: true,
      autoRejectBelow: 55,
      notifyOnStageChange: false,
      shortlistTarget: 20,
      autoShortlistEnabled: false,
      autoShortlistAbove: 80,
    });
  });

  it("lets the job switch auto-reject off even when the employer default has it on", () => {
    const rules = resolveHiringRules({ autoRejectEnabled: false }, { autoRejectEnabled: true, autoRejectBelow: 60 });
    expect(rules.autoRejectEnabled).toBe(false);
    expect(rules.autoRejectBelow).toBe(60);
  });

  it("ignores values of the wrong type and clamps numbers into range", () => {
    const rules = resolveHiringRules(
      { shortlistTarget: "lots", autoRejectBelow: 500, notifyOnStageChange: "yes" },
      { shortlistTarget: 0 },
    );
    expect(rules.shortlistTarget).toBe(SHORTLIST_TARGET_MIN); // employer 0 clamped up
    expect(rules.autoRejectBelow).toBe(100); // clamped down
    expect(rules.notifyOnStageChange).toBe(true); // "yes" ignored → default
    expect(resolveHiringRules({ shortlistTarget: 1000 }).shortlistTarget).toBe(SHORTLIST_TARGET_MAX);
  });

  it("accepts null / non-object inputs without throwing", () => {
    expect(resolveHiringRules(null, "nope" as unknown as Record<string, unknown>)).toEqual(HIRING_RULE_DEFAULTS);
  });
});

describe("resolveHiringRulesForJob", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveHiringRulesForJob, isJobWorkflowCustomized } = require("@/lib/hiring/workflowSettings");

  it("uses job settings only once the per-job save stamped customizedAt", () => {
    const employer = { workflow: { settings: { notifyOnStageChange: false, shortlistTarget: 25 } } };
    const unsaved = { workflow: { settings: { notifyOnStageChange: true, shortlistTarget: 50 } } };
    const saved = { workflow: { customizedAt: new Date(), settings: { notifyOnStageChange: true } } };
    expect(isJobWorkflowCustomized(unsaved)).toBe(false);
    expect(resolveHiringRulesForJob(unsaved, employer)).toMatchObject({ notifyOnStageChange: false, shortlistTarget: 25 });
    expect(resolveHiringRulesForJob(saved, employer)).toMatchObject({ notifyOnStageChange: true, shortlistTarget: 25 });
    expect(resolveHiringRulesForJob(null, null).autoRejectEnabled).toBe(false);
  });
});

describe("auto-shortlist on arrival (client report 2026-09-30)", () => {
  const on = resolveHiringRules({ autoShortlistEnabled: true, autoShortlistAbove: 75 });

  it("is off unless the employer turns it on", () => {
    expect(shouldAutoShortlist(resolveHiringRules(), 99, "met")).toBe(false);
  });

  it("shortlists at or above the line, and not below it", () => {
    expect(shouldAutoShortlist(on, 75, "met")).toBe(true);
    expect(shouldAutoShortlist(on, 74, "met")).toBe(false);
    expect(shouldAutoShortlist(on, null, "met")).toBe(false);
  });

  it("never shortlists a candidate whose requirements are not met", () => {
    expect(shouldAutoShortlist(on, 95, "not_met")).toBe(false);
    // Unverified means nothing failed; the employer sees the badge on the shortlist.
    expect(shouldAutoShortlist(on, 95, "unverified")).toBe(true);
  });

  it("clamps the line into 0–100 and keeps only rule fields when saving", () => {
    expect(resolveHiringRules({ autoShortlistAbove: 250 }).autoShortlistAbove).toBe(100);
    expect(pickHiringRuleFields({ autoShortlistEnabled: true, autoShortlistAbove: 70, junk: 1 })).toEqual({
      autoShortlistEnabled: true,
      autoShortlistAbove: 70,
    });
  });
});
