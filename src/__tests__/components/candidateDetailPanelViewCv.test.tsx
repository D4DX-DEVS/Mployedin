/**
 * D5 (CV standardisation): "View CV" shows only when the viewer can open a CV.
 * The row menu was gated; the detail panel still offered the button for a
 * sourced-only candidate and clicking it only raised "CV not available".
 */
import { render, screen } from "@testing-library/react";
import { CandidateDetailPanel } from "@/components/features/employer/candidates/CandidateDetailPanel";
import type { Candidate } from "@/hooks/useCandidates";

jest.mock("@/hooks/useCandidates", () => ({
  useCandidateDetail: () => ({ data: undefined, isLoading: false, isError: false }),
}));

function candidate(over: Partial<Candidate>): Candidate {
  return { _id: "c1", userId: { _id: "u1", name: "Anjali Menon" }, skills: [], ...over } as unknown as Candidate;
}

function renderPanel(c: Candidate) {
  render(
    <CandidateDetailPanel
      candidate={c}
      isInReviewList={false}
      onOpenCv={jest.fn()}
      onStartMessage={jest.fn()}
      onOpenProfile={jest.fn()}
      onToggleReviewList={jest.fn()}
    />,
  );
}

describe("CandidateDetailPanel — View CV", () => {
  it("is shown when the candidate has a CV the viewer may open", () => {
    renderPanel(candidate({ canBuildCv: true }));
    expect(screen.getByRole("button", { name: /view ?cv/i })).toBeInTheDocument();
  });

  it("is hidden for a sourced-only candidate with no accessible CV", () => {
    renderPanel(candidate({ canBuildCv: true, cvAccessible: false }));
    expect(screen.queryByRole("button", { name: /view ?cv/i })).not.toBeInTheDocument();
  });

  it("is hidden when there is nothing to open at all", () => {
    renderPanel(candidate({}));
    expect(screen.queryByRole("button", { name: /view ?cv/i })).not.toBeInTheDocument();
  });
});
