/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ScorecardForm } from "@/components/scorecards/ScorecardForm";

describe("ScorecardForm", () => {
  it("renders its own title when standalone", () => {
    render(<ScorecardForm interviewId="iv-1" onSubmit={jest.fn()} />);
    expect(screen.getByRole("heading", { name: "Interview Scorecard" })).toBeInTheDocument();
  });

  /** A dialog host already names the form in its header, so the embedded form
      must not repeat the title or wrap itself in a second card. */
  it("drops its own title and card chrome when embedded in a dialog", () => {
    const { container } = render(
      <ScorecardForm interviewId="iv-1" onSubmit={jest.fn()} embedded />
    );
    expect(screen.queryByRole("heading", { name: "Interview Scorecard" })).not.toBeInTheDocument();
    expect(screen.queryByText("Evaluate the candidate across key dimensions")).not.toBeInTheDocument();
    const form = container.querySelector("form")!;
    expect(form.className).not.toMatch(/\bborder\b/);
    expect(form.className).not.toMatch(/bg-card/);
    // The rubric itself is still there.
    expect(screen.getByText("Technical Skills")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Scorecard" })).toBeInTheDocument();
  });
});
