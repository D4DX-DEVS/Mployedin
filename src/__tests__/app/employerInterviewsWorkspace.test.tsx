/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InterviewsWorkspace } from "@/components/features/employer/interviews/InterviewsWorkspace";

const useInterviewsMock = jest.fn();
const updateInterviewMutateAsyncMock = jest.fn();
const updateInterviewMutateMock = jest.fn();
const confirmMock = jest.fn();
const scheduleNextRoundMutateAsyncMock = jest.fn();
const createOfferMutateAsyncMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
  }),
}));

jest.mock("@/hooks/useInterviews", () => ({
  useInterviews: (...args: unknown[]) => useInterviewsMock(...args),
  useUpdateInterview: () => ({ mutate: updateInterviewMutateMock, mutateAsync: updateInterviewMutateAsyncMock, isPending: false }),
  useScheduleNextRound: () => ({ mutate: jest.fn(), mutateAsync: scheduleNextRoundMutateAsyncMock, isPending: false }),
}));

jest.mock("@/hooks/useOffers", () => ({
  useCreateOffer: () => ({ mutateAsync: createOfferMutateAsyncMock, isPending: false }),
}));

jest.mock("@/hooks/useApplications", () => ({
  useCreateScorecard: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: confirmMock, ConfirmDialogNode: null }),
}));

jest.mock("@/hooks/useTableExport", () => ({
  useTableExport: () => ({
    handleExportCsv: jest.fn(),
    handleExportExcel: jest.fn(),
    handleExportPdf: jest.fn(),
  }),
}));

jest.mock("@/components/features/employer/AIInterviewQuestionsPanel", () => ({
  AIInterviewQuestionsPanel: () => null,
}));

jest.mock("@/components/shared/CandidateDataNotice", () => ({
  CandidateDataNotice: () => null,
}));

jest.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => null,
}));

jest.mock("@/components/shared/WorkspaceHeader", () => ({
  WorkspaceHeader: () => <div data-testid="workspace-header">Workspace Header</div>,
}));

jest.mock("@/components/shared/ViewToggle", () => ({
  ViewToggle: () => null,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: () => null,
}));

jest.mock("@/components/ui/date-time-picker", () => ({
  DateTimePicker: () => null,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children, onSelect, ...props }: React.HTMLAttributes<HTMLDivElement> & { onSelect?: () => void }) => (
    <div {...props} role="menuitem" onClick={onSelect}>{children}</div>
  ),
  DropdownMenuSeparator: () => null,
}));

jest.mock("@/components/shared/TableToolbar", () => ({
  TableToolbar: () => null,
}));

