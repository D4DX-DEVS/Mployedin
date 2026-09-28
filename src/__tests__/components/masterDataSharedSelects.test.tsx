/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CountrySelect } from "@/components/ui/country-select";
import { CurrencySelect } from "@/components/ui/currency-select";
import { FormPhone } from "@/components/shared/AppForm";

const masterDataMock = jest.fn();
jest.mock("@/hooks/useMasterData", () => ({
  useMasterData: (...args: unknown[]) => masterDataMock(...args),
  masterDataLabel: (item: { name: string }) => item.name,
}));

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("shared selects fed by admin master data", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    masterDataMock.mockReset();
    masterDataMock.mockReturnValue({ options: [], items: [], isPending: false, isError: false });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("CountrySelect lists countries from /api/countries and keeps the English name as value", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ countries: [{ name: "Narnia", nameAr: "نارنيا", code: "NA", currencyCode: "NAR", currencySymbol: "N", phoneCode: "999" }] }),
    });
    const onChange = jest.fn();
    const user = userEvent.setup();
    withClient(<CountrySelect value="" onValueChange={onChange} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/countries?");
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=300");

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Narnia"));
    expect(onChange).toHaveBeenCalledWith("Narnia");
  });

  it("CountrySelect falls back to the static list without a QueryClientProvider", async () => {
    const user = userEvent.setup();
    render(<CountrySelect value="" onValueChange={jest.fn()} />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("United Arab Emirates")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CurrencySelect prefers the currencies master list and stores the code", async () => {
    masterDataMock.mockReturnValue({
      options: [{ value: "XYZ", label: "Test Coin", item: { _id: "1", name: "Test Coin", nameAr: "", slug: "xyz", sortOrder: 0, code: "XYZ", symbol: "X" } }],
      items: [],
      isPending: false,
      isError: false,
    });
    const onChange = jest.fn();
    const user = userEvent.setup();
    withClient(<CurrencySelect value="" onValueChange={onChange} ariaLabel="Currency" />);

    expect(masterDataMock).toHaveBeenCalledWith("currencies", { valueKey: "code" });
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(await screen.findByText("Test Coin"));
    expect(onChange).toHaveBeenCalledWith("XYZ");
  });

  it("CurrencySelect shows the static currencies when the master list is empty", async () => {
    const user = userEvent.setup();
    withClient(<CurrencySelect value="" onValueChange={jest.fn()} ariaLabel="Currency" />);
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    expect(screen.getByText("UAE Dirham")).toBeInTheDocument();
  });

  it("FormPhone loads the full countries list for its dial codes and keeps +971 as the default", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ countries: [
        { name: "United Arab Emirates", nameAr: "", code: "AE", currencyCode: "AED", currencySymbol: "AED", phoneCode: "971" },
        { name: "Narnia", nameAr: "", code: "NA", currencyCode: "NAR", currencySymbol: "N", phoneCode: "999" },
      ] }),
    });
    withClient(<FormPhone label="Phone" value="" onChange={jest.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/countries?");
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=300");
    // Radix Select is not operable under jsdom; the default dial code stays selected.
    expect(screen.getByRole("combobox", { name: "Select country" })).toHaveTextContent("+971");
  });
});
