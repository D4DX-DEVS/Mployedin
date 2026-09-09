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
jest.mock("@/hooks/useJobSeekerActionCounts", () => {
  const data = { pendingOffers: 0, interviewsAwaitingResponse: 1, upcomingInterviews: 1, totalApplications: 9, activeApplications: 3 };
  return { useJobSeekerActionCountsQuery: () => ({ data, isError: false }), useJobSeekerActionCounts: () => data };
});

describe("InterviewsPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ interviews: [], total: 0, counts: { upcoming: 1, past: 8 } }),
    });
    global.fetch = fetchMock as typeof fetch;
  });

  it("asks the API for journey counts and shows them, inside the shared shell", async () => {
    render(<InterviewsPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/interviews?page=1&limit=10&fetchCounts=true");
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
      expect(fetchMock).toHaveBeenCalledWith("/api/interviews?page=1&limit=10&status=confirmed&fetchCounts=true");
    });
    expect(screen.getByText("1 upcoming · 8 past")).toBeInTheDocument();
  });
});
