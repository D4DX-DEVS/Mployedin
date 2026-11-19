/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import EmployerCandidatesPage from "@/app/[locale]/(dashboard)/employer/candidates/page";

const pushMock = jest.fn();
const useCandidatesMock = jest.fn();
const usePublishedJobsMock = jest.fn();
const mutateAsyncStartConversationMock = jest.fn();
const mutateAsyncAiMatchMock = jest.fn();
const mockFetch = jest.fn();
const sessionStorageGetItemMock = jest.fn();
const sessionStorageSetItemMock = jest.fn();

global.fetch = mockFetch as unknown as typeof fetch;

// The filters live in the query string, so `replace` has to actually move the
// URL: a no-op mock leaves the shared query cache holding a write that never
// lands, and the next test mounts with the previous test's filters applied.
const replaceMock = jest.fn((href: string) => {
  window.history.replaceState({}, "", href);
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const toastSuccessMock = jest.mocked(toast.success);
const toastErrorMock = jest.mocked(toast.error);

jest.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

jest.mock("@/hooks/useCandidates", () => ({
  useCandidates: (...args: unknown[]) => useCandidatesMock(...args),
  usePublishedJobs: (...args: unknown[]) => usePublishedJobsMock(...args),
  useStartConversation: () => ({ mutateAsync: mutateAsyncStartConversationMock }),
  useAiMatch: () => ({ mutateAsync: mutateAsyncAiMatchMock }),
  useScreenCandidates: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
  useInviteToApply: () => ({ mutateAsync: jest.fn().mockResolvedValue({}) }),
  useCandidateDetail: () => ({ data: undefined, isLoading: false }),
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
  SearchableSelect: ({ options, value, onValueChange, placeholder, ariaLabel }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel ?? placeholder} value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => null,
}));

// Records what the viewer is opened with: its URL decides whether staff get
// the Standardised CV (only /api/employers/candidates/<id>/cv URLs have one).
const resumeViewerMock = jest.fn();
jest.mock("@/components/shared/ResumeViewerModal", () => ({
  ResumeViewerModal: (props: Record<string, unknown>) => {
    resumeViewerMock(props);
    return null;
  },
}));

// The export dialog has its own suite; here only what the list hands it matters.
const cvExportDialogMock = jest.fn();
jest.mock("@/components/shared/CvExport/CvExportDialog", () => ({
  CvExportDialog: (props: { open: boolean }) => {
    cvExportDialogMock(props);
    return props.open ? <div role="dialog" aria-label="CV export dialog" /> : null;
  },
}));

// Stands in for the real dialog; "Mock save" is a successful save of the candidate(s) it was opened for.
jest.mock("@/components/features/employer/SaveToPoolDialog", () => ({
  SaveToPoolDialog: (props: { open: boolean; candidateId: string | null; candidateIds?: string[]; onSaved?: (ids: string[]) => void }) =>
    props.open ? (
      <button type="button" onClick={() => props.onSaved?.(props.candidateIds?.length ? props.candidateIds : props.candidateId ? [props.candidateId] : [])}>
        Mock save
      </button>
    ) : null,
}));

// Who is signed in: an owner by default; a test swaps in a colleague.
let sessionUser: Record<string, unknown> = { id: "u1", role: "employer" };
jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ can: () => true, role: "employer", session: { user: sessionUser } }),
}));

