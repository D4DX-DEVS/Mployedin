/**
 * QA EMP-016 (2026-10-06): pool names had no limit on edit and "qa, auto, qa"
 * kept its duplicate. One rule set for the API and the dialogs.
 */
import { isValidPoolName, normalizePoolTags, POOL_NAME_MAX, POOL_TAGS_MAX, POOL_TAG_MAX } from "@/lib/talentPools/fields";

describe("isValidPoolName", () => {
  it.each([
    ["Senior React Engineers", true],
    ["  QA  ", true],
    ["a", false],
    ["   ", false],
    ["x".repeat(POOL_NAME_MAX), true],
    ["x".repeat(POOL_NAME_MAX + 1), false],
    ["x".repeat(300), false],
  ])("%j → %s", (name, ok) => {
    expect(isValidPoolName(name)).toBe(ok);
  });

  it("refuses non-strings", () => {
    expect(isValidPoolName(undefined)).toBe(false);
    expect(isValidPoolName(42)).toBe(false);
  });
});

describe("normalizePoolTags", () => {
  it("drops duplicates case-insensitively, keeping the first spelling", () => {
    expect(normalizePoolTags(["qa", " auto ", "qa", "QA", "Auto"])).toEqual(["qa", "auto"]);
  });

  it("drops blanks and non-strings, and caps length and count", () => {
    expect(normalizePoolTags(["", "  ", 7, null, "x".repeat(60)])).toEqual(["x".repeat(POOL_TAG_MAX)]);
    expect(normalizePoolTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(POOL_TAGS_MAX);
  });

  it("returns [] for anything that is not an array", () => {
    expect(normalizePoolTags("qa,auto")).toEqual([]);
    expect(normalizePoolTags(undefined)).toEqual([]);
  });
});
