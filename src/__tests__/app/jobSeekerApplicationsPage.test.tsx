/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ApplicationsPage from "@/app/[locale]/(dashboard)/job-seeker/applications/page";

const fetchMock = jest.fn();
const pushMock = jest.fn();
const resetPageMock = jest.fn();
const updateTotalMock = jest.fn();
const setPageMock = jest.fn();
const setLimitMock = jest.fn();
const paginationParamsMock = jest.fn(() => new URLSearchParams({ page: "1", limit: "10" }));
const countsQueryMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: pushMock }),
  // The page seeds its search box from `?search=` so the ⌘K palette can deep
  // link into a filtered list.
  useSearchParams: () => new URLSearchParams(),
  // The application-journey nav marks the current stage active.
  usePathname: () => "/en/job-seeker/applications",
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// The journey shell reads the account-wide counters; the page must never
// derive a header number from the list it fetched.
jest.mock("@/hooks/useJobSeekerActionCounts", () => {
  const data = { pendingOffers: 1, interviewsAwaitingResponse: 2, upcomingInterviews: 0, totalApplications: 27, activeApplications: 8 };
  return {
    // Controllable per test so the `data`/`isError` combinations the page
    // derives its context line from can each be exercised on their own.
    useJobSeekerActionCountsQuery: () => countsQueryMock(),
    useJobSeekerActionCounts: () => data,
  };
});

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    span: ({ children, layoutId, transition, ...props }: React.HTMLAttributes<HTMLSpanElement> & {
      layoutId?: string;
      transition?: unknown;
    }) => <span {...props}>{children}</span>,
    div: ({ children, initial, animate, exit, transition, ...props }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => ({
    page: 1,
    limit: 10,
    total: 2,
    totalPages: 1,
    setPage: setPageMock,
    setLimit: setLimitMock,
    resetPage: resetPageMock,
    updateTotal: updateTotalMock,
    paginationParams: paginationParamsMock,
  }),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => {
    if (asChild) {
      return <>{children}</>;
    }

    return <button {...props}>{children}</button>;
  },
}));

jest.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ options, value, onValueChange }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

jest.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

