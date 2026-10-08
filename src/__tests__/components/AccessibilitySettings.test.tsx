/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { AccessibilitySettings } from "@/components/shared/a11y/AccessibilitySettings";
import { SkipLink } from "@/components/shared/a11y/SkipLink";
import {
  A11Y_OPEN_EVENT,
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y,
  getA11yInitScript,
  sanitizePreferences,
} from "@/lib/a11y/preferences";

expect.extend(toHaveNoViolations);

function resetHtml() {
  for (const attr of Array.from(document.documentElement.attributes)) {
    if (attr.name.startsWith("data-a11y-")) document.documentElement.removeAttribute(attr.name);
  }
}

beforeEach(() => {
  localStorage.clear();
  resetHtml();
});

async function openPanel() {
  render(<AccessibilitySettings locale="en" />);
  act(() => {
    window.dispatchEvent(new Event(A11Y_OPEN_EVENT));
  });
  return screen.findByRole("dialog", { name: "Accessibility settings" });
}

describe("AccessibilitySettings", () => {
  it("applies and persists text size and toggles immediately", async () => {
    const dialog = await openPanel();
    fireEvent.click(within(dialog).getByRole("radio", { name: "130%" }));
    fireEvent.click(within(dialog).getByRole("switch", { name: "High contrast" }));
    fireEvent.click(within(dialog).getByRole("switch", { name: "Underline links" }));

    const html = document.documentElement;
    expect(html.getAttribute("data-a11y-text")).toBe("130");
    expect(html.getAttribute("data-a11y-contrast")).toBe("on");
    expect(html.getAttribute("data-a11y-links")).toBe("on");
    expect(JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY) ?? "{}")).toMatchObject({
      textSize: "130",
      highContrast: true,
      underlineLinks: true,
    });
  });

  it("resets everything back to defaults", async () => {
    const dialog = await openPanel();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Reduce motion" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    expect(document.documentElement.hasAttribute("data-a11y-motion")).toBe(false);
    expect(localStorage.getItem(A11Y_STORAGE_KEY)).toBeNull();
  });

  it("shows the reading guide only when enabled", async () => {
    const dialog = await openPanel();
    expect(document.querySelector("[data-reading-guide]")).toBeNull();
    fireEvent.click(within(dialog).getByRole("switch", { name: "Reading guide" }));
    expect(document.querySelector("[data-reading-guide]")).not.toBeNull();
  });

  it("has no detectable accessibility violations", async () => {
    await openPanel();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe("a11y preferences storage", () => {
  it("ignores unknown or malformed values", () => {
    expect(sanitizePreferences({ textSize: "999", highContrast: "yes", evil: true })).toEqual(DEFAULT_A11Y);
    expect(sanitizePreferences(null)).toEqual(DEFAULT_A11Y);
  });

  it("the no-flash head script applies saved settings before hydration", () => {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify({ textSize: "150", strongFocus: true, bigCursor: "x" }));
    new Function(getA11yInitScript())();
    const html = document.documentElement;
    expect(html.getAttribute("data-a11y-text")).toBe("150");
    expect(html.getAttribute("data-a11y-focus")).toBe("on");
    expect(html.hasAttribute("data-a11y-cursor")).toBe(false);
  });
});

describe("SkipLink", () => {
  it("moves focus to the main landmark", () => {
    render(
      <>
        <SkipLink />
        <nav>menu</nav>
        <main>content</main>
      </>,
    );
    const link = screen.getByRole("link", { name: "Skip to main content" });
    Element.prototype.scrollIntoView = jest.fn();
    fireEvent.click(link);
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });
});
