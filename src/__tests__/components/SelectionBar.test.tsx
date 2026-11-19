/**
 * @jest-environment jsdom
 *
 * The bar every list shows once rows are ticked: "N selected", Clear, and the
 * actions that apply to the selection. Export CVs is limited to 50 candidates
 * (owner decision 4A): above that the button is disabled and says why.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExportCvsButton, SelectionBar } from "@/components/shared/SelectionBar";
import { CV_EXPORT_MAX_ITEMS } from "@/lib/cv/cvExportTypes";

describe("SelectionBar", () => {
  it("renders nothing while no row is selected", () => {
    const { container } = render(<SelectionBar count={0} onClear={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many are selected and clears them", async () => {
    const onClear = jest.fn();
    render(<SelectionBar count={12} onClear={onClear} />);

    expect(screen.getByRole("region", { name: "Selected rows" })).toBeInTheDocument();
    expect(screen.getByText("12 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders the actions it is given", () => {
    render(
      <SelectionBar count={2} onClear={jest.fn()}>
        <button type="button">Do a thing</button>
      </SelectionBar>,
    );
    expect(screen.getByRole("button", { name: "Do a thing" })).toBeInTheDocument();
  });

  it("is sticky at the bottom of the page content (the scroll container's own padding clears the tab bar)", () => {
    render(<SelectionBar count={1} onClear={jest.fn()} />);
    const bar = screen.getByRole("region", { name: "Selected rows" });
    expect(bar.className).toMatch(/\bsticky\b/);
    expect(bar.className).toMatch(/\bbottom-0\b/);
  });

  it("keeps Clear a 44px touch target on phones", () => {
    render(<SelectionBar count={1} onClear={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Clear selection" }).className).toMatch(/max-sm:min-h-11/);
  });
});

describe("ExportCvsButton", () => {
  it("opens the export for a selection up to the limit", async () => {
    const onClick = jest.fn();
    render(<ExportCvsButton count={CV_EXPORT_MAX_ITEMS} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Export CVs" });
    expect(button).toBeEnabled();
    expect(screen.queryByText(/at a time/i)).toBeNull();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled above the limit, with the reason as a tooltip and in words", async () => {
    const onClick = jest.fn();
    render(<ExportCvsButton count={CV_EXPORT_MAX_ITEMS + 1} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Export CVs" });
    expect(button).toBeDisabled();
    const reason = "You can export up to 50 CVs at a time. Clear some selections to continue.";
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(button.parentElement).toHaveAttribute("title", reason);
    expect(button).toHaveAttribute("aria-describedby", screen.getByText(reason).id);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
