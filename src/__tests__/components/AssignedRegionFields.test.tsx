/**
 * @jest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { AssignedRegionFields } from "@/components/features/settings/AssignedRegionFields";
import { AssignedRegionBadge } from "@/components/shared/AssignedRegionBadge";

const TIRUR = { id: "c_tirur", type: "city" as const, name: "Tirur", parent: "Kerala, India" };
const DUBAI = { id: "st_dubai", type: "state" as const, name: "Dubai", parent: "United Arab Emirates" };

describe("AssignedRegionFields", () => {
  it("lists every assigned region with its parent chain, read-only", () => {
    render(<AssignedRegionFields regions={[DUBAI, TIRUR]} />);
    const field = screen.getByTestId("assigned-region-field");
    expect(within(field).getByText("Assigned region")).toBeInTheDocument();
    expect(within(field).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Dubai, United Arab Emirates",
      "Tirur, Kerala, India",
    ]);
    expect(within(field).getByText("Read-only")).toBeInTheDocument();
    // The super-agent row is agent-only.
    expect(screen.queryByTestId("assigned-super-agent-field")).toBeNull();
  });

  it("tells an agent with no region to ask an admin, and names their super-agent", () => {
    render(
      <AssignedRegionFields
        regions={[]}
        showSuperAgent
        superAgent={{ name: "Super Agent", email: "superagent@mployedin.com" }}
      />,
    );
    const field = screen.getByTestId("assigned-region-field");
    expect(within(field).getByText("No region assigned")).toBeInTheDocument();
    expect(within(field).getByText(/ask your administrator/i)).toBeInTheDocument();

    const sa = screen.getByTestId("assigned-super-agent-field");
    expect(within(sa).getByText("Super Agent")).toBeInTheDocument();
    expect(within(sa).getByText("superagent@mployedin.com")).toBeInTheDocument();
  });

  it("says when no super-agent is linked", () => {
    render(<AssignedRegionFields regions={[TIRUR]} showSuperAgent superAgent={null} />);
    expect(within(screen.getByTestId("assigned-super-agent-field")).getByText("Not assigned yet")).toBeInTheDocument();
  });
});

describe("AssignedRegionBadge", () => {
  it("reads one region in full with an accessible 'Region' prefix", () => {
    render(<AssignedRegionBadge regions={[TIRUR]} />);
    const badge = screen.getByTestId("assigned-region-badge");
    expect(badge).toHaveTextContent("Region: Tirur, Kerala, India");
    expect(badge).toHaveAttribute("title", "Tirur, Kerala, India");
  });
});
