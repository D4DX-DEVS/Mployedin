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

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ locale: "en" }),
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

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => null,
}));

jest.mock("@/components/shared/ResumeViewerModal", () => ({
  ResumeViewerModal: () => null,
}));

describe("EmployerCandidatesPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
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

    await user.type(screen.getByPlaceholderText("Search candidates, skills, role, or company"), "React");

    await waitFor(() => expect(useCandidatesMock).toHaveBeenLastCalledWith(expect.objectContaining({
      search: "React",
      jobId: undefined,
    })));
  });

  it("keeps advanced filters collapsed until the recruiter opens them", async () => {
    const user = userEvent.setup();

    render(<EmployerCandidatesPage />);

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
  });

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
    expect(screen.getByLabelText("Compare against job")).toHaveValue("job-frontend");

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

    expect(screen.getByRole("button", { name: /view details/i })).toBeInTheDocument();
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

    await user.selectOptions(screen.getByLabelText("Compare against job"), "job-frontend");
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

    await waitFor(() => expect(screen.getByText("Scored 1 candidate(s). 1 candidate(s) could not be scored.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /run ai match/i })).toBeEnabled();
    expect(screen.getByText("91% AI match")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /view details/i }));

    const dialog = await screen.findByRole("dialog");

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Strong frontend fit with strong delivery evidence.")).toBeInTheDocument();
    expect(within(dialog).getByText("Score breakdown")).toBeInTheDocument();
    expect(within(dialog).getByText("No recent Next.js project listed")).toBeInTheDocument();
  });
});