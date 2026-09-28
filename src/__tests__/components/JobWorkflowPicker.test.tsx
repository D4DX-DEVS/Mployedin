/**
 * The job form's workflow picker follows the job's details: it asks for the
 * template those details resolve to and shows it with the reason, and a
 * person can pin another template or go back to automatic.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { JobWorkflowPicker } from "@/components/features/employer/job-form/JobWorkflowPicker";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";

const mockOptions = jest.fn();
jest.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(value: T) => value }));
jest.mock("@/hooks/useWorkflowTemplates", () => ({
  useWorkflowTemplateOptions: (input: unknown) => mockOptions(input),
}));

const STAGES = [
  { id: "applied", label: "Applied", phase: "applied" },
  { id: "tech", label: "Technical round", phase: "interview_scheduled" },
  { id: "hired", label: "Hired", phase: "hired" },
];
const SALES = { _id: "t-sales", name: "Sales hiring", stages: STAGES };
const OPS = { _id: "t-ops", name: "Operations hiring", stages: STAGES };

let formValue: unknown;
function Harness({ defaults }: { defaults: Partial<JobFormValues> }) {
  const form = useForm<JobFormValues>({ defaultValues: defaults as JobFormValues });
  formValue = form.watch("workflowTemplateId");
  return (
    <FormProvider {...form}>
      <JobWorkflowPicker />
    </FormProvider>
  );
}

beforeEach(() => {
  mockOptions.mockReset();
  mockOptions.mockReturnValue({
    data: { templates: [SALES, OPS], resolved: { templateId: "t-sales", name: "Sales hiring", reason: { kind: "matched", dimensions: ["title"] }, stages: STAGES } },
    isLoading: false,
    isError: false,
  });
});

it("asks for the template the job's details resolve to and explains why", () => {
  render(<Harness defaults={{ title: "Sales Executive", category: "Sales", employmentType: "full_time" }} />);

  expect(mockOptions).toHaveBeenCalledWith(expect.objectContaining({
    match: expect.objectContaining({ title: "Sales Executive", category: "Sales", employmentType: "full_time" }),
  }));
  expect(screen.getAllByText("Sales hiring").length).toBeGreaterThan(0);
  expect(screen.getByText(/matches this job's job title/i)).toBeInTheDocument();
  expect(screen.getByText("Technical round")).toBeInTheDocument();
  expect(formValue).toBeUndefined();
});

it("pins another template, then goes back to automatic", () => {
  render(<Harness defaults={{ title: "Sales Executive" }} />);

  fireEvent.click(screen.getByRole("button", { expanded: false }));
  fireEvent.click(screen.getByRole("option", { name: /Operations hiring/ }));
  expect(formValue).toBe("t-ops");
  expect(screen.getByText("Chosen by hand for this job.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { expanded: false }));
  fireEvent.click(screen.getByRole("option", { name: /Automatic/ }));
  expect(formValue).toBeNull();
});

it("says so when the workflows can't be loaded", () => {
  mockOptions.mockReturnValue({ data: undefined, isLoading: false, isError: true });
  render(<Harness defaults={{ title: "Sales Executive" }} />);

  expect(screen.getByText("We couldn't load the workflows. Please try again.")).toBeInTheDocument();
});
