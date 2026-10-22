/**
 * @jest-environment jsdom
 *
 * The worker no longer registers for every visitor. Clicking Install on the
 * card is the user action that registers it (together with the opt-in flag), so
 * an installed app keeps working offline while a casual visitor never gets a
 * worker. The card merely appearing must not register anything.
 *
 * The card keeps "dismissed this session" in module state, so the case that
 * closes it (the Install click) runs last.
 */
const enableServiceWorker = jest.fn();
jest.mock("@/lib/pwa/enableServiceWorker", () => ({
  enableServiceWorker: (...args: unknown[]) => enableServiceWorker(...args),
}));
jest.mock("next/navigation", () => ({ usePathname: () => "/en" }));

import { act, render, screen } from "@testing-library/react";
import { PWAInstallPrompt } from "@/components/shared/PWAInstallPrompt";

function offerInstall(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = jest.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = prompt;
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  act(() => {
    jest.advanceTimersByTime(3500);
  });
  return prompt;
}

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  enableServiceWorker.mockReset().mockResolvedValue({ scope: "/" });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("PWAInstallPrompt", () => {
  it("does not register a worker just because the card appeared", () => {
    render(<PWAInstallPrompt />);
    offerInstall();

    expect(screen.getByRole("button", { name: /install/i })).toBeInTheDocument();
    expect(enableServiceWorker).not.toHaveBeenCalled();
  });

  // The snooze/installed marker is a preference (ui:*): an older build's marker
  // under the old name still counts once, then moves to the new name.
  it("honours a marker an older build left under the old name, and renames it", () => {
    localStorage.setItem("pwa-install-dismissed", "installed");
    render(<PWAInstallPrompt />);
    offerInstall();

    expect(screen.queryByRole("button", { name: /install/i })).not.toBeInTheDocument();
    expect(localStorage.getItem("pwa-install-dismissed")).toBeNull();
    expect(localStorage.getItem("ui:pwa-install-dismissed")).toBe("installed");
  });

  // Final review M4: cancelling the browser's install dialog still registered the worker (and its
  // cache of pages and CVs) for someone who had just said no.
  it("does not register the worker when the browser's install dialog is cancelled", async () => {
    // Closing the card is remembered for the module's lifetime, so this case gets a fresh module
    // (and the testing library with it, so both share one React).
    jest.resetModules();
    const rtl = require("@testing-library/react/pure") as typeof import("@testing-library/react/pure");
    const { PWAInstallPrompt: FreshPrompt } = require("@/components/shared/PWAInstallPrompt") as typeof import("@/components/shared/PWAInstallPrompt");
    const view = rtl.render(<FreshPrompt />);
    const prompt = jest.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    rtl.act(() => {
      window.dispatchEvent(event);
    });
    rtl.act(() => {
      jest.advanceTimersByTime(3500);
    });

    await rtl.act(async () => {
      rtl.screen.getByRole("button", { name: /install/i }).click();
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(enableServiceWorker).not.toHaveBeenCalled();
    view.unmount();
  });

  it("registers the worker when Install is clicked, and still shows the browser's install dialog", async () => {
    render(<PWAInstallPrompt />);
    const prompt = offerInstall();

    const install = screen.getByRole("button", { name: /install/i });
    await act(async () => {
      install.click();
    });

    expect(enableServiceWorker).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledTimes(1);
    // Accepting is remembered under the ui: name, not the old one.
    expect(localStorage.getItem("ui:pwa-install-dismissed")).toBe("installed");
    expect(localStorage.getItem("pwa-install-dismissed")).toBeNull();
  });

});
