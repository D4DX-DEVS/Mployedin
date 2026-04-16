/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import AdminCommissionsPage from "@/app/[locale]/(dashboard)/admin/commissions/page";

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

jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    can: () => true,
  }),
}));

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => paginationState,
}));

jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({
    confirm: jest.fn().mockResolvedValue(false),
    ConfirmDialogNode: null,
  }),
}));

jest.mock("@/components/shared/CrudModal", () => ({
  CrudModal: () => null,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({
    id,
    value,
    onValueChange,
    options,
  }: {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select id={id} aria-label="Status filter" value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe("AdminCommissionsPage", () => {
  const fetchMock = jest.fn();
  const toastErrorMock = jest.mocked(toast.error);
  const toastSuccessMock = jest.mocked(toast.success);

  beforeEach(() => {
    paginationState.setPage.mockReset();
    paginationState.setLimit.mockReset();
    paginationState.updateTotal.mockReset();
    paginationState.resetPage.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            _id: "commission-1",
            agentId: { fullName: "Sahar Ali" },
            amount: 12500,
            currency: "AED",
            status: "pending",
            type: "placement",
            rate: 12,
            createdAt: "2026-04-10T00:00:00.000Z",
          },
        ],
        total: 1,
        totalPages: 1,
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the modern commissions workspace shell and fetched results", async () => {
    await act(async () => {
      render(<AdminCommissionsPage />);
    });

    expect(screen.getByText(/finance workspace/i, { selector: "div.workspace-glass-panel" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Commissions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add commission/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/commissions?page=1&limit=10");
    });

    await screen.findByText("Sahar Ali");

    expect(screen.getByText("Sahar Ali")).toBeInTheDocument();
    expect(screen.getByText("AED 12,500")).toBeInTheDocument();
    expect(screen.getByText(/12% rate/i)).toBeInTheDocument();
    expect(screen.getByTestId("pagination-controls")).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1, name: "Commissions" }).closest("section")).toHaveClass("workspace-hero-surface");
    expect(screen.getByRole("heading", { name: /filter the commissions you want to review next/i }).closest("section")).toHaveClass("workspace-panel-surface");
    expect(screen.getByRole("heading", { name: /review and action agent payouts/i }).closest("section")).toHaveClass("workspace-panel-surface");
    expect(paginationState.updateTotal).toHaveBeenCalledWith(1);
  });

  it("shows an error banner when the commissions request fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
    });

    await act(async () => {
      render(<AdminCommissionsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/failed to load commissions\. please try again\./i)).toBeInTheDocument();
    });

    expect(toastErrorMock).toHaveBeenCalledWith("Failed to load commissions. Please try again.");
  });
});