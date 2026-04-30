/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";

import AdminCountriesPage from "@/app/[locale]/(dashboard)/admin/location-data/countries/page";

const paginationState = {
  page: 1,
  limit: 10,
  total: 1,
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
    <select id={id} aria-label={id ?? "searchable-select"} value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

describe("AdminCountriesPage", () => {
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
        items: [
          {
            _id: "country-1",
            name: "United Arab Emirates",
            nameAr: "الإمارات العربية المتحدة",
            code: "AE",
            phoneCode: "971",
            currency: "Dirham",
            currencyCode: "AED",
            currencySymbol: "AED",
            thousandSeparator: ",",
            decimalSeparator: ".",
            sortOrder: 1,
            isActive: true,
          },
        ],
        pagination: { total: 1 },
      }),
    });

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the modern countries workspace shell and country table", async () => {
    await act(async () => {
      render(<AdminCountriesPage />);
    });

    expect(screen.getByRole("heading", { level: 1, name: "Country Details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add new/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/location-data/countries?page=1&limit=10");
    });

    expect(await screen.findByText("United Arab Emirates")).toBeInTheDocument();
    expect(screen.getByText("971")).toBeInTheDocument();
    expect(screen.getByTestId("pagination-controls")).toBeInTheDocument();
    expect(paginationState.updateTotal).toHaveBeenCalledWith(1);
  });
});