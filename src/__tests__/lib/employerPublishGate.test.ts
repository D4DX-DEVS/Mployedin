/**
 * The publishing gate for admin-converted employer accounts.
 *
 * An admin converting an account into an employer creates the Employer profile
 * automatically. `companyName` is `required`, so it is seeded from the person's
 * own name - and before this gate existed that account could put a job straight
 * onto the public board advertised under a personal name with no company email,
 * industry or website behind it.
 *
 * The gate must stay narrow: self-registered employers, and employers an admin
 * created through the full form, already supplied their company details, and
 * widening the rule would block live accounts mid-flow.
 */
// The two functions under test are pure, but the module also exports a
// DB-backed variant — stub the driver so this stays a fast unit test.
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findById: jest.fn() } }));

import { isPublishGated, meetsProfileRequirements } from "@/lib/employers/publishGate";

describe("isPublishGated", () => {
  it("gates a role-converted profile that has not confirmed company details", () => {
    expect(isPublishGated({ createdVia: "role_conversion", profileConfirmedAt: null })).toBe(true);
  });

  it("releases the gate once the company profile has been confirmed", () => {
    expect(
      isPublishGated({ createdVia: "role_conversion", profileConfirmedAt: new Date() }),
    ).toBe(false);
  });

  it("never gates a self-registered employer", () => {
    expect(isPublishGated({ createdVia: "self", profileConfirmedAt: null })).toBe(false);
  });

  it("never gates an employer an admin created through the full form", () => {
    expect(isPublishGated({ createdVia: "admin", profileConfirmedAt: null })).toBe(false);
  });

  it("never gates a profile that predates the field - every existing employer", () => {
    // `createdVia` is absent on all 100+ employers created before this shipped.
    expect(isPublishGated({})).toBe(false);
    expect(isPublishGated(null)).toBe(false);
    expect(isPublishGated(undefined)).toBe(false);
  });
});

describe("meetsProfileRequirements", () => {
  it("accepts a profile carrying a name, an email and an industry", () => {
    expect(
      meetsProfileRequirements({
        companyName: "Acme Ltd",
        companyEmail: "hello@acme.test",
        industry: "Construction",
      }),
    ).toBe(true);
  });

  it.each([
    ["industry", { companyName: "Acme Ltd", companyEmail: "hello@acme.test", industry: "" }],
    ["companyEmail", { companyName: "Acme Ltd", companyEmail: "", industry: "Construction" }],
    ["companyName", { companyName: "", companyEmail: "hello@acme.test", industry: "Construction" }],
  ])("rejects a profile missing %s", (_field, profile) => {
    expect(meetsProfileRequirements(profile)).toBe(false);
  });

  it("treats whitespace as missing", () => {
    expect(
      meetsProfileRequirements({
        companyName: "   ",
        companyEmail: "hello@acme.test",
        industry: "Construction",
      }),
    ).toBe(false);
  });
});
