/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";

import OffersPage from "@/app/[locale]/(dashboard)/job-seeker/offers/page";

const fetchMock = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/job-seeker/offers",
  // PaginationControls (mounted as the shell's footer) reads the locale
  // segment via useParams; without this the real component throws on render.
  // Same fix as the sibling jobSeekerApplicationsPage.test.tsx / jobSeekerInterviewsPage.test.tsx.
  useParams: () => ({ locale: "en" }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
jest.mock("framer-motion", () => ({
  motion: {
    span: ({ children, layoutId: _l, transition: _t, ...props }: React.HTMLAttributes<HTMLSpanElement> & Record<string, unknown>) => <span {...props}>{children}</span>,
  },
}));
// The identities have to be stable: fetchOffers lists paginationParams and
// updateTotal in its dependency array, so fresh closures on every render
// re-fire the effect forever and the page never leaves its loading skeleton.
jest.mock("@/hooks/usePagination", () => {
  const value = {
    page: 1, limit: 10, total: 0, totalPages: 0,
    setPage: jest.fn(), setLimit: jest.fn(), resetPage: jest.fn(), updateTotal: jest.fn(),
    paginationParams: () => new URLSearchParams({ page: "1", limit: "10" }),
  };
  return { usePagination: () => value };
});
jest.mock("@/hooks/useTableExport", () => ({
  useTableExport: () => ({ handleExportCsv: jest.fn(), handleExportExcel: jest.fn(), handleExportPdf: jest.fn() }),
}));
jest.mock("@/hooks/useJobSeekerActionCounts", () => {
  const data = { pendingOffers: 1, interviewsAwaitingResponse: 0, upcomingInterviews: 0, totalApplications: 9, activeApplications: 3 };
  return { useJobSeekerActionCountsQuery: () => ({ data, isError: false }), useJobSeekerActionCounts: () => data };
});

describe("OffersPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ offers: [], pagination: { total: 0 }, stats: { total: 2, pending: 1, accepted: 1, declined: 0 } }),
    });
    global.fetch = fetchMock as typeof fetch;
  });

  it("shows the account-wide offer stats inside the shared shell", async () => {
    render(<OffersPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/offers?page=1&limit=10"));
    expect(screen.getByRole("heading", { level: 1, name: "My Applications" })).toBeInTheDocument();
    expect(await screen.findByText("1 pending · 1 accepted")).toBeInTheDocument();
    const journey = screen.getByRole("navigation", { name: "Application journey" });
    expect(within(journey).getByRole("link", { name: /Offers, 1 needs your attention/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("tablist", { name: "Offer status filters" })).toBeInTheDocument();
    expect(screen.queryByText("Offers you have received")).toBeNull();
  });

  // An accepted offer keeps whatever expiresAt it was created with — the expiry
  // cron only touches pending offers — so rendering "Expires on" regardless of
  // status showed candidates a long-dead deadline on an offer they already took.
  it("shows the response deadline on a pending offer but not on an accepted one", async () => {
    const offer = (id: string, status: string) => ({
      _id: id,
      jobId: { _id: `job_${id}`, title: `Role ${id}`, location: "Dubai" },
      salary: { amount: 12000, currency: "AED", period: "monthly" },
      startDate: "2026-11-09T00:00:00.000Z",
      status,
      expiresAt: "2026-07-17T00:00:00.000Z",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        offers: [offer("pend", "pending"), offer("acc", "accepted")],
        pagination: { total: 2 },
        stats: { total: 2, pending: 1, accepted: 1, declined: 0 },
      }),
    });

    render(<OffersPage />);

    const cardFor = async (title: string) =>
      (await screen.findByText(title)).closest(".card-base") as HTMLElement;
    const pendingCard = await cardFor("Role pend");
    const acceptedCard = await cardFor("Role acc");
    expect(within(pendingCard).getByText(/Expires on/)).toBeInTheDocument();
    expect(within(acceptedCard).queryByText(/Expires on/)).toBeNull();
  });
});
