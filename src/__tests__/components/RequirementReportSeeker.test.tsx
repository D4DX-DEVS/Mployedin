/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { RequirementReport, reportGaps } from "@/components/features/matching/RequirementReport";
import type { ReportItem, RequirementReport as Report } from "@/lib/matching/requirementReport";

const item = (over: Partial<ReportItem>): ReportItem => ({
  kind: "skill",
  verdict: "has",
  mustHave: false,
  required: "React.js",
  actual: "",
  ...over,
});

const REPORT: Report = {
  items: [
    item({ kind: "education", verdict: "info", required: "", actual: "B-Tech" }),
    item({ kind: "experience", verdict: "has", mustHave: true, required: "2–5 years", detail: { totalYears: 3 } }),
    item({ required: "React.js" }),
    item({ required: "Docker", verdict: "missing" }),
    item({ kind: "credential", verdict: "verify", mustHave: true, required: "Nursing licence", source: "none" }),
  ],
  counts: { has: 2, partial: 0, missing: 1, verify: 1, info: 1 },
  mustHaves: { total: 2, has: 1, partial: 0, missing: 0, verify: 1 },
  status: "unverified",
};

describe("RequirementReport for the seeker", () => {
  it("lists only what is not fully met in gaps mode, without the recruiter's tally", () => {
    render(<RequirementReport report={REPORT} audience="seeker" rows="gaps" />);

    expect(screen.getByText("Docker")).toBeInTheDocument();
    expect(screen.getByText("Nursing licence")).toBeInTheDocument();
    expect(screen.queryByText("React.js")).not.toBeInTheDocument();
    expect(screen.queryByText("2–5 years")).not.toBeInTheDocument();
    expect(screen.queryByText(/to check/)).not.toBeInTheDocument();
    expect(reportGaps(REPORT)).toHaveLength(2);
  });

  it("shows skills as chips and hides rows the job did not ask for", () => {
    render(<RequirementReport report={REPORT} audience="seeker" summary={false} />);

    expect(screen.getByText("React.js")).toBeInTheDocument();
    // One chip per skill: no evidence line under each.
    expect(screen.queryByText("On your profile or CV")).not.toBeInTheDocument();
    expect(screen.queryByText("Not set for this job")).not.toBeInTheDocument();
  });

  it("keeps every row and the tally for the employer", () => {
    render(<RequirementReport report={REPORT} audience="employer" />);

    expect(screen.getByText("Not set for this job")).toBeInTheDocument();
    expect(screen.getByText(/to check/)).toBeInTheDocument();
    expect(screen.getAllByText("Has").length).toBeGreaterThan(0);
  });
});
