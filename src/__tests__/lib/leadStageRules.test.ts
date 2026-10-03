/**
 * @jest-environment node
 *
 * The Move dialog and the stage route both decide "what must this lead carry
 * to sit in that stage" from src/lib/leads/stageRules.ts. These pin the rules
 * the owner asked for (2026-10-02): each forward stage names its details, Won
 * and Lost always ask, and moving back asks for nothing.
 */
import {
  knownStageDetails,
  missingStageFields,
  stageNeedsDetails,
  STAGE_REQUIRED_FIELDS,
} from "@/lib/leads/stageRules";

describe("stageNeedsDetails", () => {
  it("asks on every forward move", () => {
    expect(stageNeedsDetails("new", "contacted")).toBe(true);
    expect(stageNeedsDetails("contacted", "negotiating")).toBe(true);
  });

  it("always asks for Won and Lost, from any stage", () => {
    expect(stageNeedsDetails("new", "converted")).toBe(true);
    expect(stageNeedsDetails("negotiating", "lost")).toBe(true);
    expect(stageNeedsDetails("converted", "lost")).toBe(true);
  });

  it("asks nothing when moving back or reopening", () => {
    expect(stageNeedsDetails("negotiating", "interested")).toBe(false);
    expect(stageNeedsDetails("lost", "contacted")).toBe(false);
    expect(stageNeedsDetails("converted", "negotiating")).toBe(false);
    expect(stageNeedsDetails("interested", "interested")).toBe(false);
  });
});

describe("missingStageFields", () => {
  it("lists every required detail when nothing is known", () => {
    expect(missingStageFields("contacted", "interested", {})).toEqual(["requirement", "expectedHiring"]);
    expect(missingStageFields("negotiating", "converted", {})).toEqual(["wonValue", "wonAt"]);
    expect(missingStageFields("new", "lost", {})).toEqual(["lostReasonCode"]);
  });

  it("accepts a value the lead already holds instead of making the agent retype it", () => {
    const known = knownStageDetails({ expectedRevenue: 89000, followUpAt: new Date(Date.now() + 86400000) });
    expect(missingStageFields("interested", "negotiating", {}, known)).toEqual([]);
  });

  it("does not take an overdue follow-up as the next one", () => {
    const known = knownStageDetails({ expectedRevenue: 89000, followUpAt: new Date(Date.now() - 86400000) });
    expect(missingStageFields("interested", "negotiating", {}, known)).toEqual(["followUpAt"]);
  });

  it("treats blank strings, NaN and invalid dates as missing", () => {
    expect(missingStageFields("contacted", "interested", { requirement: "   ", expectedHiring: "6-10" })).toEqual(["requirement"]);
    expect(missingStageFields("negotiating", "converted", { wonValue: Number.NaN, wonAt: new Date("nope") })).toEqual(["wonValue", "wonAt"]);
  });

  it("counts a contact already logged on the lead toward Contacted", () => {
    const known = knownStageDetails({ lastContactMethod: "call", lastContactedAt: new Date() });
    expect(missingStageFields("new", "contacted", {}, known)).toEqual([]);
  });

  it("never lets old values stand in for this Won or Lost", () => {
    const known = knownStageDetails({ wonValue: 1200, convertedAt: new Date(), lostReasonCode: "price" });
    expect(missingStageFields("negotiating", "converted", {}, known)).toEqual(["wonValue", "wonAt"]);
    expect(missingStageFields("contacted", "lost", {}, known)).toEqual(["lostReasonCode"]);
  });

  it("New needs nothing beyond the create form", () => {
    expect(STAGE_REQUIRED_FIELDS.new).toEqual([]);
  });
});
