/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ScreeningQuestionField,
  isUnanswered,
  type ScreeningQuestion,
} from "@/app/[locale]/(dashboard)/job-seeker/applications/[id]/screening-answers/_components/ScreeningQuestionField";

// The job form stores these types (Job.screeningQuestions); the page drew none of
// number / radio / select before, so AI-written questions had no inputs.
const number: ScreeningQuestion = { id: "q1", label: "Years teaching?", type: "number", required: true };
const radio: ScreeningQuestion = { id: "q2", label: "Eligible to work?", type: "radio", options: ["Yes", "No"], required: true };
const select: ScreeningQuestion = { id: "q3", label: "Notice period?", type: "select", options: ["Immediate", "Up to 30 days"] };

describe("ScreeningQuestionField", () => {
  it("draws a number input named by the question", () => {
    const onChange = jest.fn();
    render(<ScreeningQuestionField question={number} index={0} value={undefined} invalid={false} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Years teaching?"), { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith("4");
  });

  it("draws one choice per radio option and reports the pick", () => {
    const onChange = jest.fn();
    render(<ScreeningQuestionField question={radio} index={1} value={undefined} invalid={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(onChange).toHaveBeenCalledWith("No");
  });

  it("draws a select for select questions", () => {
    render(<ScreeningQuestionField question={select} index={2} value="Immediate" invalid={false} onChange={jest.fn()} />);
    expect(screen.getByRole("combobox", { name: "Notice period?" })).toBeInTheDocument();
  });

  it("says when a required answer is missing", () => {
    render(<ScreeningQuestionField question={number} index={0} value="" invalid onChange={jest.fn()} />);
    expect(screen.getByText("Answer this question.")).toBeInTheDocument();
  });
});

describe("isUnanswered", () => {
  it("treats blank text and empty picks as unanswered", () => {
    expect(isUnanswered(undefined)).toBe(true);
    expect(isUnanswered("  ")).toBe(true);
    expect(isUnanswered([])).toBe(true);
    expect(isUnanswered("4")).toBe(false);
    expect(isUnanswered(["A"])).toBe(false);
  });
});
