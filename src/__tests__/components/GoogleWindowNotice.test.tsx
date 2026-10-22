/**
 * @jest-environment jsdom
 *
 * The line under a Google button. A screen reader announces text that appears in
 * a live region it already knows about, so the region must be in the page before
 * the browser blocks the Google window, empty until then, and the same element
 * all along.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { GoogleWindowNotice, GOOGLE_WINDOW_NOTICE_ID } from "@/components/features/auth/GoogleWindowNotice";

const NOTICE = "Continue with Google opens a Google window";
const BLOCKED = "Your browser blocked the Google window. Press the Google button again.";

function renderNotice(blocked: boolean) {
  return render(<GoogleWindowNotice notice={NOTICE} blockedMessage={BLOCKED} blocked={blocked} />);
}

function liveRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector<HTMLElement>('[aria-live="polite"]');
  if (!region) throw new Error("no polite live region in the page");
  return region;
}

describe("GoogleWindowNotice", () => {
  it("shows the neutral notice, and nothing is announced", () => {
    const { container } = renderNotice(false);

    expect(screen.getByText(NOTICE)).toHaveAttribute("id", GOOGLE_WINDOW_NOTICE_ID);
    expect(screen.getByText(NOTICE)).not.toHaveAttribute("aria-hidden");
    expect(screen.queryByText(BLOCKED)).toBeNull();
    expect(liveRegion(container)).toBeEmptyDOMElement();
  });

  it("has the live region in the page from the start, visually hidden, before anything is blocked", () => {
    const { container } = renderNotice(false);

    const region = liveRegion(container);
    expect(region).toHaveClass("sr-only");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });

  it("puts the blocked message into that same live region, and reads the visible line once", () => {
    const { container, rerender } = renderNotice(false);
    const region = liveRegion(container);

    rerender(<GoogleWindowNotice notice={NOTICE} blockedMessage={BLOCKED} blocked />);

    expect(liveRegion(container)).toBe(region);
    expect(region).toHaveTextContent(BLOCKED);
    const visible = container.querySelector(`#${GOOGLE_WINDOW_NOTICE_ID}`);
    expect(visible).toHaveTextContent(BLOCKED);
    expect(visible).toHaveAttribute("aria-hidden", "true");
    expect(visible).not.toHaveAttribute("aria-live");
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("empties the live region again when the notice comes back, and announces nothing", () => {
    const { container, rerender } = renderNotice(true);
    const region = liveRegion(container);
    expect(region).toHaveTextContent(BLOCKED);

    rerender(<GoogleWindowNotice notice={NOTICE} blockedMessage={BLOCKED} blocked={false} />);

    expect(liveRegion(container)).toBe(region);
    expect(region).toBeEmptyDOMElement();
    expect(screen.getByText(NOTICE)).not.toHaveAttribute("aria-hidden");
  });

  it("has exactly one live region", () => {
    const { container } = renderNotice(true);

    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
  });
});
