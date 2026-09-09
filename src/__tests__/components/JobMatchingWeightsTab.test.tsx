/**
 * The job's Setup → Matching weights tab renders the same builder as the
 * employer-wide page: number box, %, and slider on one row; a "Total" chip
 * and a "Top priority" line instead of three summary tiles; labels from the
 * shared `employerMatchingWeights` copy rather than a hardcoded English map.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { JobMatchingWeightsTab } from "@/components/features/employer/jobs/JobMatchingWeightsTab";

const mockMutateAsync = jest.fn();
let mockServer: { weights: Record<string, number>; source: "job" | "employer" } | undefined;

jest.mock("@/hooks/useJobMatchingWeights", () => ({
  useJobMatchingWeights: () => ({ data: mockServer, isLoading: false }),
  useSaveJobMatchingWeights: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const weights = { skills: 35, experience: 29, education: 17, industryExperience: 13, preferredQualifications: 6 };

describe("JobMatchingWeightsTab", () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockServer = { weights, source: "employer" };
  });

  it("uses the shared builder: inline row, total chip, top-priority line, no summary tiles", () => {
    render(<JobMatchingWeightsTab jobId="job1" />);

    const number = screen.getByLabelText("Skills Match", { selector: "input[type=number]" });
    const range = screen.getByRole("slider", { name: "Skills Match" });
    expect(number.parentElement).toBe(range.parentElement);
    expect(number).toHaveValue(35);

    expect(screen.getByTestId("weight-total")).toHaveTextContent("Total: 100% ✓");
    expect(screen.getByText(/Top priority: Skills Match · 35%/)).toBeInTheDocument();
    expect(screen.queryByText(/Ready to update/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Total at/)).not.toBeInTheDocument();
    expect(screen.getByText("Using your company-wide weights. Change anything below to score this job differently.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save weights for this job/i })).toBeEnabled();
  });

  it("flags an unbalanced total and blocks saving until it is 100 again", () => {
    render(<JobMatchingWeightsTab jobId="job1" />);

    fireEvent.change(screen.getByLabelText("Skills Match", { selector: "input[type=number]" }), { target: { value: "40" } });

    expect(screen.getByTestId("weight-total")).toHaveTextContent("Total: 105%");
    expect(screen.getByRole("button", { name: /save weights for this job/i })).toBeDisabled();
  });

  it("hides the company-defaults banner once the job has its own weights", () => {
    mockServer = { weights, source: "job" };
    render(<JobMatchingWeightsTab jobId="job1" />);

    expect(screen.queryByText(/company-wide weights/)).not.toBeInTheDocument();
  });
});