jest.mock("@/components/features/employer/jobs/JobScopeStrip", () => ({
  JobScopeStrip: () => null,
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe("InterviewsWorkspace", () => {
  beforeEach(() => {
    useInterviewsMock.mockReset();
    updateInterviewMutateAsyncMock.mockReset();
    scheduleNextRoundMutateAsyncMock.mockReset();
    createOfferMutateAsyncMock.mockReset();
    updateInterviewMutateMock.mockReset();
    confirmMock.mockReset();

    useInterviewsMock.mockReturnValue({
      data: {
        interviews: [
          {
            _id: "iv-1",
            applicationId: "app-1",
            jobId: { _id: "job-1", title: "Senior Developer" },
            jobSeekerId: { _id: "candidate-1", fullName: "John Doe", email: "john@example.com", skills: [] },
            status: "scheduled",
            type: "video",
            scheduledAt: new Date().toISOString(),
            interviewRound: 1,
          },
        ],
        total: 1,
        statusCounts: {
          scheduled: 1,
          confirmed: 0,
          completed: 0,
          cancelled: 0,
          rescheduled: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  describe("embedded mode", () => {
    it("renders without heading level 1 when embedded", () => {
      const { container } = render(<InterviewsWorkspace jobId="job-1" embedded />);
      const h1Elements = container.querySelectorAll("h1");
      expect(h1Elements.length).toBe(0);
    });

    it("calls useInterviews with embedded jobId", () => {
      render(<InterviewsWorkspace jobId="job-1" embedded />);
      expect(useInterviewsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-1",
        })
      );
    });

    it("renders status chips in embedded mode", () => {
      const { container } = render(<InterviewsWorkspace jobId="job-1" embedded />);
      // Check for aria-pressed attribute on status buttons (chips)
      const chips = container.querySelectorAll("[aria-pressed]");
      expect(chips.length).toBeGreaterThan(0);
    });

    it("renders bulk schedule link with jobId query param", () => {
      const { container } = render(<InterviewsWorkspace jobId="job-1" embedded />);
      const bulkScheduleLink = container.querySelector("a[href*='bulk']") as HTMLAnchorElement;
      expect(bulkScheduleLink?.href).toContain("jobId=job-1");
    });

    it("does not render WorkspaceHeader when embedded", () => {
      render(<InterviewsWorkspace jobId="job-1" embedded />);
      expect(screen.queryByTestId("workspace-header")).not.toBeInTheDocument();
    });

    it("uses wrapper class space-y-3 sm:space-y-4 when embedded", () => {
      const { container } = render(<InterviewsWorkspace jobId="job-1" embedded />);
      const wrapper = container.firstChild;
      expect((wrapper as HTMLElement).className).toContain("space-y-3");
    });
  });

  describe("non-embedded mode (default page)", () => {
    it("renders WorkspaceHeader in non-embedded mode", () => {
      render(<InterviewsWorkspace />);
      expect(screen.getByTestId("workspace-header")).toBeInTheDocument();
    });

    it("uses page-container wrapper class when not embedded", () => {
      const { container } = render(<InterviewsWorkspace />);
      const wrapper = container.firstChild;
      expect((wrapper as HTMLElement).className).toContain("page-container");
    });

    it("calls useInterviews without jobId when not provided", () => {
      render(<InterviewsWorkspace />);
      expect(useInterviewsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: undefined,
        })
      );
    });
  });

  describe("table", () => {
    it("keeps six columns and folds AI + secondary actions into the row menu", () => {
      const { container } = render(<InterviewsWorkspace jobId="job-1" embedded />);
      const heads = Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent);
      expect(heads).toEqual(["Candidate", "Role", "Interview", "Scheduled", "Status", "Actions"]);
      // Round and type share the Interview cell; outcome is not a column.
      expect(screen.getByText("R1")).toBeInTheDocument();
      expect(screen.getAllByText("video").length).toBeGreaterThan(0);
      expect(screen.queryByText("—")).not.toBeInTheDocument();
      // The primary action stays inline; everything else sits in the ⋯ menu (mocked inline).
      expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
      for (const label of ["Questions", "Prep Brief", "Reschedule", "Cancel"]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });
  });

  describe("row menu actions", () => {
    it("Cancel asks for confirmation, then cancels the interview", async () => {
      confirmMock.mockResolvedValue(true);
      render(<InterviewsWorkspace jobId="job-1" embedded />);
      fireEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));
      await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
      await waitFor(() => expect(updateInterviewMutateMock).toHaveBeenCalledWith({ id: "iv-1", status: "cancelled" }));
    });

    it("Cancel does nothing when the confirmation is declined", async () => {
      confirmMock.mockResolvedValue(false);
      render(<InterviewsWorkspace jobId="job-1" embedded />);
      fireEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));
      await waitFor(() => expect(confirmMock).toHaveBeenCalled());
      expect(updateInterviewMutateMock).not.toHaveBeenCalled();
    });
  });

  describe("prop-based jobId override", () => {
    it("uses propJobId when provided, ignoring URL", () => {
      render(<InterviewsWorkspace jobId="job-2" />);
      expect(useInterviewsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-2",
        })
      );
    });
  });
});
