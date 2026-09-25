/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminApplicationsPage from "@/app/[locale]/(dashboard)/admin/applications/page";

const replaceMock = jest.fn();
const searchParamsState = new URLSearchParams("jobId=job-1");
const paginationState = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
};

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => paginationState,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: replaceMock }),
  usePathname: () => "/en/admin/applications",
  useSearchParams: () => searchParamsState,
  useParams: () => ({ locale: "en" }),
}));

describe("AdminApplicationsPage", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    replaceMock.mockReset();
    paginationState.setPage.mockReset();
    paginationState.setLimit.mockReset();
    paginationState.updateTotal.mockReset();
    paginationState.resetPage.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        applications: [],
        pagination: { total: 0, pages: 0 },
        allEmployers: [],
        stats: {
          byStatus: {},
          bySource: {},
          avgAiScore: 0,
          scoredCount: 0,
          todayCount: 0,
          weekCount: 0,
          totalAll: 0,
        },
      }),
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("includes the URL jobId filter in the applications request", async () => {
    render(<AdminApplicationsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/applications?");
    expect(url).toContain("jobId=job-1");
    expect(screen.getByText("Selected job only")).toBeInTheDocument();
  });

  it("runs Ask AI from the one search box and lists what it applied", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/ai/application-search-filters") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ filters: { status: "rejected", employer: "d4dx", skills: ["React"] }, degraded: false }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          applications: [],
          pagination: { total: 0, pages: 0 },
          allEmployers: [{ _id: "emp-1", companyName: "D4DX Labs" }],
          stats: { byStatus: {}, bySource: {}, avgAiScore: 0, scoredCount: 0, todayCount: 0, weekCount: 0, totalAll: 0 },
        }),
      } as Response;
    });
    const user = userEvent.setup();
    render(<AdminApplicationsPage />);

    // Filters are always visible now — no Show filters toggle to open first.
    await screen.findByRole("textbox", { name: /search/i });
    // One box only: the separate AI search row is gone.
    expect(screen.queryByPlaceholderText(/AI search: e\.g\./i)).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await user.type(screen.getByRole("textbox", { name: /search/i }), "rejected react people at d4dx");
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    await waitFor(() => {
      const listCalls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/applications?"));
      const last = listCalls[listCalls.length - 1];
      expect(last).toContain("status=rejected");
      expect(last).toContain("employerId=emp-1");
      expect(last).toContain("skills=React");
    });
    const line = screen.getByRole("status");
    expect(line).toHaveTextContent("D4DX Labs");
    expect(line).toHaveTextContent("React");
  });

  it("clears the URL job filter when filters are reset", async () => {
    const user = userEvent.setup();
    render(<AdminApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(replaceMock).toHaveBeenCalledWith("/en/admin/applications");
    expect(paginationState.resetPage).toHaveBeenCalled();
  });
});