describe("EmployerCandidatesPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/en/employer/candidates");
    resumeViewerMock.mockReset();
    cvExportDialogMock.mockReset();
    replaceMock.mockClear();
    pushMock.mockReset();
    sessionUser = { id: "u1", role: "employer" };
    useCandidatesMock.mockReset();
    usePublishedJobsMock.mockReset();
    mutateAsyncStartConversationMock.mockReset();
    mutateAsyncAiMatchMock.mockReset();
    mockFetch.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    sessionStorageGetItemMock.mockReset();
    sessionStorageSetItemMock.mockReset();
    sessionStorageGetItemMock.mockReturnValue(null);

    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: sessionStorageGetItemMock,
        setItem: sessionStorageSetItemMock,
      },
      writable: true,
    });

    usePublishedJobsMock.mockReturnValue({
      data: [
        {
          _id: "job-frontend",
          title: "Frontend Engineer",
          requirements: { skills: ["React", "TypeScript"] },
          location: { city: "Dubai", country: "UAE", isRemote: true },
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [
          {
            _id: "candidate-1",
            userId: { _id: "user-1", name: "Amina Noor", email: "amina@example.com" },
            skills: ["React", "TypeScript"],
            currentLocation: "Dubai",
            totalExperienceYears: 5,
            availabilityStatus: "immediately",
            profileCompleteness: 92,
            experience: [{ jobTitle: "Frontend Engineer", company: "Acme", isCurrent: true }],
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });
  });

  it("passes the main search term into useCandidates", async () => {
    const user = userEvent.setup();

    render(<EmployerCandidatesPage />);

    await user.click(screen.getByRole("button", { name: /^filters$/i }));
    await user.type(screen.getByPlaceholderText("Search candidates, skills, role, or company"), "React");

    await waitFor(() => expect(useCandidatesMock).toHaveBeenLastCalledWith(expect.objectContaining({
      search: "React",
      jobId: undefined,
    })));
  });

  it("keeps advanced filters collapsed until the recruiter opens them", async () => {
    const user = userEvent.setup();

    render(<EmployerCandidatesPage />);

    await user.click(screen.getByRole("button", { name: /^filters$/i }));
    expect(screen.queryByPlaceholderText("Skills, comma separated")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /advanced/i }));

    expect(screen.getByPlaceholderText("Skills, comma separated")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^saved$/i })).toBeInTheDocument();
  });

  it("shows the saved profile full name when the user record name is missing", () => {
    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [
          {
            _id: "candidate-1",
            fullName: "Updated Candidate Name",
            userId: { _id: "user-1", name: "", email: "candidate@example.com" },
            skills: ["React"],
            currentLocation: "Dubai",
            totalExperienceYears: 5,
            availabilityStatus: "immediately",
            profileCompleteness: 92,
            experience: [{ jobTitle: "Frontend Engineer", company: "Acme", isCurrent: true }],
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(<EmployerCandidatesPage />);

    expect(screen.getByText("Updated Candidate Name")).toBeInTheDocument();
  });

  it("falls back to the user account name when full name is only whitespace", () => {
    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [
          {
            _id: "candidate-1",
            fullName: "   ",
            userId: { _id: "user-1", name: "Amina Noor", email: "candidate@example.com" },
            skills: ["React"],
            currentLocation: "Dubai",
            totalExperienceYears: 5,
            availabilityStatus: "immediately",
            profileCompleteness: 92,
            experience: [{ jobTitle: "Frontend Engineer", company: "Acme", isCurrent: true }],
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(<EmployerCandidatesPage />);

    expect(screen.getByText("Amina Noor")).toBeInTheDocument();
  });

  it("shows the unknown candidate fallback when both name sources are empty", () => {
    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [
          {
            _id: "candidate-1",
            fullName: "",
            userId: { _id: "user-1", name: "", email: "candidate@example.com" },
            skills: ["React"],
            currentLocation: "Dubai",
            totalExperienceYears: 5,
            availabilityStatus: "immediately",
            profileCompleteness: 92,
            experience: [{ jobTitle: "Frontend Engineer", company: "Acme", isCurrent: true }],
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(<EmployerCandidatesPage />);

    expect(screen.getByText("Unknown candidate")).toBeInTheDocument();
  });

  it("applies AI search results to the candidate filters", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        summary: "Showing ready-now frontend candidates in Dubai.",
        filters: {
          search: "frontend",
          jobQuery: "Frontend Engineer",
          location: "Dubai",
          skills: ["React", "TypeScript"],
          availability: "immediately",
          scoreBand: "high",
        },
      }),
    });

    render(<EmployerCandidatesPage />);

    await user.click(screen.getByRole("button", { name: /^filters$/i }));
    await user.type(
      screen.getByPlaceholderText("AI search: e.g. high match React candidates in Dubai ready now"),
      "ready-now frontend candidates in Dubai"
    );
    await user.click(screen.getByRole("button", { name: /apply ai search/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/ai/candidate-search-filters",
      expect.objectContaining({ method: "POST" })
    ));
    await waitFor(() => expect(useCandidatesMock).toHaveBeenLastCalledWith(expect.objectContaining({
      search: "frontend",
      jobId: "job-frontend",
    })));

    expect(screen.getByDisplayValue("Dubai")).toBeInTheDocument();
    expect(screen.getByDisplayValue("React, TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Showing ready-now frontend candidates in Dubai.")).toBeInTheDocument();
  // `user.type` dispatches one keystroke at a time and re-renders between
  // each, so this case runs for several seconds on its own. Under a full
  // parallel run it exceeded jest's 5s default and took the next test with
  // it, because the timeout aborts before the mocks are reset.
  }, 20_000);

  it("shows the empty candidate state when no results are available", () => {
    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [],
        total: 0,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(<EmployerCandidatesPage />);

    expect(screen.getByRole("heading", { name: /no candidates match this view/i })).toBeInTheDocument();
    expect(screen.getByText(/No job seeker profiles exist yet, or the selected role does not have candidates on this page\./i)).toBeInTheDocument();
  });

  it("shows the empty jobs state when no published jobs are available", () => {
    usePublishedJobsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [],
        total: 0,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(<EmployerCandidatesPage />);

    expect(screen.getByText("No published jobs available yet")).toBeInTheDocument();
    expect(screen.getByText(/Publish a job first so this page has a role to compare candidates against\./i)).toBeInTheDocument();
  });

  it("shows the load error state and retries both data sources", async () => {
    const user = userEvent.setup();
    const refetchJobsMock = jest.fn();
    const refetchCandidatesMock = jest.fn();

    usePublishedJobsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch: refetchJobsMock,
    });
    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [],
        total: 0,
      },
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: refetchCandidatesMock,
    });

    render(<EmployerCandidatesPage />);

    expect(screen.getByText("Unable to load all candidate matching data")).toBeInTheDocument();
    expect(screen.getByText("Published jobs and candidates both failed to load.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetchJobsMock).toHaveBeenCalledTimes(1);
    expect(refetchCandidatesMock).toHaveBeenCalledTimes(1);
  });

  it("hydrates the selected job from session storage and persists review-list updates", async () => {
    const user = userEvent.setup();
    sessionStorageGetItemMock.mockReturnValueOnce(JSON.stringify({
      selectedJobId: "job-frontend",
      reviewListIds: [],
    }));

    render(<EmployerCandidatesPage />);

    await waitFor(() => expect(useCandidatesMock).toHaveBeenLastCalledWith(expect.objectContaining({
      search: "",
      jobId: "job-frontend",
    })));
    await user.click(screen.getByRole("button", { name: /^filters$/i }));
    // The job selector now doubles as the AI-match comparison target; its
    // accessible name is its placeholder ("All"), not a dedicated label
    expect(screen.getByLabelText("Benchmark job")).toHaveValue("job-frontend");

    await user.click(screen.getByRole("button", { name: /^save for review$/i }));

    await waitFor(() => expect(sessionStorageSetItemMock).toHaveBeenCalled());

    const [, lastPersistedValue] = sessionStorageSetItemMock.mock.calls.at(-1) as [string, string];
    expect(JSON.parse(lastPersistedValue)).toEqual({
      selectedJobId: "job-frontend",
      reviewListIds: ["candidate-1"],
    });
    expect(screen.getByRole("button", { name: /saved for review/i })).toBeInTheDocument();
  });

  it("keeps the first-view candidate card compact while still exposing the details action", () => {
    render(<EmployerCandidatesPage />);

    // The whole row is the details action now (role="button", aria-label="Open details for <name>")
    expect(screen.getByRole("button", { name: /open details for/i })).toBeInTheDocument();
    expect(screen.queryByText("Current role")).not.toBeInTheDocument();
    expect(screen.queryByText("Skill snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Match snapshot")).not.toBeInTheDocument();
  });

  it("opens candidate details when clicking the row itself", async () => {
    const user = userEvent.setup();

    render(<EmployerCandidatesPage />);

    await user.click(screen.getByTestId("candidate-row-candidate-1"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("runs AI match for all visible candidates and re-enables the action after partial failures", async () => {
    const user = userEvent.setup();
    const pendingMatches = new Map<
      string,
      {
        resolve: (value: {
          score: number;
          breakdown: { overall: number };
          summary: string;
          strengths: string[];
          gaps: string[];
        }) => void;
        reject: (reason?: unknown) => void;
      }
    >();

    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [
          {
            _id: "candidate-1",
            userId: { _id: "user-1", name: "Amina Noor", email: "amina@example.com" },
            skills: ["React", "TypeScript"],
            currentLocation: "Dubai",
            totalExperienceYears: 5,
            availabilityStatus: "immediately",
            profileCompleteness: 92,
            experience: [{ jobTitle: "Frontend Engineer", company: "Acme", isCurrent: true }],
          },
          {
            _id: "candidate-2",
            userId: { _id: "user-2", name: "Lina Ahmed", email: "lina@example.com" },
            skills: ["Node.js", "TypeScript"],
            currentLocation: "Abu Dhabi",
            totalExperienceYears: 4,
            availabilityStatus: "within_month",
            profileCompleteness: 88,
            experience: [{ jobTitle: "Full Stack Engineer", company: "Orbit", isCurrent: true }],
          },
        ],
        total: 2,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    mutateAsyncAiMatchMock.mockImplementation(({ jobSeekerId }: { jobSeekerId: string }) => new Promise((resolve, reject) => {
      pendingMatches.set(jobSeekerId, {
        resolve: resolve as (value: {
          score: number;
          breakdown: { overall: number };
          summary: string;
          strengths: string[];
          gaps: string[];
        }) => void,
        reject,
      });
    }));

    render(<EmployerCandidatesPage />);

    await user.click(screen.getByRole("button", { name: /^filters$/i }));
    await user.selectOptions(screen.getByLabelText("Benchmark job"), "job-frontend");
    await waitFor(() => expect(useCandidatesMock).toHaveBeenLastCalledWith(expect.objectContaining({
      search: "",
      jobId: "job-frontend",
    })));

    await user.click(screen.getByRole("button", { name: /run ai match/i }));

    await waitFor(() => expect(mutateAsyncAiMatchMock).toHaveBeenCalledTimes(2));
    expect(mutateAsyncAiMatchMock.mock.calls.map(([args]) => args)).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId: "job-frontend", jobSeekerId: "user-1" }),
      expect.objectContaining({ jobId: "job-frontend", jobSeekerId: "user-2" }),
    ]));

    pendingMatches.get("user-1")?.resolve({
      score: 91,
      breakdown: { overall: 91 },
      summary: "Strong frontend fit.",
      strengths: ["React depth"],
      gaps: [],
    });
    pendingMatches.get("user-2")?.reject(new Error("rate limited"));

    await waitFor(() => expect(screen.getByText("Scored 1 candidate. 1 candidate could not be scored.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /run ai match/i })).toBeEnabled();
    // The combined "91% AI match" phrase now only appears inside the detail
    // dialog; the compact row shows the score via ScoreRing, whose "91%" is
    // split into a number + literal "%" text node under one <span>
    expect(screen.getByText((_content, element) =>
      element?.tagName.toLowerCase() === "span" && element.textContent === "91%"
    )).toBeInTheDocument();
  });

  it("opens candidate details in a dialog from the compact card", async () => {
    const user = userEvent.setup();

    useCandidatesMock.mockReturnValue({
      data: {
        candidates: [
          {
            _id: "candidate-1",
            userId: { _id: "user-1", name: "Amina Noor", email: "amina@example.com" },
            skills: ["React", "TypeScript", "Node.js"],
            currentLocation: "Dubai",
            totalExperienceYears: 5,
            availabilityStatus: "immediately",
            profileCompleteness: 92,
            matchScore: 91,
            matchBreakdown: { overall: 91, skills: 94, experience: 88 },
            matchSummary: "Strong frontend fit with strong delivery evidence.",
            strengths: ["React depth", "Strong UI systems"],
            gaps: ["No recent Next.js project listed"],
            experience: [{ jobTitle: "Frontend Engineer", company: "Acme", isCurrent: true }],
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    render(<EmployerCandidatesPage />);

  expect(screen.queryByText("Strong frontend fit with strong delivery evidence.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open details for/i }));

    const dialog = await screen.findByRole("dialog");

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Strong frontend fit with strong delivery evidence.")).toBeInTheDocument();
    expect(within(dialog).getByText("Score breakdown")).toBeInTheDocument();
    expect(within(dialog).getByText("No recent Next.js project listed")).toBeInTheDocument();
  });

  describe("Export CVs, on the selection", () => {
    const talent = (count: number, withCv = true) => Array.from({ length: count }, (_, i) => ({
      _id: `cand-${i + 1}`,
      userId: { _id: `user-${i + 1}`, name: `Candidate ${i + 1}`, email: `c${i + 1}@example.com` },
      skills: ["React"],
      currentLocation: "Dubai",
      totalExperienceYears: 3,
      availabilityStatus: "immediately",
      profileCompleteness: 80,
      experience: [],
      ...(withCv ? { cv: { originalUrl: "https://example.com/cv.pdf" } } : {}),
    }));
    const listOf = (candidates: unknown[]) => useCandidatesMock.mockReturnValue({
      data: { candidates, total: candidates.length },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    const lastDialogProps = () => cvExportDialogMock.mock.calls.at(-1)?.[0] as {
      open: boolean;
      items: Array<{ seekerId: string; applicationId?: string; name?: string }>;
    };

    it("is not offered until a candidate is selected", () => {
      listOf(talent(2));
      render(<EmployerCandidatesPage />);
      expect(screen.queryByRole("button", { name: /export cvs/i })).not.toBeInTheDocument();
    });

    it("exports the ticked candidates, with no application: it is the talent pool, so Original is the profile file", async () => {
      listOf(talent(3));
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);

      await user.click(screen.getByRole("checkbox", { name: "Select Candidate 1" }));
      await user.click(screen.getByRole("checkbox", { name: "Select Candidate 3" }));
      expect(lastDialogProps().open).toBe(false);
      await user.click(screen.getByRole("button", { name: /export cvs/i }));

      expect(await screen.findByRole("dialog", { name: /cv export dialog/i })).toBeInTheDocument();
      expect(lastDialogProps().items).toEqual([
        { seekerId: "cand-1", name: "Candidate 1" },
        { seekerId: "cand-3", name: "Candidate 3" },
      ]);
      expect(lastDialogProps().items.every((item) => !("applicationId" in item))).toBe(true);
    });

    it("keeps the list's own selection actions, and adds the shared sticky bar that carries Export", async () => {
      listOf(talent(2));
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);

      await user.click(screen.getByRole("checkbox", { name: "Select Candidate 1" }));

      expect(screen.getByRole("button", { name: /save 1 to pool/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^clear$/i })).toBeInTheDocument();
      const bar = screen.getByRole("region", { name: /selected rows/i });
      expect(bar.className).toMatch(/\bsticky\b/);
      expect(within(bar).getByText("1 selected")).toBeInTheDocument();
      expect(within(bar).getByRole("button", { name: /export cvs/i })).toBeEnabled();
    });

    it("clears the selection from the bar", async () => {
      listOf(talent(2));
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);
      await user.click(screen.getByRole("checkbox", { name: "Select Candidate 1" }));

      await user.click(within(screen.getByRole("region", { name: /selected rows/i })).getByRole("button", { name: /clear selection/i }));

      expect(screen.queryByRole("region", { name: /selected rows/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /export cvs/i })).not.toBeInTheDocument();
    });

    it("selects the whole page, then allows exactly 50", async () => {
      listOf(talent(50));
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);

      await user.click(screen.getByRole("checkbox", { name: /select all on this page/i }));
      const button = screen.getByRole("button", { name: /export cvs/i });
      expect(button).toBeEnabled();
      await user.click(button);

      expect(lastDialogProps().items).toHaveLength(50);
    });

    it("blocks 51 and says why, instead of opening a dialog that cannot export", async () => {
      listOf(talent(51));
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);

      await user.click(screen.getByRole("checkbox", { name: /select all on this page/i }));

      const button = screen.getByRole("button", { name: /export cvs/i });
      expect(button).toBeDisabled();
      expect(screen.getByText(/export up to 50 CVs at a time/i)).toBeInTheDocument();
      expect(button).toHaveAccessibleDescription(/up to 50 CVs/i);
      await user.click(button);
      expect(lastDialogProps().open).toBe(false);
    });

    it("keeps a candidate ticked on another page in the export, named from the row that was ticked", async () => {
      const page1 = talent(2);
      listOf(page1);
      const user = userEvent.setup();
      const { rerender } = render(<EmployerCandidatesPage />);
      await user.click(screen.getByRole("checkbox", { name: "Select Candidate 1" }));

      listOf([{ ...talent(3)[2], _id: "cand-on-page-2", userId: { _id: "u9", name: "Page Two", email: "p@example.com" } }]);
      rerender(<EmployerCandidatesPage />);
      await user.click(screen.getByRole("checkbox", { name: "Select Page Two" }));
      await user.click(await screen.findByRole("button", { name: /export cvs/i }));

      expect(lastDialogProps().items).toEqual([
        { seekerId: "cand-1", name: "Candidate 1" },
        { seekerId: "cand-on-page-2", name: "Page Two" },
      ]);
    });

    it("does not export what was saved (starred) in an earlier visit: the export has its own selection", async () => {
      sessionStorageGetItemMock.mockReturnValueOnce(JSON.stringify({ selectedJobId: "", reviewListIds: ["cand-1", "cand-elsewhere"] }));
      listOf(talent(2));
      render(<EmployerCandidatesPage />);

      // Nothing is ticked, so there is no bar and no export, whatever was saved.
      expect(screen.queryByRole("button", { name: /export cvs/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /selected rows/i })).not.toBeInTheDocument();
      expect(lastDialogProps().items).toEqual([]);
    });

    it("the bar's Clear empties the export selection and leaves the saved stars alone", async () => {
      sessionStorageGetItemMock.mockReturnValueOnce(JSON.stringify({ selectedJobId: "", reviewListIds: ["cand-2"] }));
      listOf(talent(2));
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);
      expect(await screen.findAllByRole("button", { name: /^saved for review$/i })).toHaveLength(1);

      await user.click(screen.getByRole("checkbox", { name: "Select Candidate 1" }));
      await user.click(within(screen.getByRole("region", { name: /selected rows/i })).getByRole("button", { name: /clear selection/i }));

      expect(screen.queryByRole("region", { name: /selected rows/i })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^saved for review$/i })).toHaveLength(1);
    });

    it("starring a candidate saves it for review without adding it to the export", async () => {
      listOf(talent(2));
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);

      await user.click(screen.getAllByRole("button", { name: /save for review/i })[0]);

      expect(screen.queryByRole("button", { name: /export cvs/i })).not.toBeInTheDocument();
    });
  });

  describe("View CV opens the Standardised CV; the Original is one item away", () => {
    const talent = (withCv: boolean) => [{
      _id: "cand-1",
      userId: { _id: "user-1", name: "Amina Noor", email: "amina@example.com" },
      skills: ["React"],
      currentLocation: "Dubai",
      totalExperienceYears: 3,
      availabilityStatus: "immediately",
      profileCompleteness: 80,
      experience: [],
      ...(withCv ? { cv: { originalUrl: "https://example.com/cv.pdf" } } : {}),
    }];
    const listOf = (candidates: unknown[]) => useCandidatesMock.mockReturnValue({
      data: { candidates, total: candidates.length },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });
    async function openRowMenu() {
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);
      await user.click(screen.getByRole("button", { name: /more actions for amina noor/i }));
      return user;
    }

    it("opens the viewer on the candidate CV route, the one URL that has a Standardised CV", async () => {
      listOf(talent(true));
      const user = await openRowMenu();

      await user.click(await screen.findByRole("menuitem", { name: /^view cv$/i }));

      const url = (resumeViewerMock.mock.calls.at(-1)?.[0] as { url: string }).url;
      expect(url).toBe("/api/employers/candidates/cand-1/cv#cv.pdf");
      expect(url).toMatch(/^\/api\/employers\/candidates\/[^/]+\/cv(?:[?#]|$)/);
    });

    it("offers Original CV (Uploaded) as a second menu item that opens the file in a tab", async () => {
      listOf(talent(true));
      await openRowMenu();

      const item = await screen.findByRole("menuitem", { name: /original cv \(uploaded\)/i });
      // Opening the file to keep is a download, so it is flagged (the viewer's preview is not).
      expect(item).toHaveAttribute("href", "/api/employers/candidates/cand-1/cv?download=1#cv.pdf");
      expect(item).toHaveAttribute("target", "_blank");
      expect(item.getAttribute("rel")).toContain("noopener");
      // It is a link to the file, not the Standardised viewer.
      expect(resumeViewerMock).not.toHaveBeenCalled();
    });

    it("a profile-only candidate (no file, enough profile for a Standardised CV) opens the viewer on the candidate URL, never the not-available toast", async () => {
      listOf([{ ...talent(false)[0], canBuildCv: true }]);
      const user = await openRowMenu();

      await user.click(await screen.findByRole("menuitem", { name: /^view cv$/i }));

      expect(toastErrorMock).not.toHaveBeenCalled();
      const url = (resumeViewerMock.mock.calls.at(-1)?.[0] as { url: string }).url;
      expect(url).toBe("/api/employers/candidates/cand-1/cv#cv.pdf");
      // No file to open in a tab: only the Standardised CV exists.
      expect(screen.queryByRole("menuitem", { name: /original cv/i })).not.toBeInTheDocument();
    });

    it("a profile-only candidate gets View CV in the details panel too", async () => {
      listOf([{ ...talent(false)[0], canBuildCv: true }]);
      const user = userEvent.setup();
      render(<EmployerCandidatesPage />);

      await user.click(screen.getByRole("button", { name: /open details for/i }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /^view cv$/i }));

      expect(toastErrorMock).not.toHaveBeenCalled();
      expect((resumeViewerMock.mock.calls.at(-1)?.[0] as { url: string }).url).toBe("/api/employers/candidates/cand-1/cv#cv.pdf");
    });

    it("offers neither when the candidate has no CV", async () => {
      listOf(talent(false));
      await openRowMenu();

      expect(await screen.findByRole("menuitem", { name: /open profile/i })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /view cv/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /original cv/i })).not.toBeInTheDocument();
    });

    describe("only where the CV route would serve the candidate (cvAccessible)", () => {
      const sourcedOnly = () => [{ ...talent(false)[0], canBuildCv: true, cvAccessible: false }];

      it("a sourced-only candidate (no application, in no talent pool) has no View CV in the row menu", async () => {
        listOf(sourcedOnly());
        await openRowMenu();

        expect(await screen.findByRole("menuitem", { name: /open profile/i })).toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: /view cv/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: /original cv/i })).not.toBeInTheDocument();
      });

      it("nor in the details panel", async () => {
        listOf(sourcedOnly());
        const user = userEvent.setup();
        render(<EmployerCandidatesPage />);

        await user.click(screen.getByRole("button", { name: /open details for/i }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).queryByRole("button", { name: /^view cv$/i })).not.toBeInTheDocument();
      });

      it("a profile-only candidate already saved to a pool (cvAccessible true) has View CV", async () => {
        listOf([{ ...talent(false)[0], canBuildCv: true, cvAccessible: true }]);
        const user = await openRowMenu();

        await user.click(await screen.findByRole("menuitem", { name: /^view cv$/i }));

        expect((resumeViewerMock.mock.calls.at(-1)?.[0] as { url: string }).url).toBe("/api/employers/candidates/cand-1/cv#cv.pdf");
      });

      it("accessible but nothing to show (no file, nothing to build from): no View CV", async () => {
        listOf([{ ...talent(false)[0], canBuildCv: false, cvAccessible: true }]);
        await openRowMenu();

        expect(await screen.findByRole("menuitem", { name: /open profile/i })).toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: /view cv/i })).not.toBeInTheDocument();
      });

      it("saving the candidate to a pool in this visit gives them View CV without a reload", async () => {
        listOf(sourcedOnly());
        const user = await openRowMenu();
        expect(screen.queryByRole("menuitem", { name: /view cv/i })).not.toBeInTheDocument();

        await user.click(await screen.findByRole("menuitem", { name: /save to talent pool|save to pool/i }));
        await user.click(await screen.findByRole("button", { name: "Mock save" }));
        await user.click(screen.getByRole("button", { name: /more actions for amina noor/i }));

        expect(await screen.findByRole("menuitem", { name: /^view cv$/i })).toBeInTheDocument();
      });

      it("a colleague who only reviews applicants has no View CV on a talent row, whatever the server said", async () => {
        sessionUser = { id: "u2", role: "employer", companyOwnerUserId: "u1", companyPermissions: { canReviewApplicants: true, canManageTalentPools: false } };
        listOf([{ ...talent(false)[0], canBuildCv: true, cvAccessible: true }]);
        await openRowMenu();

        expect(await screen.findByRole("menuitem", { name: /open profile/i })).toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: /view cv/i })).not.toBeInTheDocument();
      });

      it("a colleague who also manages talent pools keeps View CV", async () => {
        sessionUser = { id: "u2", role: "employer", companyOwnerUserId: "u1", companyPermissions: { canReviewApplicants: true, canManageTalentPools: true } };
        listOf([{ ...talent(false)[0], canBuildCv: true, cvAccessible: true }]);
        await openRowMenu();

        expect(await screen.findByRole("menuitem", { name: /^view cv$/i })).toBeInTheDocument();
      });
    });
  });
});
