/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import BannersAdminPage from "@/app/[locale]/(dashboard)/admin/cms/banners/page";

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
  SearchableSelect: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => (
    <select aria-label="Status filter" value={value} onChange={(event) => onValueChange(event.target.value)}>
      <option value="all">All</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  ),
}));

describe("BannersAdminPage", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    paginationState.setPage.mockReset();
    paginationState.setLimit.mockReset();
    paginationState.updateTotal.mockReset();
    paginationState.resetPage.mockReset();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        pagination: { total: 0 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the banners page inside the shared admin workspace container and surfaces", async () => {
    const view = render(<BannersAdminPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/cms/banners?page=1&limit=10");
    });

    const workspaceRoot = view.container.querySelector('[data-admin-workspace="cms-page"]');

    expect(workspaceRoot).toHaveClass("page-container", "space-y-6", "admin-cms-page-container");
    expect(screen.getByRole("heading", { name: "Banners" }).closest("section")).toHaveClass("workspace-hero-surface");
    expect(screen.getByRole("heading", { name: /search and filter cms records/i }).closest("section")).toHaveClass("workspace-panel-surface");
    expect(screen.getByRole("heading", { name: /manage cms records with consistent spacing/i }).closest("section")).toHaveClass("workspace-panel-surface");
    expect(screen.getByRole("button", { name: /add new/i })).toBeInTheDocument();
    expect(screen.getByTestId("pagination-controls")).toBeInTheDocument();
  });
});