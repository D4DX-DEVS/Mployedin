/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CandidateJourney } from "@/components/features/employer/applications/CandidateJourney";

const useCandidateJourneyMock = jest.fn();
jest.mock("@/hooks/useCandidateJourney", () => ({ useCandidateJourney: (...a: unknown[]) => useCandidateJourneyMock(...a) }));

describe("CandidateJourney", () => {
  it("renders interviews per round, the newest offer, the check and the placement", () => {
    useCandidateJourneyMock.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        interviews: [
          { _id: "iv-1", interviewRound: 1, status: "completed", outcome: "passed", scheduledAt: "2026-09-01T09:00:00Z" },
          { _id: "iv-2", interviewRound: 2, status: "scheduled", scheduledAt: "2026-09-12T09:00:00Z" },
        ],
        offer: { _id: "of-1", status: "pending", expiresAt: "2026-09-14T00:00:00Z" },
        check: { _id: "chk-1", status: "in_progress", references: [{ status: "responded" }, { status: "requested" }] },
        placement: undefined,
      },
    });
    render(<CandidateJourney applicationId="app-1" locale="en" />);
    const section = screen.getByRole("region", { name: "Candidate journey" });
    expect(section).toBeInTheDocument();
    expect(screen.getByText("Round 1 · Passed · Sep 1")).toBeInTheDocument();
    expect(screen.getByText("Round 2 · Scheduled · Sep 12")).toBeInTheDocument();
    expect(screen.getByText("Pending · expires Sep 14")).toBeInTheDocument();
    expect(screen.getByText("In progress · 1/2 references replied")).toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
  });

  it("collapses behind a toggle on phones and expands on tap", () => {
    useCandidateJourneyMock.mockReturnValue({ isLoading: false, isError: false, data: { interviews: [], offer: undefined, check: undefined, placement: undefined } });
    render(<CandidateJourney applicationId="app-1" locale="en" />);
    const toggle = screen.getByRole("button", { name: "Show journey" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const grid = toggle.nextElementSibling as HTMLElement;
    expect(grid.className).toContain("hidden");
    expect(grid.className).toContain("md:grid");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide journey" })).toHaveAttribute("aria-expanded", "true");
    expect((screen.getByRole("button", { name: "Hide journey" }).nextElementSibling as HTMLElement).className).not.toContain("hidden");
    expect(screen.getAllByText("None yet")).toHaveLength(2); // interviews + offer
    expect(screen.getByText("Not requested")).toBeInTheDocument();
  });
});
