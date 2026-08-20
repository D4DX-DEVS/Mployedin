/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import AdminJobsPage from "@/app/[locale]/(dashboard)/admin/jobs/page";

const pushMock = jest.fn();
const confirmMock = jest.fn();

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

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/admin/jobs",
  useSearchParams: () => new URLSearchParams(),
}));

describe("AdminJobsPage", () => {
  const fetchMock = jest.fn();
  const toastErrorMock = jest.mocked(toast.error);
  const toastSuccessMock = jest.mocked(toast.success);
  const jobsPayload = {
    items: [
      {
        _id: "job-1",
        title: "Senior Recruiter",
        employerId: { companyName: "Mployedin" },
        status: "draft",
        poster: { approvalStatus: "pending" },
        approvalStatus: "pending",
        category: "Recruitment",
        location: { city: "Dubai", country: "UAE" },
        applicantsCount: 8,
        createdAt: "2026-04-10T00:00:00.000Z",
      },
    ],
    total: 1,
    totalPages: 1,
  };

  beforeEach(() => {
    pushMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockReturnValue(true);
    global.confirm = confirmMock as typeof global.confirm;
    paginationState.setPage.mockReset();
    paginationState.setLimit.mockReset();
    paginationState.updateTotal.mockReset();
    paginationState.resetPage.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.startsWith("/api/employers")) {
        return {
          ok: true,
          json: async () => ({ employers: [] }),
        } as Response;
      }

      if (url.startsWith("/api/admin/agents")) {
        return {
          ok: true,
          json: async () => ({ agents: [] }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => jobsPayload,
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the modern admin jobs workspace with fetched results", async () => {
    const user = userEvent.setup();

    render(<AdminJobsPage />);

    expect(screen.getByText(/recruitment control/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /job listings/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filter/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Senior Recruiter")).toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText("Filter by location")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show filters/i }));
    await user.click(screen.getByRole("button", { name: /advanced filters/i }));

    expect(screen.getByPlaceholderText("Filter by location")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Skills, comma separated")).toBeInTheDocument();
    expect(paginationState.updateTotal).toHaveBeenCalledWith(1);
  });

  it("navigates to admin applications in the same tab", async () => {
    const user = userEvent.setup();
    render(<AdminJobsPage />);

    await waitFor(() => {
      expect(screen.getByText("Senior Recruiter")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /applications/i }));

    expect(pushMock).toHaveBeenCalledWith("/en/admin/applications?jobId=job-1");
  });

  it("navigates to the admin edit route in the same tab", async () => {
    const user = userEvent.setup();
    render(<AdminJobsPage />);

    await waitFor(() => {
      expect(screen.getByText("Senior Recruiter")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(pushMock).toHaveBeenCalledWith("/en/admin/jobs/job-1/edit");
  });

  it("deletes jobs through the shared jobs endpoint", async () => {
    const user = userEvent.setup();
    render(<AdminJobsPage />);

    await waitFor(() => {
      expect(screen.getByText("Senior Recruiter")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(confirmMock).toHaveBeenCalledWith("Are you sure you want to delete this job?");
    expect(fetchMock).toHaveBeenCalledWith("/api/jobs/job-1", { method: "DELETE" });
  });

  it("shows an error banner when the jobs request fails", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.startsWith("/api/employers") || url.startsWith("/api/admin/agents")) {
        return {
          ok: true,
          json: async () => ({ items: [] }),
        } as Response;
      }

      return { ok: false } as Response;
    });

    render(<AdminJobsPage />);

    await waitFor(() => {
      expect(screen.getByText(/we couldn't load jobs\. please try again\./i)).toBeInTheDocument();
    });

    expect(toastErrorMock).toHaveBeenCalledWith("We couldn't load jobs. Please try again.");
  });
});
