/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ReferredBadge } from "@/components/shared/ReferredBadge";

describe("ReferredBadge", () => {
  it("renders the neutral label and hint, never a name", () => {
    render(<ReferredBadge />);
    const badge = screen.getByTestId("referred-badge");
    // The next-intl mock renders the English copy from messages/en.json.
    expect(badge).toHaveTextContent("Partner referred");
    expect(badge).toHaveAttribute("title", "Referred to Mployedin by one of our recruitment partners");
    expect(badge).toHaveAttribute("aria-label", "Referred to Mployedin by one of our recruitment partners");
  });

  it("supports the compact size", () => {
    render(<ReferredBadge size="xs" />);
    expect(screen.getByTestId("referred-badge").className).toContain("text-[10px]");
  });
});
