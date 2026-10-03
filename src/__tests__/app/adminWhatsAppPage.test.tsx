/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/hooks/useUrlFilter", () => ({ useUrlFilter: (_key: string, def: string) => React.useState(def) }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/admin/settings/whatsapp",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm: jest.fn().mockResolvedValue(true), ConfirmDialogNode: null }) }));

import AdminWhatsAppPage from "@/app/[locale]/(dashboard)/admin/settings/whatsapp/page";

// jsdom lacks the pointer-capture and scrollIntoView calls Radix Select makes when it opens.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

type StatusBody = Record<string, unknown>;
const baseStatus: StatusBody = {
  configured: false, mode: "mock", enabled: true, phone: null, phoneError: null,
  last24h: { sent: 4, delivered: 3, read: 1, failed: 1, skipped: 2, mock: 0 },
  skipReasons: [{ reason: "daily_cap", count: 2 }],
};
const announcement = { _id: "t1", name: "mployedin_admin_announcement", language: "en", category: "UTILITY", status: "APPROVED", bodyText: "Hi {{1}}, {{2}}", bodyParamCount: 2, lastSyncedAt: "2026-10-01T00:00:00Z" };
const hello = { _id: "t2", name: "hello_world", language: "en_US", category: "UTILITY", status: "APPROVED", bodyText: "Hello World", bodyParamCount: 0, lastSyncedAt: "2026-10-01T00:00:00Z" };

let status: StatusBody;
let templates: unknown[];
let testResponse: { ok: boolean; status: number; body: unknown };
const fetchMock = jest.fn();
const toastError = jest.requireMock("sonner").toast.error as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  status = baseStatus;
  templates = [];
  testResponse = { ok: true, status: 200, body: { outcome: { status: "mock", messageId: "mock-1" } } };
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "POST" && u === "/api/admin/whatsapp/test") return Promise.resolve({ ok: testResponse.ok, status: testResponse.status, json: async () => testResponse.body });
    if (u.startsWith("/api/admin/whatsapp/status")) return Promise.resolve({ ok: true, json: async () => status });
    if (u.startsWith("/api/admin/whatsapp/config")) return Promise.resolve({ ok: true, json: async () => ({ config: { enabled: true, dailyCapPerUser: 3, automations: {} }, mode: "mock" }) });
    if (u.startsWith("/api/admin/whatsapp/templates")) return Promise.resolve({ ok: true, json: async () => ({ templates }) });
    if (u.startsWith("/api/admin/whatsapp/schedules")) return Promise.resolve({ ok: true, json: async () => ({ schedules: [] }) });
    if (u.startsWith("/api/admin/whatsapp/logs")) return Promise.resolve({ ok: true, json: async () => ({ success: true, logs: [], pagination: { page: 1, limit: 30, total: 0, totalPages: 1 } }) });
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const MOCK_HINT = "WhatsApp isn't connected yet, so test messages are recorded but not sent.";
const NOT_CONNECTED_HELP =
  "WhatsApp isn't connected yet, so no WhatsApp messages are being sent. Your technical team connects your WhatsApp Business account. Once that's done, this page shows your business number and message counts.";

/** Every route answers as usual except the status call, which never settles (first load). */
function pendingStatusLoad() {
  const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => (String(url).startsWith("/api/admin/whatsapp/status") ? new Promise(() => {}) : original(url, init)));
}

/** Every route answers as usual except the status call, which fails with a server error. */
function failedStatusLoad() {
  const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<unknown>;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    String(url).startsWith("/api/admin/whatsapp/status")
      ? Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "boom: connect ECONNREFUSED" }) })
      : original(url, init),
  );
}

const connectionCard = () => screen.getByRole("heading", { name: "Connection" }).closest(".rounded-xl") as HTMLElement;

/** The Connection card must not state a configured / sending verdict it has not been told. */
function expectNoConnectionClaim() {
  for (const claim of ["Not connected", "Connected", "Sending is on", "Sending is paused by an admin"]) {
    expect(screen.queryByText(claim)).not.toBeInTheDocument();
  }
}

const testPosts = () => fetchMock.mock.calls.filter(([u, init]) => u === "/api/admin/whatsapp/test" && (init as RequestInit | undefined)?.method === "POST") as Array<[string, RequestInit]>;
const postedBody = () => JSON.parse(String(testPosts()[0][1].body));

