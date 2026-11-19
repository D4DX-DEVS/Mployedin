import { fireEvent, render, screen, within } from "@testing-library/react";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";

describe("PhoneRecordList", () => {
  it("renders one card per record with title, subtitle, figures and a link to the record", () => {
    render(
      <PhoneRecordList
        label="Agents"
        items={[
          {
            key: "a1",
            href: "/en/super-agent/agents/a1",
            title: "Agent Ahmed",
            subtitle: "ahmed@example.com",
            stats: [{ label: "Leads", value: 3 }, { label: "Conv. Rate", value: "33%" }],
            actions: <button type="button">Explain</button>,
          },
          { key: "a2", title: "Agent Khalid" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Agents" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole("link", { name: "Agent Ahmed" })).toHaveAttribute("href", "/en/super-agent/agents/a1");
    expect(within(cards[0]).getByText("ahmed@example.com")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Leads")).toBeInTheDocument();
    expect(within(cards[0]).getByText("33%")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("button", { name: "Explain" })).toBeInTheDocument();
    expect(within(cards[1]).queryByRole("link")).toBeNull();
  });

  it("shows the empty state when there are no records, and a busy skeleton while loading", () => {
    const { rerender } = render(<PhoneRecordList items={[]} empty={<p>No agents yet</p>} />);
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    rerender(<PhoneRecordList items={[]} loading empty={<p>No agents yet</p>} />);
    expect(screen.queryByText("No agents yet")).toBeNull();
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  describe("row selection", () => {
    const toggle = jest.fn();
    beforeEach(() => toggle.mockClear());
    const select = (checked: boolean) => ({ checked, onToggle: toggle, label: "Select Sara Ahmed" });

    it("puts a checkbox at the start of the card header, named for the person", () => {
      render(
        <PhoneRecordList
          items={[{ key: "s1", title: "Sara Ahmed", leading: <span>SA</span>, selection: select(false), actions: <button type="button">Open</button> }]}
        />,
      );
      const card = screen.getByRole("listitem");
      const box = within(card).getByRole("checkbox", { name: "Select Sara Ahmed" });
      expect(box).not.toBeChecked();
      // Before the avatar and the name, in the header row.
      const avatar = within(card).getByText("SA");
      expect(box.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const name = within(card).getByText("Sara Ahmed");
      expect(box.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("toggles from the checkbox and from the 44px label around it", () => {
      render(<PhoneRecordList items={[{ key: "s1", title: "Sara Ahmed", selection: select(true) }]} />);
      const box = screen.getByRole("checkbox", { name: "Select Sara Ahmed" });
      expect(box).toBeChecked();
      expect(box.closest("label")?.className).toMatch(/min-h-11/);
      expect(box.closest("label")?.className).toMatch(/min-w-11/);
      fireEvent.click(box);
      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it("does the same on the two-row (facts) card", () => {
      render(
        <PhoneRecordList
          items={[{ key: "s1", title: "Sara Ahmed", facts: ["Engineer", "5 yrs"], selection: select(false) }]}
        />,
      );
      fireEvent.click(screen.getByRole("checkbox", { name: "Select Sara Ahmed" }));
      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it("keeps the checkbox out of the stretched card link", () => {
      render(<PhoneRecordList items={[{ key: "s1", href: "/en/x", title: "Sara Ahmed", selection: select(false) }]} />);
      const box = screen.getByRole("checkbox", { name: "Select Sara Ahmed" });
      expect(box.closest("label")?.className).toMatch(/\brelative\b/);
      expect(box.closest("label")?.className).toMatch(/\bz-10\b/);
    });

    it("draws no checkbox for a record without selection", () => {
      render(<PhoneRecordList items={[{ key: "s1", title: "Sara Ahmed" }]} />);
      expect(screen.queryByRole("checkbox")).toBeNull();
    });
  });
});
