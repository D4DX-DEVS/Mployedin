/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { CompareCandidatesDialog } from "@/components/features/employer/applications/CompareCandidatesDialog";
import type { CompareResponse } from "@/hooks/useApplications";

const mockCompare = jest.fn();
jest.mock("@/hooks/useApplications", () => ({
  useCompareApplications: (ids: string[]) => mockCompare(ids),
}));

const IDS = ["64b000000000000000000031", "64b000000000000000000032", "64b000000000000000000033"];

function candidate(id: string, name: string, score: number | null, skills: string[]): CompareResponse["candidates"][number] {
  return {
    applicationId: id,
    status: "shortlisted",
    appliedAt: "2026-09-01T00:00:00.000Z",
    aiMatchScore: score,
    matchBreakdown: score == null ? null : { skills: 85, experience: 70, location: 100, salary: 50 },
    candidate: {
      name,
      profilePicture: null,
      skills,
      yearsOfExperience: 4.5,
      preferredSalary: { min: 12000, max: 15000, currency: "AED" },
      profileCompleteness: 88,
    },
    job: { title: "Full Stack Developer", salaryRange: null },
  };
}

const THREE: CompareResponse = {
  candidates: [
    candidate(IDS[0], "Alice Ahmed", 91, ["React", "Node.js"]),
    candidate(IDS[1], "Bob Baker", 78, ["react", "Go"]),
    candidate(IDS[2], "Cara Costa", null, ["REACT", "Python"]),
  ],
  commonSkills: ["react"],
};

describe("CompareCandidatesDialog", () => {
  beforeEach(() => {
    mockCompare.mockReset();
  });

  it("renders one column per finalist with score, breakdown and shared skills marked", () => {
    mockCompare.mockReturnValue({ data: THREE, isLoading: false, isError: false });
    render(<CompareCandidatesDialog open onOpenChange={() => {}} applicationIds={IDS} />);

    expect(mockCompare).toHaveBeenCalledWith(IDS);
    const columns = screen.getAllByRole("region");
    expect(columns.map((c) => c.getAttribute("aria-label"))).toEqual(["Alice Ahmed", "Bob Baker", "Cara Costa"]);

    // score ring value and one breakdown row
    expect(within(columns[0]).getByText("91%")).toBeInTheDocument();
    expect(within(columns[0]).getByText("Experience")).toBeInTheDocument();
    expect(within(columns[0]).getByText("70%")).toBeInTheDocument();
    // unscored finalist shows the empty state instead of a number
    expect(within(columns[2]).getByText("Not scored yet")).toBeInTheDocument();

    // the shared skill is marked on every column regardless of casing; others are not
    const shared = document.querySelectorAll('[data-shared="true"]');
    expect(shared).toHaveLength(3);
    expect(Array.from(shared).map((el) => el.textContent?.replace(/\(.*\)/, "").trim())).toEqual(["React", "react", "REACT"]);
    expect(within(columns[0]).getByText("Node.js").closest("[data-shared]")).toBeNull();
    expect(screen.getByText("Marked skills appear on every candidate.")).toBeInTheDocument();

    // salary + completeness
    expect(within(columns[1]).getByText(/12,000–15,000 AED/)).toBeInTheDocument();
    expect(within(columns[1]).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "88");
  });

  it("explains an empty comparison and surfaces a load error", () => {
    mockCompare.mockReturnValue({ data: { candidates: [], commonSkills: [] }, isLoading: false, isError: false });
    const { unmount } = render(<CompareCandidatesDialog open onOpenChange={() => {}} applicationIds={IDS.slice(0, 2)} />);
    expect(screen.getByText("Pick two or three candidates to compare.")).toBeInTheDocument();
    unmount();

    mockCompare.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<CompareCandidatesDialog open onOpenChange={() => {}} applicationIds={IDS.slice(0, 2)} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load the comparison.");
  });
});
