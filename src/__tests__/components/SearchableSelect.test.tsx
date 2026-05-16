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
});