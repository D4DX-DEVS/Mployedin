/**
 * @jest-environment node
 */
import { classifyPolicyVersion } from "@/lib/gdpr/policyVersionLabel";

describe("classifyPolicyVersion", () => {
  it.each([
    ["cookie-v1", 1],
    ["cookie-v12", 12],
    ["cookie-v100", 100],
  ])("reads %s as cookie wording version %i", (raw, version) => {
    expect(classifyPolicyVersion(raw)).toEqual({ kind: "cookie", version });
  });

  it("reads an ISO date or timestamp as a date (a Terms / Privacy version)", () => {
    const date = classifyPolicyVersion("2026-09-29");
    expect(date).toEqual({ kind: "date", date: new Date("2026-09-29") });

    const stamp = classifyPolicyVersion("2026-10-02T08:15:30.000Z");
    expect(stamp).toEqual({ kind: "date", date: new Date("2026-10-02T08:15:30.000Z") });
  });

  it.each([
    ["a made-up cookie version", "cookie-vX"],
    ["a cookie version with trailing text", "cookie-v1-beta"],
    ["a word", "legacy"],
    ["words and a number the Date parser would accept", "version 12"],
    ["a date-shaped string that is not a date", "2026-13-45"],
    ["an empty string", ""],
  ])("shows %s as stored, never as a date or a dash", (_label, raw) => {
    expect(classifyPolicyVersion(raw)).toEqual({ kind: "raw", value: raw });
  });
});
