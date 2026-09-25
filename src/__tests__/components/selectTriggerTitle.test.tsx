/**
 * @jest-environment jsdom
 */
/**
 * Filter triggers have fixed or capped widths, and the names they show (job
 * titles, team members, exhibitions) have no length limit, so a selected label
 * can be truncated with an ellipsis. The trigger's title carries the full label
 * so hovering always reveals it.
 */
import { render, screen } from "@testing-library/react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { InlineSearchSelect } from "@/components/shared/InlineSearchSelect";

const LONG = "Young energetic Salesman under 30 years old";

describe("select trigger title", () => {
  it("SearchableSelect exposes the full selected label, not the short trigger form", () => {
    render(
      <SearchableSelect
        options={[{ value: "inr", label: "₹ INR — Indian Rupee", triggerLabel: "₹ INR" }]}
        value="inr"
        onValueChange={jest.fn()}
      />
    );
    expect(screen.getByRole("combobox")).toHaveAttribute("title", "₹ INR — Indian Rupee");
  });

  it("SearchableSelect falls back to the placeholder when nothing is selected", () => {
    render(<SearchableSelect options={[]} onValueChange={jest.fn()} placeholder="Select a job with screening questions" />);
    expect(screen.getByRole("combobox")).toHaveAttribute("title", "Select a job with screening questions");
  });

  it("InlineSearchSelect exposes the full selected label", () => {
    render(
      <InlineSearchSelect value="j1" onValueChange={jest.fn()} options={[{ value: "j1", label: LONG }]} />
    );
    expect(screen.getByRole("button", { name: LONG })).toHaveAttribute("title", LONG);
  });
});
