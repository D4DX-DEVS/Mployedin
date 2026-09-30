/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccessibilityPanel } from "@/components/shared/AccessibilityPanel";
import { MAIN_CONTENT_ID } from "@/components/shared/SkipToContent";
import { openAccessibilityPanel, savePreferences } from "@/lib/a11y/usePreferences";
import { DEFAULT_PREFERENCES } from "@/lib/a11y/preferences";
import { saveLauncherPosition } from "@/components/shared/AccessibilityPanel/useLauncherPosition";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// jsdom has no PointerEvent; without one the drag events carry no coordinates.
if (typeof window.PointerEvent === "undefined") {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
}

/**
 * The floating button opens the settings themselves — no trip through the
 * Accessibility Statement to find them — and each choice lands on <html>
 * straight away and in the cookie the server reads on the next page load.
 */
describe("AccessibilityPanel", () => {
  const html = document.documentElement;

  beforeEach(() => {
    act(() => {
      savePreferences(DEFAULT_PREFERENCES);
      saveLauncherPosition(null);
    });
  });

  function renderPanel(props: Partial<React.ComponentProps<typeof AccessibilityPanel>> = {}) {
    return render(
      <>
        <AccessibilityPanel locale="en" statementPublished={false} {...props} />
        <main id={MAIN_CONTENT_ID}>Page</main>
      </>,
    );
  }

  async function openFromButton() {
    const user = userEvent.setup();
    const launcher = screen.getByRole("button", { name: "Accessibility options" });
    await user.click(launcher);
    await screen.findByRole("dialog", { name: "Accessibility" });
    return { user, launcher };
  }

  it("opens the settings from the floating button, with focus inside", async () => {
    renderPanel();
    await openFromButton();

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("tab", { name: "Display" })).toHaveAttribute("aria-selected", "true");
  });

  it("applies text size and high contrast at once and saves them for the next page load", async () => {
    renderPanel();
    const { user } = await openFromButton();

    await user.click(screen.getByRole("button", { name: "Larger text" }));
    await user.click(screen.getByRole("switch", { name: /High contrast/ }));

    expect(html).toHaveAttribute("data-a11y-text", "115");
    expect(html).toHaveAttribute("data-a11y-contrast", "high");
    expect(screen.getByText("115%")).toBeInTheDocument();
    expect(decodeURIComponent(document.cookie)).toContain('"textScale":115');

    await user.click(screen.getByRole("button", { name: "Reset all settings" }));
    expect(html).not.toHaveAttribute("data-a11y-text");
    expect(html).not.toHaveAttribute("data-a11y-contrast");
  });

  it("keeps the smallest-text button focusable at the end of the range", async () => {
    renderPanel();
    const { user } = await openFromButton();
    const smaller = screen.getByRole("button", { name: "Smaller text" });

    await user.click(smaller);
    expect(html).toHaveAttribute("data-a11y-text", "90");
    expect(smaller).toHaveAttribute("aria-disabled", "true");
    expect(smaller).toHaveFocus();
  });

  it("links the statement only once an admin has published it", async () => {
    const { unmount } = renderPanel({ statementPublished: false });
    await openFromButton();
    expect(screen.queryByRole("link", { name: /Accessibility Statement/ })).not.toBeInTheDocument();
    unmount();

    renderPanel({ statementPublished: true, locale: "ar" });
    await openFromButton();
    expect(screen.getByRole("link", { name: /Accessibility Statement/ })).toHaveAttribute("href", "/ar/accessibility");
  });

  it("closes on Escape and hands focus back to the button", async () => {
    renderPanel();
    const { user, launcher } = await openFromButton();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(launcher).toHaveFocus();
  });

  it("skips to the page content from the Navigation tab", async () => {
    renderPanel();
    const { user } = await openFromButton();

    await user.click(screen.getByRole("tab", { name: "Navigation" }));
    await user.click(screen.getByRole("button", { name: /Skip to main content/ }));

    await waitFor(() => expect(document.getElementById(MAIN_CONTENT_ID)).toHaveFocus());
  });

  it("lays the tabs out right-to-left on the Arabic site", async () => {
    renderPanel({ locale: "ar" });
    await openFromButton();

    expect(screen.getByRole("tablist").closest("[dir]")).toHaveAttribute("dir", "rtl");
  });

  // Like accessibility buttons elsewhere, it can be dragged out of the way;
  // a press that barely moves is still a click.
  it("drags to the other side without opening, remembers it, and resets from the panel", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    renderPanel();
    const launcher = screen.getByRole("button", { name: "Accessibility options" });

    fireEvent.pointerDown(launcher, { pointerId: 1, button: 0, clientX: 980, clientY: 400 });
    fireEvent.pointerMove(launcher, { pointerId: 1, clientX: 600, clientY: 300 });
    fireEvent.pointerMove(launcher, { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerUp(launcher, { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.click(launcher);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("mployedin.a11y.button") ?? "null")).toEqual({ side: "start", top: 0.25 });

    fireEvent.pointerDown(launcher, { pointerId: 2, button: 0, clientX: 100, clientY: 200 });
    fireEvent.pointerUp(launcher, { pointerId: 2, clientX: 102, clientY: 201 });
    fireEvent.click(launcher);
    const dialog = await screen.findByRole("dialog", { name: "Accessibility" });
    // Opens beside the button, on the side it was dragged to.
    expect(dialog.className).toMatch(/sm:start-20/);

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Navigation" }));
    await user.click(screen.getByRole("button", { name: "Reset position" }));
    expect(localStorage.getItem("mployedin.a11y.button")).toBeNull();
  });

  it("opens without its own button, as the dashboards' account menu does", async () => {
    renderPanel({ showLauncher: false });
    expect(screen.queryByRole("button", { name: "Accessibility options" })).not.toBeInTheDocument();

    act(() => openAccessibilityPanel());
    expect(await screen.findByRole("dialog", { name: "Accessibility" })).toBeInTheDocument();
  });
});
