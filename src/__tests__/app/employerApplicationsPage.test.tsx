/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmployerApplicationsPage from "@/app/[locale]/(dashboard)/employer/applications/page";
import { ApplicationsWorkspace } from "@/components/features/employer/applications/ApplicationsWorkspace";

const useApplicationsMock = jest.fn();
const replaceMock = jest.fn();
const updateStatusMutateAsyncMock = jest.fn();
const bulkActionMutateAsyncMock = jest.fn();
const createScorecardMutateAsyncMock = jest.fn();
const createInterviewMutateAsyncMock = jest.fn();
const createOfferMutateAsyncMock = jest.fn();
const fetchInterviewForAppMutateAsyncMock = jest.fn();
const computeAiMatchMutateAsyncMock = jest.fn();
const bulkAiMatchMutateAsyncMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/employer/applications",
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
  useRouter: () => ({ push: jest.fn(), replace: (...args: unknown[]) => replaceMock(...args) }),
}));

// Phase 3 leaves: saved views fetch through react-query and the pool dialog
// reads talent pools — neither is what this suite asserts on.
jest.mock("@/hooks/useSavedViews", () => ({
  useSavedViews: () => ({ views: [], isLoading: false, create: { mutateAsync: jest.fn() }, remove: { mutateAsync: jest.fn() } }),
}));
jest.mock("@/components/features/employer/SaveToPoolDialog", () => ({ SaveToPoolDialog: () => null }));

// Every data hook is already mocked, so the page only needs useQueryClient to
// exist — a real provider would add nothing this suite asserts on.
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
  }),
}));

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  };
});

// The panel's Message action opens a DM; the mutation is not what these tests
// exercise, and useMutation would need a QueryClientProvider.
jest.mock("@/hooks/useCandidates", () => ({
  ...jest.requireActual("@/hooks/useCandidates"),
  useStartConversation: () => ({ mutateAsync: jest.fn() }),
}));

// The drawer's candidate journey fans out four queries; no provider here, so stub it.
jest.mock("@/hooks/useCandidateJourney", () => ({
  useCandidateJourney: () => ({ data: { interviews: [], offer: undefined, check: undefined, placement: undefined }, isLoading: false, isError: false }),
}));

jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

jest.mock("@/hooks/useWorkflow", () => ({
  useWorkflow: () => ({ data: null }),
}));

jest.mock("@/hooks/useApplications", () => ({
  useApplications: (...args: unknown[]) => useApplicationsMock(...args),
  useUpdateApplicationStatus: () => ({ mutateAsync: updateStatusMutateAsyncMock }),
  useBulkAction: () => ({ mutateAsync: bulkActionMutateAsyncMock, isPending: false }),
  useApplicationTimeline: () => ({ data: { timeline: [] }, isLoading: false }),
  useCreateScorecard: () => ({ mutateAsync: createScorecardMutateAsyncMock, isPending: false }),
  useCreateInterviewFromApp: () => ({ mutateAsync: createInterviewMutateAsyncMock, isPending: false }),
  useCreateOfferFromApp: () => ({ mutateAsync: createOfferMutateAsyncMock, isPending: false }),
  useFetchInterviewForApp: () => ({ mutateAsync: fetchInterviewForAppMutateAsyncMock }),
  useComputeAiMatch: () => ({ mutateAsync: computeAiMatchMutateAsyncMock, isPending: false, variables: undefined }),
  useBulkAiMatch: () => ({ mutateAsync: bulkAiMatchMutateAsyncMock, isPending: false }),
}));

jest.mock("@/hooks/useScorecards", () => ({
  useScorecardsByApplicationIds: () => ({ data: {} }),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
}));

jest.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ options, value, onValueChange, placeholder }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <select aria-label={placeholder} value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

jest.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => null,
}));

jest.mock("@/components/scorecards/ScorecardForm", () => ({
  ScorecardForm: () => null,
}));

jest.mock("@/components/shared/ResumeViewerModal", () => ({
  ResumeViewerModal: () => null,
}));

