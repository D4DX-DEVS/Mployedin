/**
 * @jest-environment jsdom
 */
/**
 * The options panel must not render inside the element that holds the
 * trigger. In place, it sat inside the scrolling DialogContent, so opening it
 * grew the dialog's scroll height — the modal scrolled and clipped the list
 * (admin Add Agent → Assigned Super Agent / Assigned Region).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { InlineSearchSelect } from "@/components/shared/InlineSearchSelect";

const OPTIONS = [
  { value: "none", label: "None" },
  { value: "in", label: "India", hint: "IN" },
  { value: "ae", label: "United Arab Emirates", hint: "AE" },
  { value: "qa", label: "Qatar", hint: "QA" },
  { value: "kw", label: "Kuwait", hint: "KW" },
];

function renderInScroller(onValueChange = jest.fn()) {
  render(
    <div data-testid="scroller" style={{ overflowY: "auto" }}>
      <InlineSearchSelect value="none" onValueChange={onValueChange} options={OPTIONS} />
    </div>
  );
  return onValueChange;
}

describe("InlineSearchSelect", () => {
  it("renders the open panel outside the trigger's scrolling ancestor", async () => {
    renderInScroller();
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    const option = await screen.findByRole("button", { name: /india/i });
    expect(screen.getByTestId("scroller")).not.toContainElement(option);
  });

  it("picks an option and closes", async () => {
    const onValueChange = renderInScroller();
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    fireEvent.click(await screen.findByRole("button", { name: /qatar/i }));
    expect(onValueChange).toHaveBeenCalledWith("qa");
    expect(screen.queryByRole("button", { name: /kuwait/i })).not.toBeInTheDocument();
  });

  it("searches the hint as well as the label", async () => {
    renderInScroller();
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "ae" } });
    expect(screen.getByRole("button", { name: /united arab emirates/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /india/i })).not.toBeInTheDocument();
  });
});
