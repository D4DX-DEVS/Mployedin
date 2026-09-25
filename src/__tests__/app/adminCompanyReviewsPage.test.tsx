/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminCompanyReviewsPage from "@/app/[locale]/(dashboard)/admin/cms/company-reviews/page";

const confirmMock = jest.fn();
const toastSuccess = jest.fn();
const toastError = jest.fn();
const updateTotal = jest.fn();
const resetPage = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// URL state as plain component state: the page's behaviour, not the router, is under test.
jest.mock("@/hooks/useUrlFilter", () => ({
  useUrlFilter: (_key: string, fallback: string) => React.useState(fallback),
}));

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => ({ page: 1, limit: 10, total: 1, totalPages: 1, setPage: jest.fn(), setLimit: jest.fn(), updateTotal, resetPage }),
}));

jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: (options: unknown) => confirmMock(options), ConfirmDialogNode: null }),
}));

jest.mock("@/components/shared/PaginationControls", () => ({ PaginationControls: () => null }));
jest.mock("sonner", () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) } }));

const review = {
  _id: "rev-1",
  employerId: { _id: "emp-1", companyName: "Acme Logistics" },
  userId: { _id: "user-1", name: "Ali Hassan", email: "ali@example.com" },
  rating: 4,
  title: "Supportive managers",
  pros: "Clear goals",
  cons: "Long shifts",
  employmentStatus: "current",
  isAnonymous: true,
  status: "pending",
  createdAt: "2026-09-20T10:00:00.000Z",
};

describe("AdminCompanyReviewsPage", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function listResponse(items: unknown[]) {
    return { ok: true, json: async () => ({ items, pagination: { page: 1, limit: 10, total: items.length, pages: 1 } }) };
  }

  it("lists pending reviews with company, rating, pros, cons and author", async () => {
    fetchMock.mockResolvedValueOnce(listResponse([review]));
    render(<AdminCompanyReviewsPage />);

    const card = (await screen.findByText("Supportive managers")).closest("li")!;
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/company-reviews?page=1&limit=10&status=pending");
    expect(within(card).getByRole("link", { name: "Acme Logistics" })).toHaveAttribute("href", "/en/companies/emp-1");
    expect(within(card).getByLabelText("Rated 4 out of 5")).toBeInTheDocument();
    expect(within(card).getByText("Long shifts")).toBeInTheDocument();
    expect(within(card).getByText(/By Ali Hassan \(ali@example.com\).*Current employee.*Shown as anonymous/)).toBeInTheDocument();
    // A pending review can be approved or rejected, not unpublished.
    expect(within(card).getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /unpublish/i })).not.toBeInTheDocument();
  });

  it("publishes after confirmation and reloads the list", async () => {
    confirmMock.mockResolvedValue(true);
    fetchMock
      .mockResolvedValueOnce(listResponse([review]))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ item: { _id: "rev-1", status: "approved" } }) })
      .mockResolvedValueOnce(listResponse([]));
    render(<AdminCompanyReviewsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /approve/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Review published."));
    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Publish this review?" }));
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/admin/company-reviews/rev-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "approved" }) }),
    ]);
    expect(await screen.findByText("No reviews are waiting for moderation.")).toBeInTheDocument();
  });

  it("does nothing when the admin cancels", async () => {
    confirmMock.mockResolvedValue(false);
    fetchMock.mockResolvedValueOnce(listResponse([review]));
    render(<AdminCompanyReviewsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /^reject$/i }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows an error with a retry when the list fails to load", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) }).mockResolvedValueOnce(listResponse([review]));
    render(<AdminCompanyReviewsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("Supportive managers")).toBeInTheDocument();
  });
});
