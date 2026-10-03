import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchableSelect } from "@/components/ui/searchable-select";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("SearchableSelect", () => {
  beforeAll(() => {
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      configurable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      writable: true,
      configurable: true,
      value: jest.fn(),
    });
  });

  it("allows the dropdown to grow beyond the trigger width for long labels", async () => {
    const longLabel = "Resume_Backend_Architecture_Senior.pdf";

    render(
      <SearchableSelect
        options={[
          { value: "resume-v2", label: "Resume_v2.pdf" },
          { value: "resume-backend", label: longLabel },
        ]}
        value="resume-v2"
        onValueChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
    });

    expect(screen.getByText(longLabel)).toBeVisible();

    const content = screen.getByTestId("searchable-select-content");

    expect(content).toHaveStyle({
      width: "max-content",
      minWidth: "var(--radix-popover-trigger-width)",
      maxWidth: "min(28rem, calc(100vw - 2rem))",
    });
  });

  it("supports controlled search text for remote option loading", async () => {
    const handleSearchValueChange = jest.fn();
    const handleValueChange = jest.fn();

    render(
      <SearchableSelect
        options={[{ value: "acme", label: "Acme Corp" }]}
        value=""
        searchValue=""
        onSearchValueChange={handleSearchValueChange}
        onValueChange={handleValueChange}
      />
    );

    fireEvent.click(screen.getByRole("combobox"));

    const input = await screen.findByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "ac" } });

    expect(handleSearchValueChange).toHaveBeenCalledWith("ac");

    fireEvent.click(screen.getByText("Acme Corp"));

    expect(handleValueChange).toHaveBeenCalledWith("acme");
    expect(handleSearchValueChange).toHaveBeenCalledWith("");
  });

  // Two employer accounts can share a company name. cmdk identifies items by
  // their `value`, so options keyed by label used to highlight together and
  // Enter always chose the first of them.
  describe("options that share a label", () => {
    const twins = [
      { value: "beta-1", label: "Beta Industries" },
      { value: "beta-2", label: "Beta Industries" },
      { value: "gamma", label: "Gamma Solutions" },
    ];

    it("highlights one option at a time", async () => {
      render(<SearchableSelect options={twins} value="" onValueChange={jest.fn()} />);

      fireEvent.click(screen.getByRole("combobox"));

      await waitFor(() => {
        expect(screen.getAllByRole("option").filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1);
      });
    });

    it("selects the highlighted twin, not the first one, on Enter", async () => {
      const handleValueChange = jest.fn();
      render(<SearchableSelect options={twins} value="" onValueChange={handleValueChange} searchable />);

      fireEvent.click(screen.getByRole("combobox"));
      const input = await screen.findByPlaceholderText("Search…");
      await waitFor(() => {
        expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
      });

      fireEvent.keyDown(input, { key: "ArrowDown" });
      await waitFor(() => {
        expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
      });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(handleValueChange).toHaveBeenCalledWith("beta-2");
    });
  });

  it("matches the search against labels, not option values", async () => {
    render(
      <SearchableSelect
        options={[
          { value: "abc123", label: "Zeta Trading" },
          { value: "x", label: "Alpha Foods" },
        ]}
        value=""
        onValueChange={jest.fn()}
        searchable
      />
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(await screen.findByPlaceholderText("Search…"), { target: { value: "abc" } });

    await waitFor(() => {
      expect(screen.queryByText("Zeta Trading")).not.toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "alph" } });
    expect(await screen.findByText("Alpha Foods")).toBeInTheDocument();
  });

  // CityPicker pins the chosen city as "Pune", then relabels the same id
  // "Pune, Maharashtra" when server results arrive, all while open.
  it("searches the new label when an option is relabelled while open", async () => {
    const { rerender } = render(
      <SearchableSelect options={[{ value: "p", label: "Pune" }]} value="" onValueChange={jest.fn()} searchable />
    );
    fireEvent.click(screen.getByRole("combobox"));
    const input = await screen.findByPlaceholderText("Search…");

    rerender(
      <SearchableSelect options={[{ value: "p", label: "Pune, Maharashtra" }]} value="" onValueChange={jest.fn()} searchable />
    );
    fireEvent.change(input, { target: { value: "mahar" } });

    expect(await screen.findByText("Pune, Maharashtra")).toBeInTheDocument();
  });

  it("still highlights an option whose value is empty", async () => {
    render(
      <SearchableSelect
        options={[
          { value: "", label: "All Employers" },
          { value: "e1", label: "Fazil" },
        ]}
        value=""
        onValueChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    });
  });
});