async function openTestTab() {
  render(<AdminWhatsAppPage />);
  await screen.findAllByText("Not connected");
  await userEvent.click(screen.getByRole("button", { name: "Send a test" }));
  await userEvent.type(screen.getByLabelText(/Phone number, with country code/), "+971501234567");
}

describe("admin WhatsApp page", () => {
  it("shows the overview counters, the connection badge and the skip reasons", async () => {
    render(<AdminWhatsAppPage />);
    expect((await screen.findAllByText("Not connected")).length).toBeGreaterThan(0);
    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    expect(screen.getByText("This person already got today's maximum number of messages")).toBeInTheDocument();
  });

  it("names the tabs in plain words", async () => {
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Not connected");
    for (const name of ["Overview", "Automatic messages", "Message templates", "Scheduled messages", "Message history", "Send a test"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("shows a plain getting-started list and no developer setup", async () => {
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Not connected");
    const card = screen.getByRole("heading", { name: "Getting started" }).closest(".rounded-xl") as HTMLElement;
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Your technical team connects your WhatsApp Business account (they have the setup guide).",
      "Create your message templates in Meta Business Manager, then sync them in the Message templates tab.",
      "Send yourself a test message from the Send a test tab.",
    ]);
    expect(screen.queryByText("Callback URL")).not.toBeInTheDocument();
    expect(screen.queryByText(/api\/webhooks\/whatsapp/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\.env|WHATSAPP_|restart the server|mock/i);
  });

  it("reads the status from the status endpoint", async () => {
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Not connected");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/whatsapp/status");
  });

  it("says plainly that WhatsApp is not connected, and shows no sending state while it is not", async () => {
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Not connected");
    expect(within(connectionCard()).getByText("Not connected")).toBeInTheDocument();
    expect(within(connectionCard()).getByText(NOT_CONNECTED_HELP)).toBeInTheDocument();
    expect(screen.queryByText("Sending is on")).not.toBeInTheDocument();
    expect(screen.queryByText("Sending is paused by an admin")).not.toBeInTheDocument();
  });

  it("shows Connected with the sending state once WhatsApp is connected", async () => {
    status = { ...baseStatus, configured: true, mode: "live", enabled: true };
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Connected");
    expect(within(connectionCard()).getByText("Connected")).toBeInTheDocument();
    expect(within(connectionCard()).getByText("Sending is on")).toBeInTheDocument();
    expect(screen.queryByText(NOT_CONNECTED_HELP)).not.toBeInTheDocument();
  });

  it("shows the 'not sent (not connected)' count only while not connected or when it is above zero", async () => {
    status = { ...baseStatus, configured: true, mode: "live" };
    const { unmount } = render(<AdminWhatsAppPage />);
    await screen.findAllByText("Connected");
    expect(screen.queryByText("Not sent (not connected)")).not.toBeInTheDocument();
    unmount();

    status = { ...baseStatus, configured: true, mode: "live", last24h: { ...(baseStatus.last24h as object), mock: 5 } };
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Connected");
    expect(screen.getByText("Not sent (not connected)").nextElementSibling).toHaveTextContent(/^5$/);
  });

  it("shows 'paused' only when the loaded status says sending is off", async () => {
    status = { ...baseStatus, configured: true, mode: "live", enabled: false };
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Connected");
    expect(screen.getByText("Sending is paused by an admin")).toBeInTheDocument();
    expect(screen.queryByText("Sending is on")).not.toBeInTheDocument();
  });

  it("makes no claim about the connection while the status is still loading", async () => {
    pendingStatusLoad();
    render(<AdminWhatsAppPage />);
    expectNoConnectionClaim();
    expect(connectionCard()).toHaveTextContent("…");
    expect(screen.queryByText(MOCK_HINT)).not.toBeInTheDocument();
  });

  it("makes no claim about the connection when the status could not be loaded", async () => {
    failedStatusLoad();
    render(<AdminWhatsAppPage />);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't load the WhatsApp settings. Please try again."));
    // The refresh button re-enables once loading ends; the card then shows a dash, not a verdict.
    expectNoConnectionClaim();
    await waitFor(() => expect(connectionCard()).toHaveTextContent("—"));
    expect(screen.queryByText(MOCK_HINT)).not.toBeInTheDocument();
  });

  it("shows a dash, not zero, for the 24-hour counters when the status could not be loaded", async () => {
    failedStatusLoad();
    render(<AdminWhatsAppPage />);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    for (const label of ["Sent", "Delivered", "Read", "Failed", "Not sent", "Not sent (not connected)"]) {
      await waitFor(() => expect(screen.getByText(label).nextElementSibling).toHaveTextContent(/^—$/));
    }
  });

  it("shows the counters from the loaded status", async () => {
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Not connected");
    expect(screen.getByText("Sent").nextElementSibling).toHaveTextContent(/^4$/);
    expect(screen.getByText("Delivered").nextElementSibling).toHaveTextContent(/^3$/);
    expect(screen.getByText("Not sent").nextElementSibling).toHaveTextContent(/^2$/);
  });

  it("shows the verified name, number, quality and limit when Meta returned the phone details", async () => {
    status = {
      ...baseStatus, configured: true, mode: "live",
      phone: { verifiedName: "Mployedin Careers", displayPhoneNumber: "+971 4 123 4567", qualityRating: "GREEN", messagingLimitTier: "TIER_1K" },
    };
    render(<AdminWhatsAppPage />);
    expect(await screen.findByText("Mployedin Careers")).toBeInTheDocument();
    expect(screen.getByText("Business name shown in WhatsApp").nextElementSibling).toHaveTextContent("Mployedin Careers");
    expect(screen.getByText("Phone number").nextElementSibling).toHaveTextContent("+971 4 123 4567");
    expect(screen.getByText("Quality rating").nextElementSibling).toHaveTextContent(/^Good \(green\)$/);
    expect(screen.getByText("How WhatsApp rates the messages you send. Keep it green to avoid limits.")).toBeInTheDocument();
    expect(screen.getByText("Messaging limit").nextElementSibling).toHaveTextContent(/^Up to 1,000 people a day$/);
    expect(screen.getByText("How many different people you can message in a day.")).toBeInTheDocument();
    expect(screen.queryByText(/GREEN|TIER_1K/)).not.toBeInTheDocument();
    expect(screen.queryByText("WhatsApp didn't send us your number's details. Please try again later.")).not.toBeInTheDocument();
    expect(screen.queryByText(MOCK_HINT)).not.toBeInTheDocument();
  });

  it("says 'Not known yet', never Meta's raw code, for a messaging limit it does not recognise", async () => {
    status = {
      ...baseStatus, configured: true, mode: "live",
      phone: { verifiedName: "Mployedin Careers", displayPhoneNumber: "+971 4 123 4567", qualityRating: "GREEN", messagingLimitTier: "TIER_SOMETHING" },
    };
    render(<AdminWhatsAppPage />);
    expect(await screen.findByText("Mployedin Careers")).toBeInTheDocument();
    expect(screen.getByText("Messaging limit").nextElementSibling).toHaveTextContent(/^Not known yet$/);
    expect(screen.queryByText(/TIER_/)).not.toBeInTheDocument();
  });

  it("says Meta did not return the number details when the server is configured but sent none", async () => {
    status = { ...baseStatus, configured: true, mode: "live", phone: null, phoneError: null };
    render(<AdminWhatsAppPage />);
    expect(await screen.findByText("WhatsApp didn't send us your number's details. Please try again later.")).toBeInTheDocument();
  });

  it("tells the admin when the status could not be loaded, without exposing the failure", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "boom: connect ECONNREFUSED" }) }));
    render(<AdminWhatsAppPage />);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't load the WhatsApp settings. Please try again."));
  });

  it("labels every skip reason the backend writes, and anything unrecognised as Other", async () => {
    status = {
      ...baseStatus,
      skipReasons: [
        { reason: "disabled_by_admin", count: 1 }, { reason: "no_phone", count: 2 }, { reason: "invalid_phone", count: 3 },
        { reason: "opted_out", count: 4 }, { reason: "daily_cap", count: 5 }, { reason: "no_template_outside_window", count: 6 },
        { reason: "unknown", count: 7 },
      ],
    };
    render(<AdminWhatsAppPage />);
    for (const label of [
      "An admin paused WhatsApp sending", "This person has no phone number on their profile", "This person's phone number is missing the country code",
      "This person asked us to stop messaging them", "This person already got today's maximum number of messages",
      "No approved template is set for this message, and WhatsApp needs one unless the person wrote to us in the last 24 hours", "Another reason",
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  it("maps a classified phone error to localized copy and never renders the raw phoneError", async () => {
    status = { ...baseStatus, configured: true, mode: "live", phoneError: "Meta API error (auth, code 190, HTTP 401)", phoneErrorKind: "auth" };
    render(<AdminWhatsAppPage />);
    expect(await screen.findByText(/WhatsApp didn't accept our connection details/)).toBeInTheDocument();
    expect(screen.queryByText(/code 190/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HTTP 401/)).not.toBeInTheDocument();
  });

  it("falls back to generic copy for an unclassified phone error and never renders it", async () => {
    status = { ...baseStatus, configured: true, mode: "live", phoneError: "getaddrinfo ENOTFOUND graph.facebook.com" };
    render(<AdminWhatsAppPage />);
    expect(await screen.findByText("We couldn't get your number's details from WhatsApp. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/ENOTFOUND/)).not.toBeInTheDocument();
  });

  it("falls back to generic copy for a phone error kind this page does not know", async () => {
    status = { ...baseStatus, configured: true, mode: "live", phoneError: "Meta API error (brand_new_kind)", phoneErrorKind: "brand_new_kind" };
    render(<AdminWhatsAppPage />);
    expect(await screen.findByText(/WhatsApp reported a problem we don't recognise/)).toBeInTheDocument();
    expect(screen.queryByText(/brand_new_kind/)).not.toBeInTheDocument();
  });
});

describe("admin WhatsApp Test tab", () => {
  it("sends a sandbox test message from the Test tab", async () => {
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    await waitFor(() => expect(testPosts()).toHaveLength(1));
    expect(postedBody()).toEqual({ to: "+971501234567", templateName: "hello_world", language: "en_US", params: [] });
    expect(await screen.findByText("WhatsApp isn't connected yet, so this test message was recorded but not sent.")).toBeInTheDocument();
  });

  it("shows the reference number after a live send", async () => {
    testResponse = { ok: true, status: 200, body: { outcome: { status: "sent", messageId: "wamid.ABC123" } } };
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText("Sent. Reference number: wamid.ABC123")).toBeInTheDocument();
  });

  it("offers approved templates by name and language, and a zero-variable one needs no parameters", async () => {
    templates = [announcement, hello];
    await openTestTab();
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/admin/whatsapp/templates?status=APPROVED")).toBe(true));
    await userEvent.click(screen.getByRole("combobox", { name: "Message template" }));
    await userEvent.click(await screen.findByRole("option", { name: "hello_world · English (United States)" }));
    expect(screen.queryByRole("textbox", { name: "Blank 1" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    await waitFor(() => expect(testPosts()).toHaveLength(1));
    expect(postedBody()).toEqual({ to: "+971501234567", templateName: "hello_world", language: "en_US", params: [] });
  });

  it("keeps each template name left to right in the list, beside a language name that follows the page direction", async () => {
    templates = [announcement, hello];
    await openTestTab();
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/admin/whatsapp/templates?status=APPROVED")).toBe(true));
    await userEvent.click(screen.getByRole("combobox", { name: "Message template" }));
    const option = await screen.findByRole("option", { name: "hello_world · English (United States)" });
    const name = within(option).getByText("hello_world");
    expect(name.tagName).toBe("BDI");
    expect(name).toHaveAttribute("dir", "ltr");
    expect(option).not.toHaveAttribute("dir");
  });

  it("posts the chosen template's name, language and edited parameters", async () => {
    templates = [announcement, hello];
    await openTestTab();
    await userEvent.click(screen.getByRole("combobox", { name: "Message template" }));
    await userEvent.click(await screen.findByRole("option", { name: "mployedin_admin_announcement · English" }));
    expect(screen.getByRole("textbox", { name: "Blank 1" })).toHaveValue("Admin");
    expect(screen.getByRole("textbox", { name: "Blank 2" })).toHaveValue("Test 2");
    await userEvent.clear(screen.getByRole("textbox", { name: "Blank 2" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Blank 2" }), "Hello there");
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    await waitFor(() => expect(testPosts()).toHaveLength(1));
    expect(postedBody()).toEqual({ to: "+971501234567", templateName: "mployedin_admin_announcement", language: "en", params: ["Admin", "Hello there"] });
  });

  it("still works when the template list cannot be loaded", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST") return Promise.resolve({ ok: true, status: 200, json: async () => ({ outcome: { status: "mock", messageId: "mock-1" } }) });
      if (u.startsWith("/api/admin/whatsapp/status")) return Promise.resolve({ ok: true, json: async () => status });
      return Promise.reject(new Error("network down"));
    });
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText("WhatsApp isn't connected yet, so this test message was recorded but not sent.")).toBeInTheDocument();
  });

  it("maps a Meta rejection to localized copy for its kind and never renders the raw error", async () => {
    testResponse = { ok: false, status: 502, body: { error: "Meta rejected the message: (#132001) Template name does not exist in en_US", errorKind: "template_error" } };
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText(/WhatsApp didn't accept the template or what was filled into its blanks/)).toBeInTheDocument();
    expect(screen.queryByText(/does not exist in en_US/)).not.toBeInTheDocument();
    expect(screen.queryByText(/#132001/)).not.toBeInTheDocument();
  });

  it("uses the generic Meta copy for an unknown error kind", async () => {
    testResponse = { ok: false, status: 502, body: { error: "Meta rejected the message: weird", errorKind: "something_new" } };
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText(/WhatsApp reported a problem we don't recognise/)).toBeInTheDocument();
    expect(screen.queryByText(/weird/)).not.toBeInTheDocument();
  });

  it("explains a 502 with no kind (an invalid number or a network problem) without the raw error", async () => {
    testResponse = { ok: false, status: 502, body: { error: "Meta rejected the message: Recipient phone is not a valid international number" } };
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText(/The message wasn't sent/)).toBeInTheDocument();
    expect(screen.queryByText(/Recipient phone is not a valid/)).not.toBeInTheDocument();
  });

  it("explains a refused send to a number that replied STOP (409 opted_out)", async () => {
    testResponse = { ok: false, status: 409, body: { error: "opted_out" } };
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText("Not sent: this person asked us to stop messaging them on WhatsApp (they replied STOP).")).toBeInTheDocument();
  });

  it("explains a rate limit (429) in the page's own words, not the server's", async () => {
    // A server string that differs from the page copy, so rendering `data.error` would be caught.
    testResponse = { ok: false, status: 429, body: { error: "rate_limit_exceeded: retry after 300s (bucket test-send)" } };
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText("Too many test messages. Please wait a few minutes and try again.")).toBeInTheDocument();
    expect(screen.queryByText(/rate_limit_exceeded/)).not.toBeInTheDocument();
    expect(screen.queryByText(/retry after 300s/)).not.toBeInTheDocument();
  });

  it("says test messages are only recorded while WhatsApp is not connected", async () => {
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Not connected");
    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(screen.getByLabelText(/Phone number, with country code/)).toBeInTheDocument();
    expect(screen.getByText(MOCK_HINT)).toBeInTheDocument();
  });

  it("shows no not-connected hint once WhatsApp is connected", async () => {
    status = { ...baseStatus, configured: true, mode: "live" };
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Connected");
    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(screen.getByLabelText(/Phone number, with country code/)).toBeInTheDocument();
    expect(screen.queryByText(MOCK_HINT)).not.toBeInTheDocument();
  });

  it("shows no not-connected hint while the status is still loading", async () => {
    pendingStatusLoad();
    render(<AdminWhatsAppPage />);
    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(screen.getByLabelText(/Phone number, with country code/)).toBeInTheDocument();
    expect(screen.queryByText(MOCK_HINT)).not.toBeInTheDocument();
  });

  it("shows no not-connected hint after the status failed to load (the mode is unknown)", async () => {
    failedStatusLoad();
    render(<AdminWhatsAppPage />);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Send a test" }));
    expect(screen.getByLabelText(/Phone number, with country code/)).toBeInTheDocument();
    expect(screen.queryByText(MOCK_HINT)).not.toBeInTheDocument();
  });

  it("explains a validation failure (400) without rendering the details", async () => {
    testResponse = { ok: false, status: 400, body: { error: "Validation failed", details: [{ path: "to", message: "String must contain at least 6 character(s)" }] } };
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText(/Check the phone number and the blanks/)).toBeInTheDocument();
    expect(screen.queryByText(/Validation failed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/at least 6/)).not.toBeInTheDocument();
  });

  it("uses the generic error for any other failure", async () => {
    testResponse = { ok: false, status: 500, body: { error: "Internal: mongo exploded" } };
    await openTestTab();
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText("We couldn't send the test message. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/mongo exploded/)).not.toBeInTheDocument();
  });

  it("toasts the generic error when the request itself fails", async () => {
    await openTestTab();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve({ ok: true, json: async () => (String(url).includes("status") ? status : { templates: [] }) });
    });
    await userEvent.click(screen.getByRole("button", { name: "Send test message" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't send the test message. Please try again."));
  });
});
