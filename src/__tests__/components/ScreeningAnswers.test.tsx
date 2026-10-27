/**
 * The employer reads each candidate's screening answers in the candidate
 * panel — open questions included, not only deal-breakers (client 2026-10-27).
 */
import { render, screen } from "@testing-library/react";
import { ScreeningAnswers } from "@/components/features/employer/applications/ScreeningAnswers";

describe("ScreeningAnswers", () => {
  it("shows every question with this candidate's answer", () => {
    render(
      <ScreeningAnswers
        answers={[
          { questionId: "q1", questionLabel: "How do you handle a difficult customer?", answer: "I listen first, then\noffer a fix." },
          { questionId: "q2", questionLabel: "Do you hold a forklift licence?", answer: true },
          { questionId: "q3", questionLabel: "Which shifts can you work?", answer: ["Morning", "Night"] },
          { questionId: "q4", questionLabel: "Anything else?", answer: "" },
        ]}
      />,
    );
    expect(screen.getByText("Screening answers")).toBeInTheDocument();
    expect(screen.getByText("4 questions")).toBeInTheDocument();
    expect(screen.getByText(/I listen first, then/)).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("Morning, Night")).toBeInTheDocument();
    expect(screen.getByText("No answer")).toBeInTheDocument();
  });

  it("says whether a deal-breaker or preferred answer qualifies", () => {
    render(
      <ScreeningAnswers
        answers={[
          { questionId: "q1", questionLabel: "Valid UAE driving licence?", answer: "No" },
          { questionId: "q2", questionLabel: "FMCG experience?", answer: "Yes" },
          { questionId: "q3", questionLabel: "Why this role?", answer: "Growth" },
        ]}
        checks={[
          { key: "screening", status: "not_met", hard: true, questionId: "q1", label: "Valid UAE driving licence?" },
          { key: "screening", status: "met", hard: false, questionId: "q2", label: "FMCG experience?" },
          { key: "experience", status: "met", hard: true },
        ]}
      />,
    );
    expect(screen.getByText("Deal-breaker:")).toBeInTheDocument();
    expect(screen.getByText("Not met")).toBeInTheDocument();
    expect(screen.getByText("Preferred answer:")).toBeInTheDocument();
    expect(screen.getByText("Met")).toBeInTheDocument();
    // An open question carries no verdict.
    expect(screen.getAllByText(/Deal-breaker:|Preferred answer:/)).toHaveLength(2);
  });

  it("renders nothing when the candidate answered no questions", () => {
    const { container } = render(<ScreeningAnswers answers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
