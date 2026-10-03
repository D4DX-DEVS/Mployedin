/**
 * @jest-environment jsdom
 *
 * Agents (like employers and super-agents) have no WhatsApp channel toggle in
 * their notification settings, so the verification panel, which used to appear
 * only once a WhatsApp channel was on, never showed until after a START: they
 * had no way to learn about it. The Notifications tab now invites an unverified
 * agent to send START with their personal code, and hides the invitation once
 * the number is verified, or while there is no phone START could verify.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Omar Agent", email: "omar@example.com" } }, update: jest.fn() }),
}));
jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => "/en/agent/settings",
  useSearchParams: () => new URLSearchParams(),
}));

import AgentSettingsPage from "@/app/[locale]/(dashboard)/agent/settings/page";

const LINK = "https://wa.me/15551234567?text=START%20K7P4QX";
const CODE = "K7P4QX";
/** The categories as the agent page stores them: no WhatsApp channel anywhere (the page has no toggle for it). */
const NO_WHATSAPP = {
  placements: { enabled: true, channels: ["in_app", "email"] },
  commissions: { enabled: true, channels: ["in_app", "email"] },
  team: { enabled: true, channels: ["in_app"] },
  jobs: { enabled: true, channels: ["in_app"] },
  system: { enabled: true, channels: ["in_app", "email"] },
};

let prefsBody: unknown;
const respond = (categories: object, whatsappVerification: unknown) => {
  prefsBody = {
    success: true,
    data: { emailFrequency: "daily", categories, unsubscribedAll: false, dailyDigestTime: "09:00", timezone: "Asia/Dubai", updatedAt: "2026-10-02T09:00:00.000Z" },
    whatsappVerification,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.startsWith("/api/user/notification-preferences") ? prefsBody : {};
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
});

/** Opens the Notifications tab and waits for its categories card. */
async function openNotifications() {
  render(<AgentSettingsPage />);
  await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
  await screen.findByText("Notification Categories");
}

describe("agent notification settings — WhatsApp invitation", () => {
  it("invites an unverified agent with no WhatsApp channel on to send START with their code, with the WhatsApp button", async () => {
    respond(NO_WHATSAPP, { verified: false, waLink: LINK, phoneLast4: "4567", phoneValid: true, startCode: CODE });
    await openNotifications();
    expect(screen.getByText("Get your updates on WhatsApp")).toBeInTheDocument();
    expect(screen.getByText(/ending in 4567/)).toBeInTheDocument();
    expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Message us on WhatsApp" })).toHaveAttribute("href", LINK);
  });

  it("hides the invitation once the number is verified", async () => {
    respond(NO_WHATSAPP, { verified: true, waLink: null, phoneLast4: "4567", phoneValid: true, startCode: null });
    await openNotifications();
    expect(screen.queryByText("Get your updates on WhatsApp")).toBeNull();
    expect(screen.queryByRole("link", { name: "Message us on WhatsApp" })).toBeNull();
  });

  // J3: an invitation the agent cannot act on is not shown at all.
  it("shows no invitation to an agent with no phone, or with a phone that has no country code", async () => {
    respond(NO_WHATSAPP, { verified: false, waLink: null, phoneLast4: null, phoneValid: false, startCode: null });
    await openNotifications();
    expect(screen.queryByText("Get your updates on WhatsApp")).toBeNull();
    expect(screen.queryByText(/Add one under Profile & Avatar in these settings/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Message us on WhatsApp" })).toBeNull();
  });

  it("sends an agent with a WhatsApp channel on but no phone to the Profile & Avatar tab of these settings", async () => {
    respond({ ...NO_WHATSAPP, placements: { enabled: true, channels: ["in_app", "email", "whatsapp"] } }, { verified: false, waLink: null, phoneLast4: null, phoneValid: false, startCode: null });
    await openNotifications();
    expect(screen.getByText(/Add one under Profile & Avatar in these settings/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message us on WhatsApp" })).toBeNull();
  });
});
