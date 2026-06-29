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
