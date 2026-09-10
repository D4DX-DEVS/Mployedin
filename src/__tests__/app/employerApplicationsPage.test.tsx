/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
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
const updateInterviewMutateAsyncMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/employer/applications",
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
  useRouter: () => ({ push: jest.fn(), replace: (...args: unknown[]) => replaceMock(...args) }),
}));

// The pool dialog reads talent pools — not what this suite asserts on.
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
// The page is now an async server component guarded by a company-function check.
jest.mock("@/lib/auth/requireCompanyFunction", () => ({ requireCompanyFunction: jest.fn(async () => undefined) }));
jest.mock("@/hooks/useJobWorkflow", () => ({ useJobWorkflow: () => ({ data: null }) }));
jest.mock("@/hooks/useSeekerAvailability", () => ({ useSeekerAvailability: () => ({ data: null }) }));

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

// The stage-move conflict path cancels a stranded interview; useMutation here
// would need a QueryClientProvider this suite does not set up.
jest.mock("@/hooks/useInterviews", () => ({
  useUpdateInterview: () => ({ mutateAsync: updateInterviewMutateAsyncMock, isPending: false }),
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

const toastInfoMock = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
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
    toastInfoMock.mockReset();
    updateInterviewMutateAsyncMock.mockReset();

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

    render(await EmployerApplicationsPage());

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

    render(await EmployerApplicationsPage());

    await user.click(screen.getByTestId("applicant-row-app-1"));
    expect(await screen.findByRole("dialog", { name: /candidate details for amina noor/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close candidate details/i }));

    expect(screen.queryByRole("dialog", { name: /candidate details for amina noor/i })).not.toBeInTheDocument();
  });

  it("opens the detailed view sheet when the compact row is clicked", async () => {
    const user = userEvent.setup();

    render(await EmployerApplicationsPage());

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

  describe("Shortlist Top with nothing eligible", () => {
    /** The default fixture is one shortlisted applicant — already past Applied,
        so nothing is eligible. The button must still say why. */
    it("stays clickable and names the reason instead of doing nothing", async () => {
      const user = userEvent.setup();
      render(<ApplicationsWorkspace jobId="job-1" embedded />);

      const button = screen.getByRole("button", { name: /shortlist top/i });
      expect(button).not.toBeDisabled();

      await user.click(button);

      await waitFor(() => expect(toastInfoMock).toHaveBeenCalledTimes(1));
      expect(toastInfoMock.mock.calls[0][0]).toMatch(/already/i);
      expect(bulkActionMutateAsyncMock).not.toHaveBeenCalled();
    });

    it("asks for scores first when applicants sit at Applied without a match score", async () => {
      const user = userEvent.setup();
      useApplicationsMock.mockReturnValue({
        data: {
          applications: [
            {
              _id: "app-2",
              jobId: { _id: "job-1", title: "Senior Full Stack Developer" },
              jobSeekerId: { _id: "candidate-2", userId: { _id: "user-2", name: "Bilal Khan" }, skills: [] },
              status: "applied",
              aiMatchScore: null,
              appliedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        },
        isLoading: false,
      });

      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      await user.click(screen.getByRole("button", { name: /shortlist top/i }));

      await waitFor(() => expect(toastInfoMock).toHaveBeenCalledTimes(1));
      expect(toastInfoMock.mock.calls[0][0]).toMatch(/score all/i);
      expect(bulkActionMutateAsyncMock).not.toHaveBeenCalled();
    });

    it("says the view is empty when no applicants are listed at all", async () => {
      const user = userEvent.setup();
      useApplicationsMock.mockReturnValue({
        data: { applications: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } },
        isLoading: false,
      });

      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      await user.click(screen.getByRole("button", { name: /shortlist top/i }));

      await waitFor(() => expect(toastInfoMock).toHaveBeenCalledTimes(1));
      expect(toastInfoMock.mock.calls[0][0]).toMatch(/no applicants/i);
      expect(bulkActionMutateAsyncMock).not.toHaveBeenCalled();
    });
  });

  describe("Score All with nothing to score", () => {
    /** Scoring also runs automatically on first load, so the toolbar button is
        usually inert by the time anyone reads it — it must say why. */
    it("stays clickable and says every applicant is already scored", async () => {
      const user = userEvent.setup();
      render(<ApplicationsWorkspace jobId="job-1" embedded />);

      const button = screen.getByRole("button", { name: /score all/i });
      expect(button).not.toBeDisabled();

      await user.click(button);

      await waitFor(() => expect(toastInfoMock).toHaveBeenCalledTimes(1));
      expect(toastInfoMock.mock.calls[0][0]).toMatch(/already has a match score/i);
      expect(bulkAiMatchMutateAsyncMock).not.toHaveBeenCalled();
    });

    it("says the view is empty when no applicants are listed at all", async () => {
      const user = userEvent.setup();
      useApplicationsMock.mockReturnValue({
        data: { applications: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } },
        isLoading: false,
      });

      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      await user.click(screen.getByRole("button", { name: /score all/i }));

      await waitFor(() => expect(toastInfoMock).toHaveBeenCalledTimes(1));
      expect(toastInfoMock.mock.calls[0][0]).toMatch(/no applicants/i);
      expect(bulkAiMatchMutateAsyncMock).not.toHaveBeenCalled();
    });

    it("still scores when unscored applicants are in view", async () => {
      const user = userEvent.setup();
      useApplicationsMock.mockReturnValue({
        data: {
          applications: [
            {
              _id: "app-3",
              jobId: { _id: "job-1", title: "Senior Full Stack Developer" },
              jobSeekerId: { _id: "candidate-3", userId: { _id: "user-3", name: "Sara Ali" }, skills: [] },
              status: "applied",
              aiMatchScore: null,
              appliedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        },
        isLoading: false,
      });

      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      // The first-load effect already scores unscored rows; clear it, then
      // assert the explicit click scores too and toasts no excuse.
      await waitFor(() => expect(bulkAiMatchMutateAsyncMock).toHaveBeenCalled());
      bulkAiMatchMutateAsyncMock.mockClear();

      // While a pass is running the button reads "Scoring…"; wait for it back.
      await user.click(await screen.findByRole("button", { name: /score all/i }));

      await waitFor(() => expect(bulkAiMatchMutateAsyncMock).toHaveBeenCalledTimes(1));
      expect(toastInfoMock).not.toHaveBeenCalled();
    });
  });

  describe("candidate panel overflow menu", () => {
    /** The ⋯ button used to be a bare icon with no handler at all, and the
        Background Check tile had no request affordance anywhere in the panel. */
    async function openPanelMenu() {
      const user = userEvent.setup();
      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      await user.click(screen.getByTestId("applicant-row-app-1"));
      await screen.findByRole("dialog", { name: /candidate details for amina noor/i });
      await user.click(screen.getByRole("button", { name: /more actions/i }));
      return user;
    }

    it("opens a menu instead of doing nothing", async () => {
      await openPanelMenu();
      expect(screen.getByRole("menuitem", { name: /request background check/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /save to pool/i })).toBeInTheDocument();
    });

    it("deep links the background check request to this application", async () => {
      await openPanelMenu();
      const link = screen.getByRole("menuitem", { name: /request background check/i });
      expect(link).toHaveAttribute("href", "/en/employer/background-checks?applicationId=app-1");
    });
  });

  describe("shortlist chip", () => {
    /** The Applications tab already IS everyone who applied, so an "Applied"
        chip repeats the tab's own count and reads as a contradiction. The one
        chip that adds something is the shortlist. */
    function withCounts(shortlisted = 3, interviewing = 1) {
      useApplicationsMock.mockReturnValue({
        data: {
          applications: [],
          statusCounts: { applied: 3, shortlisted, interview_scheduled: interviewing, selected: 0, offer: 0, hired: 0, rejected: 2, withdrawn: 0 },
          pagination: { total: 3, page: 1, limit: 10, totalPages: 1 },
        },
        isLoading: false,
      });
    }

    it("offers the shortlist and nothing else", () => {
      withCounts();
      render(<ApplicationsWorkspace jobId="job-1" embedded />);

      const chips = screen.getByRole("group", { name: /filter by stage/i });
      expect(within(chips).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Shortlisted4"]);
      expect(within(chips).queryByRole("button", { name: /applied/i })).not.toBeInTheDocument();
    });

    /** Shortlisting is what sends someone to interview, so advancing must not
        drop them out of the shortlist: 3 sitting at shortlisted + 1 who has
        moved on to Interviewing = 4. */
    it("keeps counting candidates who have since advanced", () => {
      withCounts();
      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      expect(screen.getByRole("button", { name: /shortlisted 4/i })).toBeInTheDocument();
    });

    it("leaves out anyone rejected or still untriaged", () => {
      useApplicationsMock.mockReturnValue({
        data: {
          applications: [],
          statusCounts: { applied: 5, shortlisted: 1, interview_scheduled: 0, selected: 0, offer: 0, hired: 1, rejected: 4, withdrawn: 2 },
          pagination: { total: 13, page: 1, limit: 10, totalPages: 2 },
        },
        isLoading: false,
      });
      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      // 1 shortlisted + 1 hired; applied, rejected and withdrawn are excluded.
      expect(screen.getByRole("button", { name: /shortlisted 2/i })).toBeInTheDocument();
    });

    it("filters to the shortlist in one click, and back out again", async () => {
      const user = userEvent.setup();
      withCounts();
      render(<ApplicationsWorkspace jobId="job-1" embedded />);

      await user.click(screen.getByRole("button", { name: /shortlisted 4/i }));
      await waitFor(() => expect(useApplicationsMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined, stageFrom: "shortlisted" }),
      ));
      expect(screen.getByRole("button", { name: /shortlisted 4/i })).toHaveAttribute("aria-pressed", "true");

      await user.click(screen.getByRole("button", { name: /shortlisted 4/i }));
      await waitFor(() => expect(useApplicationsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: undefined, stageFrom: undefined }),
      ));
    });

    it("drops the chip when nobody has been shortlisted", () => {
      withCounts(0, 0);
      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      expect(screen.queryByRole("button", { name: /shortlisted/i })).not.toBeInTheDocument();
    });

    /** Without this the chip vanishes the moment its last candidate moves on,
        leaving the list filtered with no way to clear it. */
    it("keeps the chip while it is the active filter, even at zero", async () => {
      const user = userEvent.setup();
      withCounts();
      const { rerender } = render(<ApplicationsWorkspace jobId="job-1" embedded />);
      await user.click(screen.getByRole("button", { name: /shortlisted 4/i }));

      withCounts(0, 0);
      rerender(<ApplicationsWorkspace jobId="job-1" embedded />);

      expect(screen.getByRole("button", { name: /shortlisted 0/i })).toHaveAttribute("aria-pressed", "true");
    });

    it("shows a dash until the totals arrive", () => {
      useApplicationsMock.mockReturnValue({
        data: { applications: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } },
        isLoading: true,
      });
      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      expect(screen.getByRole("button", { name: /shortlisted —/i })).toBeInTheDocument();
    });
  });
  describe("Move Stage menu", () => {
    /** All six stages listed flat gave no hint which one comes next. */
    async function openStageMenu() {
      const user = userEvent.setup();
      render(<ApplicationsWorkspace jobId="job-1" embedded />);
      await user.click(screen.getByTestId("applicant-row-app-1"));
      const panel = await screen.findByRole("dialog", { name: /candidate details for amina noor/i });
      await user.click(within(panel).getByRole("button", { name: /move stage/i }));
      return { user, panel };
    }

    it("leads with the next stage under its own heading", async () => {
      const { panel } = await openStageMenu();

      const menu = within(panel).getByRole("menu", { name: /move stage/i });
      expect(within(menu).getByRole("group", { name: /next/i })).toBeInTheDocument();
      // The fixture candidate is shortlisted, so Interviewing is the next step.
      const items = within(menu).getAllByRole("menuitem").map((n) => n.textContent?.trim());
      expect(items[0]).toBe("Interviewing");
    });

    it("keeps every other stage available below, backwards ones included", async () => {
      const { panel } = await openStageMenu();

      const menu = within(panel).getByRole("menu", { name: /move stage/i });
      const items = within(menu).getAllByRole("menuitem").map((n) => n.textContent?.trim());
      expect(items).toEqual(["Interviewing", "Applied", "Selected", "Offer", "Hired", "Rejected"]);
      expect(within(menu).getByRole("group", { name: /move elsewhere/i })).toBeInTheDocument();
    });

    it("still moves the candidate when the next-stage item is chosen", async () => {
      const { user, panel } = await openStageMenu();

      const menu = within(panel).getByRole("menu", { name: /move stage/i });
      await user.click(within(menu).getByRole("menuitem", { name: "Interviewing" }));

      // Interviewing opens the scheduling modal rather than writing the stage.
      await waitFor(() => expect(screen.getByText("Set up the interview details")).toBeInTheDocument());
      expect(updateStatusMutateAsyncMock).not.toHaveBeenCalled();
    });
  });
});