describe("ApplicationsPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pushMock.mockReset();
    resetPageMock.mockReset();
    updateTotalMock.mockReset();
    setPageMock.mockReset();
    setLimitMock.mockReset();
    paginationParamsMock.mockClear();
    countsQueryMock.mockReset();

    countsQueryMock.mockReturnValue({
      data: { pendingOffers: 1, interviewsAwaitingResponse: 2, upcomingInterviews: 0, totalApplications: 27, activeApplications: 8 },
      isError: false,
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        applications: [
          {
            _id: "app-1",
            jobId: {
              _id: "job-1",
              title: "Senior Full Stack Developer",
              location: { city: "Kochi", country: "India" },
              salary: { min: 600000, max: 1200000, currency: "INR" },
            },
            status: "selected",
            aiMatchScore: 35,
            appliedAt: "2026-04-08T00:00:00.000Z",
            statusHistory: [
              { status: "applied", changedAt: "2026-04-08T00:00:00.000Z" },
              { status: "selected", changedAt: "2026-04-10T00:00:00.000Z", note: "Status updated to selected" },
            ],
          },
        ],
        pagination: { total: 2 },
      }),
    });

    global.fetch = fetchMock as typeof fetch;
  });

  it("animates the active filter control while preserving filtered fetch behavior", async () => {
    const user = userEvent.setup();

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&fetchCounts=true");
    });

    await user.click(screen.getByRole("tab", { name: "Selected" }));

    expect(resetPageMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&status=selected&fetchCounts=true");
    });

    expect(screen.getByRole("tab", { name: "Selected" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps cards compact by default and expands details on demand", async () => {
    const user = userEvent.setup();

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /senior full stack developer/i })).toBeInTheDocument();
    });

    // Client report 2026-09-30: clicking an application must open its detail
    // page (it existed but nothing linked to it).
    const detailLink = screen.getByRole("link", { name: /view details for senior full stack developer/i });
    expect(detailLink).toHaveAttribute("href", "/en/job-seeker/applications/app-1");

    const detailToggle = screen.getByRole("button", { name: /show summary for senior full stack developer/i });

    expect(detailToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { name: /my applications/i })).toBeInTheDocument();
    expect(screen.getByText("35% match")).toBeInTheDocument();
    expect(screen.getByText(/Kochi, India/i)).toBeInTheDocument();
    expect(screen.getByText(/Applied [A-Z][a-z]{2} \d{1,2}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeInTheDocument();
    expect(screen.queryByText("Status updated to selected")).not.toBeInTheDocument();

    await user.click(detailToggle);

    await waitFor(() => {
      expect(detailToggle).toHaveAttribute("aria-expanded", "true");
    });
    expect(screen.getByText("Status updated to selected")).toBeInTheDocument();
  });

  it("still links a plain application with nothing to summarise, and offers no empty toggle", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        applications: [
          {
            _id: "app-2",
            jobId: { _id: "job-2", title: "Accountant" },
            status: "applied",
            appliedAt: "2026-09-29T00:00:00.000Z",
            statusHistory: [],
          },
        ],
        pagination: { total: 1 },
      }),
    });

    render(<ApplicationsPage />);

    const link = await screen.findByRole("link", { name: /view details for accountant/i });
    expect(link).toHaveAttribute("href", "/en/job-seeker/applications/app-2");
    expect(screen.queryByRole("button", { name: /summary for accountant/i })).not.toBeInTheDocument();
  });

  it("wears the journey shell: shared title, truthful context, journey row, no page-level numbers", async () => {
    render(<ApplicationsPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&fetchCounts=true");
    });

    expect(screen.getByRole("heading", { level: 1, name: "My Applications" })).toBeInTheDocument();
    expect(screen.getByText("27 applications · 8 active")).toBeInTheDocument();

    const journey = screen.getByRole("navigation", { name: "Application journey" });
    const links = within(journey).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(within(journey).getByText("2")).toBeInTheDocument(); // interviews badge
    expect(within(journey).getByText("1")).toBeInTheDocument(); // offers badge

    expect(screen.queryByText(/Progress:/)).toBeNull();
    expect(screen.queryByText(/View:/)).toBeNull();
    expect(screen.queryByText(/Total:/)).toBeNull();
    expect(screen.queryByText(/Active:/)).toBeNull();

    expect(screen.getByRole("tablist", { name: "Application status filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
  });

  it("renders the context line once counts have loaded", async () => {
    render(<ApplicationsPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&fetchCounts=true");
    });

    expect(screen.getByText("27 applications · 8 active")).toBeInTheDocument();
  });

  it("renders no context line when counts failed to load, but still renders the list", async () => {
    countsQueryMock.mockReturnValue({ data: undefined, isError: true });

    render(<ApplicationsPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&fetchCounts=true");
    });

    expect(screen.queryByTestId("journey-context-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByText(/applications? · \d+ active/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /senior full stack developer/i })).toBeInTheDocument();
  });

  it("shows the loading skeleton, not a line of text, while counts are still loading", async () => {
    countsQueryMock.mockReturnValue({ data: undefined, isError: false });

    render(<ApplicationsPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&fetchCounts=true");
    });

    expect(screen.getByTestId("journey-context-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/applications? · \d+ active/i)).not.toBeInTheDocument();
  });

  // QA 2026-10-01: a withdrawn application counted under All but had no tab of
  // its own, so a search could read "All 1" beside a row of zeros.
  it("gives withdrawn applications their own tab with a count", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        applications: [],
        statusCounts: { all: 1, applied: 0, shortlisted: 0, interview_scheduled: 0, selected: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 1 },
        pagination: { total: 1 },
      }),
    });

    render(<ApplicationsPage />);

    const tab = await screen.findByRole("tab", { name: /^withdrawn/i });
    await waitFor(() => expect(within(tab).getByText("1")).toBeInTheDocument());

    await user.click(tab);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&status=withdrawn&fetchCounts=true");
    });
  });

  // QA 2026-10-01: a search with no hits told a seeker holding 31 applications
  // "You have not applied to any roles yet".
  it("says a search found nothing, not that the seeker never applied, and offers to clear it", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ applications: [], statusCounts: { all: 0 }, pagination: { total: 0 } }),
    });

    render(<ApplicationsPage />);

    // Unfiltered and empty: the seeker really has nothing yet.
    expect(await screen.findByText(/you have not applied to any roles yet/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search by job title or company/i), "devops");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&search=devops&fetchCounts=true");
    });

    expect(await screen.findByText("No matching applications")).toBeInTheDocument();
    expect(screen.queryByText(/you have not applied to any roles yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /browse jobs/i })).not.toBeInTheDocument();

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&fetchCounts=true");
    });
    expect(screen.getByPlaceholderText(/search by job title or company/i)).toHaveValue("");
  });

  it("keeps the context line when counts are present but a background refetch failed", async () => {
    countsQueryMock.mockReturnValue({
      data: { pendingOffers: 1, interviewsAwaitingResponse: 2, upcomingInterviews: 0, totalApplications: 27, activeApplications: 8 },
      isError: true,
    });

    render(<ApplicationsPage />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&fetchCounts=true");
    });

    expect(screen.getByText("27 applications · 8 active")).toBeInTheDocument();
  });
});