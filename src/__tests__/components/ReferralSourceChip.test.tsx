/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";

// The next-intl mock renders the real English copy from messages/en.json.
describe("ReferralSourceChip", () => {
  it("admin: role chip plus the referrer's name", () => {
    render(
      <ReferralSourceChip
        namespace="adminJobSeekers"
        summary={{ role: "super_agent", name: "Super Sam", referredAt: "2026-09-01" }}
      />,
    );
    expect(screen.getByText("Super-agent")).toBeInTheDocument();
    expect(screen.getByText("Super Sam")).toBeInTheDocument();
  });

  it("agent: only 'referred by you' when it is theirs, nothing otherwise", () => {
    const { rerender } = render(
      <ReferralSourceChip namespace="agentJobSeekers" summary={{ role: "agent", referredAt: "2026-09-01", isMine: true }} />,
    );
    expect(screen.getByText("Referred by you")).toBeInTheDocument();
    rerender(
      <ReferralSourceChip namespace="agentJobSeekers" summary={{ role: "agent", referredAt: "2026-09-01", isMine: false }} />,
    );
    expect(screen.queryByText("Referred by you")).toBeNull();
  });

  it("super-agent: 'via {name}' for a team agent's referral", () => {
    render(
      <ReferralSourceChip
        namespace="superAgentJobSeekers"
        summary={{ role: "agent", name: "Agent Ann", referredAt: "2026-09-01", isMine: false }}
      />,
    );
    expect(screen.getByText("Referred via Agent Ann")).toBeInTheDocument();
  });

  it("super-agent: 'by you' for their own link", () => {
    render(
      <ReferralSourceChip
        namespace="superAgentJobSeekers"
        summary={{ role: "super_agent", name: "Super Sam", referredAt: "2026-09-01", isMine: true }}
      />,
    );
    expect(screen.getByText("Referred by you")).toBeInTheDocument();
  });

  it("renders nothing without a summary", () => {
    const { container } = render(<ReferralSourceChip namespace="adminJobSeekers" />);
    expect(container).toBeEmptyDOMElement();
  });
});
