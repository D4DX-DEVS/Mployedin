/**
 * Overview tab of the employer job workspace.
 *
 * The rule under test: a section or fact renders only when the employer set
 * it. Benefits, learning outcomes, duration, employment type and work mode all
 * come from the edit form and were stored without ever being shown; an empty
 * "Duration —" cell would read as an unfinished product, so absent data means
 * an absent cell, not a placeholder.
 */
import { render, screen } from "@testing-library/react";
import JobOverviewPage from "@/app/[locale]/(dashboard)/employer/jobs/[id]/page";

let mockJob: Record<string, unknown> = {};

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en", id: "job1" }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/en/employer/jobs/job1",
}));
jest.mock("@/hooks/useJobs", () => ({ useJobDetail: () => ({ data: mockJob }) }));
let mockSummary: Record<string, unknown> | undefined;
jest.mock("@/hooks/useJobHiringSummary", () => ({ useJobHiringSummary: () => ({ data: mockSummary }) }));

const baseJob = {
  _id: "job1",
  title: "Accountant",
  description: "Keep the books.",
  status: "active",
  salary: { min: 20000, max: 20000, currency: "INR", isNegotiable: true, period: "monthly" },
  requirements: { skills: [] },
  vacancies: 1,
  views: 28,
};

describe("employer job Overview", () => {
  beforeEach(() => {
    mockJob = { ...baseJob };
    mockSummary = undefined;
  });

  it("hides the optional sections and facts the employer never filled in", () => {
    render(<JobOverviewPage />);

    expect(screen.queryByRole("heading", { name: "Benefits" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What you’ll learn" })).not.toBeInTheDocument();
    expect(screen.queryByText("Employment type")).not.toBeInTheDocument();
    expect(screen.queryByText("Work arrangement")).not.toBeInTheDocument();
    expect(screen.queryByText("Duration")).not.toBeInTheDocument();
    expect(screen.queryByText("Applicant cap")).not.toBeInTheDocument();
  });

  it("collapses an equal min/max salary to one figure with its period and hint", () => {
    mockJob = { ...baseJob, showSalary: false };
    render(<JobOverviewPage />);

    expect(screen.getByText("20,000 INR / month")).toBeInTheDocument();
    expect(screen.getByText("negotiable · hidden from candidates")).toBeInTheDocument();
    expect(screen.queryByText(/20,000–20,000/)).not.toBeInTheDocument();
  });

  it("shows the edit-form fields once they exist", () => {
    mockJob = {
      ...baseJob,
      salary: { min: 40000, max: 60000, currency: "USD", period: "yearly" },
      employmentType: "contract",
      workMode: "hybrid",
      duration: "6 months",
      maxApplicants: 50,
      benefits: ["Health cover"],
      learningOutcomes: ["Ledger automation"],
    };
    render(<JobOverviewPage />);

    expect(screen.getByText("40,000–60,000 USD / year")).toBeInTheDocument();
    expect(screen.getByText("Employment type")).toBeInTheDocument();
    expect(screen.getByText("Contract")).toBeInTheDocument();
    expect(screen.getByText("Work arrangement")).toBeInTheDocument();
    expect(screen.getByText("Hybrid")).toBeInTheDocument();
    expect(screen.getByText("6 months")).toBeInTheDocument();
    expect(screen.getByText("Applicant cap")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Benefits" })).toBeInTheDocument();
    expect(screen.getByText("Health cover")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What you’ll learn" })).toBeInTheDocument();
    expect(screen.getByText("Ledger automation")).toBeInTheDocument();
  });

  it("keeps Needs attention and Job facts in one side column", () => {
    render(<JobOverviewPage />);

    const attention = screen.getByRole("heading", { name: "Needs attention" }).closest("section");
    const facts = screen.getByRole("heading", { name: "Job facts" }).closest("section");
    expect(attention?.parentElement).toBe(facts?.parentElement);
  });

  /** Each Needs attention row must land where its records actually are. An
      in-progress background check used to point at the Hires tab, which only
      lists candidates who accepted an offer — so it opened "No hires yet". */
  it("sends an in-progress background check to the background-checks page, not Hires", () => {
    mockSummary = {
      jobId: "job1", status: "active", vacancies: 1, views: 28, total: 3,
      statusCounts: { applied: 0, shortlisted: 3, interview_scheduled: 0, selected: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 0 },
      unreviewed: 0,
      interviews: { open: 0, interviewingCandidates: 0, upcoming: 0, awaitingOutcome: 0, rescheduleRequests: 0 },
      offers: { pending: 0, expiringSoon: 0, accepted: 0 },
      checks: { inProgress: 1, completed: 0 },
      placements: { active: 0, completed: 0 },
      posters: 0,
    };

    render(<JobOverviewPage />);

    const link = screen.getByRole("link", { name: /background check/i });
    expect(link).toHaveAttribute("href", "/en/employer/background-checks?jobId=job1");
  });
});
