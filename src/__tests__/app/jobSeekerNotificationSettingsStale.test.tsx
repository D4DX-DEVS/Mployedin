/**
 * @jest-environment jsdom
 *
 * The settings page PATCHes its whole snapshot. A tab left open while the user
 * replied STOP on WhatsApp would, on the next save, put the `whatsapp` channel
 * back, undoing the STOP on that channel. The page now sends the
 * `updatedAt` it last loaded or saved as `expectedUpdatedAt`; a 409 means the
 * stored copy moved on, so the page tells the user and reloads instead of
 * overwriting it.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/hooks/useBackNavigation", () => ({ useBackNavigation: () => ({ goBack: jest.fn() }) }));

import NotificationSettingsPage from "@/app/[locale]/(dashboard)/job-seeker/settings/notifications/page";

const T0 = "2026-10-02T09:00:00.000Z";
const T1 = "2026-10-02T09:05:00.000Z";
const T_STOP = "2026-10-02T09:10:00.000Z";

const prefsDoc = (over: Record<string, unknown> = {}) => ({
  emailFrequency: "daily",
  categories: {
    interviews: { enabled: true, channels: ["in_app", "email", "whatsapp"] },
  },
  unsubscribedAll: false,
  dailyDigestTime: "09:00",
  timezone: "Asia/Dubai",
  updatedAt: T0,
  ...over,
});

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[];
let getResponses: unknown[];
let patchResponses: { status: number; body: unknown }[];

beforeEach(() => {
  jest.clearAllMocks();
  calls = [];
  getResponses = [{ success: true, data: prefsDoc() }];
  patchResponses = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "PATCH") {
      const next = patchResponses.shift() ?? { status: 200, body: { success: true, data: prefsDoc({ updatedAt: T1 }) } };
      return { ok: next.status < 400, status: next.status, json: async () => next.body };
    }
    const body = getResponses.length > 1 ? getResponses.shift() : getResponses[0];
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
});

// The frequency buttons carry their description in the accessible name.
const FREQ = { instant: /^Instant/, daily: /^Daily Digest/, weekly: /^Weekly Summary/, off: /^Off/ };

const patches = () => calls.filter((c) => c.method === "PATCH");
const gets = () => calls.filter((c) => c.method === "GET");

describe("job-seeker notification settings — stale snapshot", () => {
  it("sends the loaded updatedAt as expectedUpdatedAt, then the one the last save returned", async () => {
    const user = userEvent.setup();
    render(<NotificationSettingsPage />);
    await screen.findByRole("button", { name: FREQ.weekly });

    await user.click(screen.getByRole("button", { name: FREQ.weekly }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual(expect.objectContaining({ emailFrequency: "weekly", expectedUpdatedAt: T0 }));

    await screen.findByText("Preferences saved");
    await user.click(screen.getByRole("button", { name: FREQ.instant }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body).toEqual(expect.objectContaining({ emailFrequency: "instant", expectedUpdatedAt: T1 }));
  });

  it("on a 409 tells the user, reloads the latest preferences and drops the stale edit", async () => {
    const user = userEvent.setup();
    // After STOP the stored copy has no whatsapp channel and a newer stamp.
    getResponses = [
      { success: true, data: prefsDoc() },
      { success: true, data: prefsDoc({ emailFrequency: "none", updatedAt: T_STOP, categories: { interviews: { enabled: true, channels: ["in_app", "email"] } } }) },
    ];
    patchResponses = [{ status: 409, body: { success: false, error: "stale_preferences" } }];

    render(<NotificationSettingsPage />);
    await screen.findByRole("button", { name: FREQ.weekly });
    await user.click(screen.getByRole("button", { name: FREQ.weekly }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(
      "Your notification settings changed in another place. We reloaded the latest ones, so please review them and save again.",
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText("Preferences saved")).not.toBeInTheDocument();

    // Reloaded: the stored values are shown, the edit is gone, nothing left to save.
    await waitFor(() => expect(gets()).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: FREQ.off })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: FREQ.weekly })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();

    // The next save carries the reloaded stamp, not the stale one.
    await user.click(screen.getByRole("button", { name: FREQ.daily }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body).toEqual(expect.objectContaining({ emailFrequency: "daily", expectedUpdatedAt: T_STOP }));
  });

  it("does not show the stale-copy message for other failures", async () => {
    const user = userEvent.setup();
    patchResponses = [{ status: 500, body: { error: "boom" } }];
    render(<NotificationSettingsPage />);
    await screen.findByRole("button", { name: FREQ.weekly });
    await user.click(screen.getByRole("button", { name: FREQ.weekly }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(toast.error).not.toHaveBeenCalled();
    expect(gets()).toHaveLength(1);
  });
});

// WhatsApp is the user's own choice. The page fills a category the stored
// document lacks from its own defaults, so those must match the server's, which
// never include WhatsApp: otherwise any save would turn it on without the user
// ticking anything.
describe("job-seeker notification settings — client defaults", () => {
  it("never saves WhatsApp as ticked for a category the stored document lacks", async () => {
    const user = userEvent.setup();
    getResponses = [{ success: true, data: prefsDoc({ categories: {} }) }];
    render(<NotificationSettingsPage />);
    await screen.findByRole("button", { name: FREQ.weekly });
    await user.click(screen.getByRole("button", { name: FREQ.weekly }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    const categories = patches()[0].body?.categories as Record<string, { channels: string[] }>;
    expect(categories.interviews.channels).toEqual(["in_app", "email"]);
    for (const c of Object.values(categories)) expect(c.channels).not.toContain("whatsapp");
  });
});
