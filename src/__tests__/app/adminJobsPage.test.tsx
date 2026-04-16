/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import AdminJobsPage from "@/app/[locale]/(dashboard)/admin/jobs/page";

const paginationState = {
  page: 1,
  limit: 10,
  total: 12,
  totalPages: 2,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
};

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => paginationState,
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("AdminJobsPage", () => {
  const fetchMock = jest.fn();
  const toastErrorMock = jest.mocked(toast.error);

  beforeEach(() => {
    paginationState.setPage.mockReset();
    paginationState.setLimit.mockReset();
    paginationState.updateTotal.mockReset();
    paginationState.resetPage.mockReset();
    toastErrorMock.mockReset();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the modern admin jobs workspace with fetched results", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            _id: "job-1",
            title: "Senior Recruiter",
            employerId: { companyName: "Mployedin" },
            status: "active",
            approvalStatus: "approved",
            category: "Recruitment",
            location: { city: "Dubai", country: "UAE" },
            applicantsCount: 8,
            createdAt: "2026-04-10T00:00:00.000Z",
          },
        ],
        total: 1,
        totalPages: 1,
      }),
    });

    render(<AdminJobsPage />);

    expect(screen.getByText(/recruitment control/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /platform jobs/i })).toBeInTheDocument();
    expect(screen.getByText("All statuses")).toBeInTheDocument();
    expect(screen.getByText("All approvals")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Senior Recruiter")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: /filter the jobs you want to review next/i })).toBeInTheDocument();
    expect(paginationState.updateTotal).toHaveBeenCalledWith(1);
  });

  it("shows an error banner when the jobs request fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
    });

    render(<AdminJobsPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load jobs\. please try again\./i)).toBeInTheDocument();
    });

    expect(toastErrorMock).toHaveBeenCalledWith("Failed to load jobs. Please try again.");
  });
});