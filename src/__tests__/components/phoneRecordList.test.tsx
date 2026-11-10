import { render, screen, within } from "@testing-library/react";
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
});
