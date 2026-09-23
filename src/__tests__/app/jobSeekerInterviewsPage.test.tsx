/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InterviewsPage from "@/app/[locale]/(dashboard)/job-seeker/interviews/page";

const fetchMock = jest.fn();
const paginationParamsMock = jest.fn(() => new URLSearchParams({ page: "1", limit: "10" }));

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/en/job-seeker/interviews",
  // PaginationControls (mounted as the shell's footer whenever view === "list")
  // reads the locale segment via useParams; without this the real component
  // throws on render. Same fix as the sibling jobSeekerApplicationsPage.test.tsx.
  useParams: () => ({ locale: "en" }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
jest.mock("next/dynamic", () => () => function CalendarStub() { return <div data-testid="calendar" />; });
jest.mock("framer-motion", () => ({
  motion: {
    span: ({ children, layoutId: _l, transition: _t, ...props }: React.HTMLAttributes<HTMLSpanElement> & Record<string, unknown>) => <span {...props}>{children}</span>,
  },
}));
jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => ({
    page: 1, limit: 10, total: 0, totalPages: 0,
    setPage: jest.fn(), setLimit: jest.fn(), resetPage: jest.fn(), updateTotal: jest.fn(),
    paginationParams: paginationParamsMock,
  }),
}));
jest.mock("@/hooks/useTableExport", () => ({
  useTableExport: () => ({ handleExportCsv: jest.fn(), handleExportExcel: jest.fn(), handleExportPdf: jest.fn() }),
}));
const toastErrorMock = jest.fn();
const toastSuccessMock = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));
jest.mock("@/hooks/useJobSeekerActionCounts", () => {
  const data = { pendingOffers: 0, interviewsAwaitingResponse: 1, upcomingInterviews: 1, totalApplications: 9, activeApplications: 3 };
  return { useJobSeekerActionCountsQuery: () => ({ data, isError: false }), useJobSeekerActionCounts: () => data };
});

describe("InterviewsPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ interviews: [], total: 0, counts: { upcoming: 1, past: 8 } }),
    });
    global.fetch = fetchMock as typeof fetch;
  });

  it("asks the API for journey counts and shows them, inside the shared shell", async () => {
    render(<InterviewsPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/interviews?page=1&limit=10&sortOrder=desc&fetchCounts=true");
    });
    expect(screen.getByRole("heading", { level: 1, name: "My Applications" })).toBeInTheDocument();
    expect(await screen.findByText("1 upcoming · 8 past")).toBeInTheDocument();

    const journey = screen.getByRole("navigation", { name: "Application journey" });
    expect(within(journey).getByRole("link", { name: /Interviews, 1 needs your attention/ })).toHaveAttribute("aria-current", "page");

    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("tablist", { name: "Interview status filters" })).toBeInTheDocument();
    expect(screen.getByText("No interviews scheduled")).toBeInTheDocument();
  });

  it("keeps the last known counts when a filtered response has none", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ interviews: [], total: 0, counts: { upcoming: 1, past: 8 } }) })
      .mockResolvedValue({ ok: true, json: async () => ({ interviews: [], total: 0 }) });
    render(<InterviewsPage />);
    expect(await screen.findByText("1 upcoming · 8 past")).toBeInTheDocument();

    // A status chip refetches with ?status=…; a "no match" search response
    // carries no counts and must not blank the header.
    await userEvent.click(screen.getByRole("tab", { name: "Confirmed" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/interviews?page=1&limit=10&status=confirmed&sortOrder=desc&fetchCounts=true");
    });
    expect(screen.getByText("1 upcoming · 8 past")).toBeInTheDocument();
  });

  function upcomingInterview() {
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    return {
      _id: "iv-1",
      applicationId: "app-1",
      jobTitle: "Backend Engineer",
      companyName: "Acme",
      type: "video",
      status: "scheduled",
      scheduledAt,
      duration: 45,
      candidateResponse: "pending",
    };
  }

  it("tells the seeker when a response could not be saved", async () => {
    // First call loads the list, the POST is the response the server rejects.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: false, json: async () => ({ error: "nope" }) };
      return { ok: true, json: async () => ({ interviews: [upcomingInterview()], total: 1, counts: { upcoming: 1, past: 0 } }) };
    });

    render(<InterviewsPage />);
    const confirm = await screen.findByRole("button", { name: "Confirm" });
    await userEvent.click(confirm);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("We couldn't save your response. Please try again.");
    });
    // The silent version re-enabled the button and moved nothing, so the seeker
    // had no way to tell the interview was never confirmed.
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  // The API used to be read oldest-first, so a seeker with ten past interviews
  // found "1 upcoming" in the header and nothing but "Past" on page 1.
  it("puts upcoming interviews first, soonest first, ahead of past ones", async () => {
    const at = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const row = (id: string, jobTitle: string, hours: number) => ({
      ...upcomingInterview(), _id: id, jobTitle, scheduledAt: at(hours), candidateResponse: "accepted",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      // Newest first, as requested with sortOrder=desc.
      json: async () => ({
        interviews: [row("a", "Later Role", 72), row("b", "Sooner Role", 24), row("c", "Old Role", -240)],
        total: 3,
        counts: { upcoming: 2, past: 1 },
      }),
    });
    render(<InterviewsPage />);
    await screen.findByText("Later Role");
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Sooner Role", "Later Role", "Old Role"]);
  });

  it("marks a cancelled interview and drops its meeting link", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        interviews: [{ ...upcomingInterview(), status: "cancelled", meetLink: "https://meet.example/abc" }],
        total: 1,
        counts: { upcoming: 0, past: 1 },
      }),
    });
    render(<InterviewsPage />);
    await screen.findByText("Backend Engineer");
    const badges = screen.getAllByText("Cancelled").filter((el) => !el.closest('[role="tab"]'));
    expect(badges).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Meeting Link/ })).toBeNull();
  });

  it("confirms the response when the server accepts it", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, json: async () => ({ ok: true }) };
      return { ok: true, json: async () => ({ interviews: [upcomingInterview()], total: 1, counts: { upcoming: 1, past: 0 } }) };
    });

    render(<InterviewsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Your response has been sent.");
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
