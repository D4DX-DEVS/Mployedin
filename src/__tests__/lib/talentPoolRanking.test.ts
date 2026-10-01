/**
 * Ordering for an agent's "matching candidates" list.
 */
import {
  preferenceMismatchOf,
  rankPoolCandidates,
  shortlistByPairScore,
} from "@/lib/matching/talentPoolRanking";
import { employerOptionsFor } from "@/components/features/employer/job-form/OnBehalfEmployerPicker";

describe("rankPoolCandidates", () => {
  it("puts candidates who can take the job first, then those meeting every requirement, then by score", () => {
    const rows = [
      { id: "wants-other-country", preferenceMismatch: "country" as const, requirementsStatus: "met" as const, score: 95 },
      { id: "short-on-experience", preferenceMismatch: null, requirementsStatus: "not_met" as const, score: 90 },
      { id: "fits-70", preferenceMismatch: null, requirementsStatus: "met" as const, score: 70 },
      { id: "fits-85", preferenceMismatch: null, requirementsStatus: "unverified" as const, score: 85 },
    ];
    expect(rankPoolCandidates(rows).map((r) => r.id)).toEqual([
      "fits-85",
      "fits-70",
      "short-on-experience",
      "wants-other-country",
    ]);
  });

  it("does not reorder its input", () => {
    const rows = [
      { preferenceMismatch: null, requirementsStatus: "met" as const, score: 10 },
      { preferenceMismatch: null, requirementsStatus: "met" as const, score: 90 },
    ];
    rankPoolCandidates(rows);
    expect(rows[0].score).toBe(10);
  });
});

describe("shortlistByPairScore", () => {
  it("keeps eligible pairs ahead of higher-scoring ineligible ones and caps the list", () => {
    const rows = [
      { id: "a", eligible: false, score: 99 },
      { id: "b", eligible: true, score: 40 },
      { id: "c", eligible: true, score: 80 },
    ];
    expect(shortlistByPairScore(rows, 2).map((r) => r.id)).toEqual(["c", "b"]);
  });
});

describe("preferenceMismatchOf", () => {
  it("reports only the candidate's own preferences", () => {
    expect(preferenceMismatchOf(false, "country")).toBe("country");
    expect(preferenceMismatchOf(false, "work_mode")).toBe("work_mode");
    expect(preferenceMismatchOf(false, "salary")).toBe("salary");
    // Employer requirements travel in the requirements checklist instead.
    expect(preferenceMismatchOf(false, "experience")).toBeNull();
    expect(preferenceMismatchOf(false, "education_unknown")).toBeNull();
    expect(preferenceMismatchOf(true, undefined)).toBeNull();
  });
});

describe("employerOptionsFor (job form employer picker)", () => {
  it("offers an agent only the employers assigned to them, valued by profile id", () => {
    const rows = [
      { _id: "emp1", companyName: "Assigned Co", assignedToMe: true },
      { _id: "emp2", companyName: "Area-only Co", assignedToMe: false },
      { _id: "emp3", name: "No company name", assignedToMe: true },
    ];
    expect(employerOptionsFor("agent", rows)).toEqual([
      { value: "emp1", label: "Assigned Co" },
      { value: "emp3", label: "No company name" },
    ]);
  });

  it("values an admin's rows by employer profile id, not user id", () => {
    const rows = [
      { _id: "user1", employerProfileId: "emp1", companyName: "Acme" },
      { _id: "user2", companyName: "No profile" },
    ];
    expect(employerOptionsFor("admin", rows)).toEqual([{ value: "emp1", label: "Acme" }]);
  });

  it("tells same-named employer accounts apart by email", () => {
    const rows = [
      { _id: "emp1", companyName: "Beta Industries", email: "bob-1@test.com", assignedToMe: true },
      { _id: "emp2", companyName: "Beta Industries", email: "bob-2@test.com", assignedToMe: true },
      { _id: "emp3", companyName: "Fazil", email: "fazil@test.com", assignedToMe: true },
    ];
    expect(employerOptionsFor("agent", rows)).toEqual([
      { value: "emp1", label: "Beta Industries · bob-1@test.com" },
      { value: "emp2", label: "Beta Industries · bob-2@test.com" },
      { value: "emp3", label: "Fazil" },
    ]);
  });
});