describe("EmployerApplicationsPage", () => {
  beforeEach(() => {
    useApplicationsMock.mockReset();
    updateStatusMutateAsyncMock.mockReset();
    bulkActionMutateAsyncMock.mockReset();
    createScorecardMutateAsyncMock.mockReset();
    createInterviewMutateAsyncMock.mockReset();
    createOfferMutateAsyncMock.mockReset();
    fetchInterviewForAppMutateAsyncMock.mockReset();
    computeAiMatchMutateAsyncMock.mockReset();
    bulkAiMatchMutateAsyncMock.mockReset();

    useApplicationsMock.mockReturnValue({
      data: {
        applications: [
          {
            _id: "app-1",
            jobId: { _id: "job-1", title: "Senior Full Stack Developer" },
            jobSeekerId: {
              _id: "candidate-1",
              userId: { _id: "user-1", name: "Amina Noor" },
              skills: ["React", "Node.js", "TypeScript", "GraphQL"],
              currentLocation: "Dubai",
              totalExperienceYears: 6,
              experience: [{ jobTitle: "Senior Web Developer", company: "Acme", isCurrent: true }],
              cv: { originalUrl: "https://example.com/cv.pdf" },
            },
            status: "shortlisted",
            aiMatchScore: 84,
            appliedAt: "2026-04-08T00:00:00.000Z",
            coverLetter: "Delivers production-ready React features across global teams.",
            matchBreakdown: { skills: 88, experience: 80, overall: 84 },
            matchStrengths: ["Leadership in cross-functional delivery"],
            matchGaps: ["Needs deeper fintech domain context"],
            otherApplicationsCount: 1,
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      },
      isLoading: false,
    });
  });

  it("keeps rich candidate details out of the default list until Detailed View is opened", async () => {
    const user = userEvent.setup();

    render(<EmployerApplicationsPage />);

    expect(screen.getByRole("heading", { name: /applications/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select visible/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /score all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /shortlist top/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /kanban/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/compact cards keep the list easy to scan/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /detailed view/i })).toBeInTheDocument();
    expect(screen.queryByText("Delivers production-ready React features across global teams.")).not.toBeInTheDocument();
    expect(screen.queryByText("Leadership in cross-functional delivery")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /detailed view/i }));

    expect(await screen.findByRole("dialog", { name: /candidate details for amina noor/i })).toBeInTheDocument();
    expect(screen.getByText("Strengths")).toBeInTheDocument();
    // coverLetter is no longer rendered in the detail panel (dropped in a later
    // redesign); matchStrengths remains the "rich detail" gated by this toggle
    expect(screen.getByText("Leadership in cross-functional delivery")).toBeInTheDocument();
  });

  it("closes the detailed view sheet from its close button", async () => {
    const user = userEvent.setup();

    render(<EmployerApplicationsPage />);

    await user.click(screen.getByTestId("applicant-row-app-1"));
    expect(await screen.findByRole("dialog", { name: /candidate details for amina noor/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close candidate details/i }));

    expect(screen.queryByRole("dialog", { name: /candidate details for amina noor/i })).not.toBeInTheDocument();
  });

  it("opens the detailed view sheet when the compact row is clicked", async () => {
    const user = userEvent.setup();

    render(<EmployerApplicationsPage />);

    await user.click(screen.getByTestId("applicant-row-app-1"));

    expect(await screen.findByRole("dialog", { name: /candidate details for amina noor/i })).toBeInTheDocument();
    expect(screen.getByText("Strengths")).toBeInTheDocument();
  });

  it("keeps the Needs review deep link in the URL after the filter reset (A26)", async () => {
    const user = userEvent.setup();
    render(<ApplicationsWorkspace jobId="job-1" embedded />);
    replaceMock.mockClear();
    await user.click(screen.getByRole("button", { name: /needs review/i }));
    // The chip writes ?unreviewed=1, then the filter-reset effect writes page=1
    // away; the last write must still carry the chip's query.
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    const last = replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0] as string;
    expect(last).toContain("unreviewed=1");
    expect(last).not.toContain("page=");
  });

  it("renders embedded mode without workspace header or job selector", () => {
    useApplicationsMock.mockReturnValue({
      data: {
        applications: [
          {
            _id: "app-1",
            jobId: { _id: "job-1", title: "Senior Full Stack Developer" },
            jobSeekerId: {
              _id: "candidate-1",
              userId: { _id: "user-1", name: "Amina Noor" },
              skills: ["React", "Node.js", "TypeScript", "GraphQL"],
              currentLocation: "Dubai",
              totalExperienceYears: 6,
              experience: [{ jobTitle: "Senior Web Developer", company: "Acme", isCurrent: true }],
              cv: { originalUrl: "https://example.com/cv.pdf" },
            },
            status: "shortlisted",
            aiMatchScore: 84,
            appliedAt: "2026-04-08T00:00:00.000Z",
            coverLetter: "Delivers production-ready React features across global teams.",
            matchBreakdown: { skills: 88, experience: 80, overall: 84 },
            matchStrengths: ["Leadership in cross-functional delivery"],
            matchGaps: ["Needs deeper fintech domain context"],
            otherApplicationsCount: 1,
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      },
      isLoading: false,
    });

    render(<ApplicationsWorkspace jobId="job-1" embedded />);

    expect(screen.queryByRole("heading", { name: /applications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /select job/i })).not.toBeInTheDocument();
    expect(useApplicationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1" })
    );
  });
});
