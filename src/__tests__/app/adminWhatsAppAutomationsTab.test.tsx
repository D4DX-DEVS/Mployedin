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
import { TemplatesTab } from "@/app/[locale]/(dashboard)/admin/settings/whatsapp/_components/TemplatesTab";

// Heavy user-event flows (typing, Radix selects): a single test can pass 5 s when the whole suite runs in parallel.
jest.setTimeout(20_000);

// jsdom lacks the pointer-capture and scrollIntoView calls Radix Select makes when it opens.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

const CONFIG_URL = "/api/admin/whatsapp/config";
const LIST_URL = "/api/admin/whatsapp/templates";
const APPROVED_URL = "/api/admin/whatsapp/templates?status=APPROVED";
const SYNC_URL = "/api/admin/whatsapp/templates/sync";

const automation = (templateName: string) => ({ enabled: true, templateName, params: ["{{firstName}}", "{{message}}"] });
const config = {
  enabled: true,
  dailyCapPerUser: 3,
  automations: {
    applicationReceived: automation("mployedin_application_received"),
    applicationStatus: automation("mployedin_application_status"),
    interviewInvite: automation("mployedin_interview_invite"),
    interviewScheduled: automation("mployedin_interview_scheduled"),
    interviewReminder: automation("mployedin_interview_reminder"),
    offerUpdate: automation("mployedin_offer_update"),
    commissionPaid: automation("mployedin_commission_paid"),
  },
};
const baseTemplates = [
  { _id: "t1", name: "mployedin_application_received", language: "en", category: "UTILITY", status: "APPROVED", bodyText: "Hi {{1}}, {{2}}", bodyParamCount: 2, qualityScore: "GREEN", lastSyncedAt: "2026-09-29T10:00:00.000Z" },
  { _id: "t2", name: "mployedin_application_received", language: "ar", category: "UTILITY", status: "PENDING", bodyText: "مرحباً {{1}}، {{2}}", bodyParamCount: 2, lastSyncedAt: "2026-09-29T10:00:00.000Z" },
];
const tpl = (name: string, language: string, bodyParamCount: number, status = "APPROVED") => ({
  _id: `${name}-${language}`, name, language, category: "UTILITY", status, bodyText: "Body", bodyParamCount, lastSyncedAt: "2026-09-29T10:00:00.000Z",
});
const mockStatus = { configured: false, mode: "mock", enabled: true, phone: null, phoneError: null, last24h: { sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, mock: 0 }, skipReasons: [] };
const liveStatus = { ...mockStatus, configured: true, mode: "live" };

const reply = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

type Route = "status" | "configGet" | "configPatch" | "approved" | "list" | "sync";
let templates: unknown[];
let status: unknown;
let overrides: Partial<Record<Route, () => Promise<unknown>>>;
const fetchMock = jest.fn();
const toastError = jest.requireMock("sonner").toast.error as jest.Mock;
const toastSuccess = jest.requireMock("sonner").toast.success as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  templates = baseTemplates;
  status = mockStatus;
  overrides = {};
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    const route = (name: Route, fallback: () => Promise<unknown>) => (overrides[name] ?? fallback)();
    if (u === CONFIG_URL && init?.method === "PATCH") return route("configPatch", () => reply(200, { config: { ...config, ...JSON.parse(String(init.body)) }, mode: "mock" }));
    if (u === CONFIG_URL) return route("configGet", () => reply(200, { config, mode: "mock" }));
    if (u === SYNC_URL && init?.method === "POST") return route("sync", () => reply(200, { result: { total: 2, upserted: 2, retired: 0 } }));
    if (u.startsWith(APPROVED_URL)) return route("approved", () => reply(200, { templates: (templates as Array<{ status: string }>).filter((x) => x.status === "APPROVED") }));
    if (u === LIST_URL) return route("list", () => reply(200, { templates }));
    if (u.startsWith("/api/admin/whatsapp/status")) return route("status", () => reply(200, status));
    return reply(200, {});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const patchCalls = () => fetchMock.mock.calls.filter(([u, init]) => u === CONFIG_URL && (init as RequestInit | undefined)?.method === "PATCH") as Array<[string, RequestInit]>;
const patched = () => JSON.parse(String(patchCalls()[0][1].body));
const getCalls = (url: string) => fetchMock.mock.calls.filter(([u, init]) => u === url && !(init as RequestInit | undefined)?.method);
const saveButton = () => screen.getByRole("button", { name: "Save changes" });
const SAVE_BLOCKED = "You can't save yet: a switched-on message has a problem with its blanks, shown in its row.";
const row = (label: string) => screen.getByRole("group", { name: label });

async function openAutomations(waitForRows = true) {
  render(<AdminWhatsAppPage />);
  await screen.findAllByText("Not connected");
  await userEvent.click(screen.getByRole("button", { name: "Automatic messages" }));
  if (waitForRows) await screen.findByRole("heading", { name: "Automatic messages" });
}

async function openTemplates(statusLabel = "Not connected") {
  render(<AdminWhatsAppPage />);
  await screen.findAllByText(statusLabel);
  await userEvent.click(screen.getByRole("button", { name: "Message templates" }));
}

describe("admin WhatsApp automations tab", () => {
  it("saves the master switch and the daily cap, and no automation it did not touch", async () => {
    await openAutomations();
    expect(screen.getByText("Application received")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
    // The cap counts per phone number (accounts sharing a number share it), and the copy says so.
    expect(screen.getByText(/one phone number can get in 24 hours/)).toBeInTheDocument();
    const cap = screen.getByLabelText("Most messages per phone number per day");
    await userEvent.clear(cap);
    await userEvent.type(cap, "5");
    await userEvent.click(saveButton());

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patched()).toEqual({ enabled: false, dailyCapPerUser: 5 });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved"));
  });

  describe("Save sends only what changed", () => {
    it("is disabled while nothing has changed", async () => {
      await openAutomations();
      expect(saveButton()).toBeDisabled();
      await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
      expect(saveButton()).toBeEnabled();
      // Back to what was loaded: nothing to save again.
      await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
      expect(saveButton()).toBeDisabled();
    });

    it("a cap-only change leaves the master switch out, so a stale tab cannot turn the kill switch back on", async () => {
      await openAutomations();
      const cap = screen.getByLabelText("Most messages per phone number per day");
      await userEvent.clear(cap);
      await userEvent.type(cap, "7");
      await userEvent.click(saveButton());
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      expect(patched()).toEqual({ dailyCapPerUser: 7 });
    });

    it("sends a changed automation as its whole object, and only that one", async () => {
      await openAutomations();
      await userEvent.click(within(row("Offer update")).getByRole("switch"));
      await userEvent.click(saveButton());
      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      expect(patched()).toEqual({ automations: { offerUpdate: { enabled: false, templateName: "mployedin_offer_update", params: ["{{firstName}}", "{{message}}"] } } });
    });

    it("compares the next save with what the server saved, not with the first load", async () => {
      await openAutomations();
      await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
      await userEvent.click(saveButton());
      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved"));
      await waitFor(() => expect(saveButton()).toBeDisabled());
      const cap = screen.getByLabelText("Most messages per phone number per day");
      await userEvent.clear(cap);
      await userEvent.type(cap, "4");
      await userEvent.click(saveButton());
      await waitFor(() => expect(patchCalls()).toHaveLength(2));
      expect(JSON.parse(String(patchCalls()[1][1].body))).toEqual({ dailyCapPerUser: 4 });
    });
  });

  it("holds the daily cap as typed and blocks Save until it is a whole number from 1 to 20", async () => {
    await openAutomations();
    const cap = screen.getByLabelText("Most messages per phone number per day");
    await userEvent.clear(cap);
    expect(saveButton()).toBeDisabled();
    expect(cap).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(cap, "25");
    expect(saveButton()).toBeDisabled();
    await userEvent.clear(cap);
    await userEvent.type(cap, "0");
    expect(saveButton()).toBeDisabled();
    await userEvent.clear(cap);
    await userEvent.type(cap, "20");
    expect(saveButton()).toBeEnabled();
    expect(cap).not.toHaveAttribute("aria-invalid", "true");
    await userEvent.click(saveButton());
    await waitFor(() => expect(patched().dailyCapPerUser).toBe(20));
  });

  it("flags a template that takes no variables and lets the admin match it, saving an empty list", async () => {
    templates = [...baseTemplates, tpl("mployedin_commission_paid", "en", 0)];
    await openAutomations();
    const commission = row("Commission paid");
    expect(within(commission).getByText(/has 0 blanks, but this message fills in 2/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await userEvent.click(within(commission).getByRole("button", { name: "Use the template's number of blanks" }));
    expect(within(commission).queryByText(/has 0 blanks/)).not.toBeInTheDocument();
    expect(within(commission).getByText("This template has no blanks to fill in.")).toBeInTheDocument();
    expect(within(commission).queryByRole("textbox")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await userEvent.click(saveButton());
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patched().automations.commissionPaid).toEqual({ enabled: true, templateName: "mployedin_commission_paid", params: [] });
    // The other automations were not touched, so they are not sent.
    expect(Object.keys(patched().automations)).toEqual(["commissionPaid"]);
  });

  it("resizes the parameter list to the picked template, down to none and up to more", async () => {
    templates = [...baseTemplates, tpl("hello_world", "en_US", 0), tpl("three_vars", "en", 3)];
    await openAutomations();
    const received = row("Application received");

    await userEvent.click(within(received).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "hello_world" }));
    expect(within(received).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(received).getByText("This template has no blanks to fill in.")).toBeInTheDocument();

    await userEvent.click(within(received).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "three_vars" }));
    const boxes = within(received).getAllByRole("textbox");
    expect(boxes.map((b) => (b as HTMLInputElement).value)).toEqual(["{{firstName}}", "{{message}}", ""]);

    // The new third slot is empty: WhatsApp rejects that, so Save waits until it is filled, and says why.
    expect(within(received).getByText("Fill in every blank. WhatsApp won't send a message with an empty blank.")).toBeInTheDocument();
    expect(boxes[2]).toHaveAttribute("aria-invalid", "true");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(SAVE_BLOCKED)).toBeInTheDocument();
    await userEvent.type(boxes[2], "   ");
    expect(saveButton()).toBeDisabled();
    await userEvent.clear(boxes[2]);
    await userEvent.type(boxes[2], "{{{{title}}");
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText(SAVE_BLOCKED)).not.toBeInTheDocument();
    expect(within(received).queryByText("Fill in every blank. WhatsApp won't send a message with an empty blank.")).not.toBeInTheDocument();

    await userEvent.click(saveButton());
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patched().automations.applicationReceived).toEqual({ enabled: true, templateName: "three_vars", params: ["{{firstName}}", "{{message}}", "{{title}}"] });
  });

  it("lets a switched-off automation keep an empty parameter without holding back Save", async () => {
    templates = [...baseTemplates, tpl("three_vars", "en", 3)];
    await openAutomations();
    const received = row("Application received");
    await userEvent.click(within(received).getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "three_vars" }));
    expect(saveButton()).toBeDisabled();
    await userEvent.click(within(received).getByRole("switch"));
    expect(within(received).getByText("Fill in every blank. WhatsApp won't send a message with an empty blank.")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("blocks Save for an empty parameter typed into a switched-on automation", async () => {
    await openAutomations();
    await userEvent.clear(within(row("Offer update")).getByRole("textbox", { name: "Offer update · Blank 2" }));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(SAVE_BLOCKED)).toBeInTheDocument();
  });

  describe("the master switch can always be turned off", () => {
    /** A stored config whose switched-on automation has an empty parameter: Save is blocked from the moment it loads. */
    const withBlankParam = (enabled: boolean) => () =>
      reply(200, { config: { ...config, enabled, automations: { ...config.automations, offerUpdate: { ...config.automations.offerUpdate, params: ["{{firstName}}", ""] } } }, mode: "mock" });

    it("saves a change that is only the master switch going off, though an automation has a parameter problem", async () => {
      overrides.configGet = withBlankParam(true);
      await openAutomations();
      expect(saveButton()).toBeDisabled();
      expect(screen.getByText(SAVE_BLOCKED)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
      expect(saveButton()).toBeEnabled();
      // Save is available now, so the page does not claim it is not.
      expect(screen.queryByText(SAVE_BLOCKED)).not.toBeInTheDocument();
      await userEvent.click(saveButton());

      await waitFor(() => expect(patchCalls()).toHaveLength(1));
      expect(patched()).toEqual({ enabled: false });
    });

    it("still holds back a save that does more than turn the switch off", async () => {
      overrides.configGet = withBlankParam(true);
      await openAutomations();
      await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
      const cap = screen.getByLabelText("Most messages per phone number per day");
      await userEvent.clear(cap);
      await userEvent.type(cap, "7");
      expect(saveButton()).toBeDisabled();
      expect(screen.getByText(SAVE_BLOCKED)).toBeInTheDocument();
    });

    it("does not exempt turning the switch on", async () => {
      overrides.configGet = withBlankParam(false);
      await openAutomations();
      await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
      expect(saveButton()).toBeDisabled();
      expect(screen.getByText(SAVE_BLOCKED)).toBeInTheDocument();
    });
  });

  it("keeps the edited parameter values", async () => {
    await openAutomations();
    const received = row("Application received");
    const second = within(received).getByRole("textbox", { name: "Application received · Blank 2" });
    await userEvent.clear(second);
    await userEvent.type(second, "{{{{title}}");
    await userEvent.click(saveButton());
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patched().automations.applicationReceived.params).toEqual(["{{firstName}}", "{{title}}"]);
  });

  it("says a template is not approved only once the approved list has loaded", async () => {
    await openAutomations();
    // Six of the seven defaults have no approved row in the fixture.
    expect(screen.getAllByText("WhatsApp hasn't approved this template in any language yet.")).toHaveLength(6);
    expect(within(row("Application received")).queryByText("WhatsApp hasn't approved this template in any language yet.")).not.toBeInTheDocument();
  });

  it("makes no 'not approved' claim and skips the count check when the template list cannot be loaded, and can retry", async () => {
    templates = [...baseTemplates, tpl("mployedin_commission_paid", "en", 0)];
    overrides.approved = () => reply(500, { error: "boom: ECONNREFUSED" });
    await openAutomations();
    expect(await screen.findByText("We couldn't load the templates. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("WhatsApp hasn't approved this template in any language yet.")).not.toBeInTheDocument();
    expect(screen.queryByText(/but this message fills in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
    // The current template stays visible in the select, and Save still works on what is known.
    expect(within(row("Offer update")).getByRole("combobox")).toHaveTextContent("mployedin_offer_update");
    await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
    expect(saveButton()).toBeEnabled();

    delete overrides.approved;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("We couldn't load the templates. Please try again.")).not.toBeInTheDocument());
    expect(within(row("Commission paid")).getByText(/has 0 blanks, but this message fills in 2/)).toBeInTheDocument();
    expect(screen.getAllByText("WhatsApp hasn't approved this template in any language yet.")).toHaveLength(5);
  });

  it("does not let an unrelated template-list retry discard unsaved edits", async () => {
    overrides.approved = () => reply(500, {});
    await openAutomations();
    await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
    await screen.findByText("We couldn't load the templates. Please try again.");
    delete overrides.approved;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("We couldn't load the templates. Please try again.")).not.toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Send WhatsApp messages" })).toHaveAttribute("aria-checked", "false");
  });

  it("flags a template whose approved languages disagree on the parameter count and blocks Save while it is enabled", async () => {
    templates = [...baseTemplates, tpl("mployedin_offer_update", "en", 2), tpl("mployedin_offer_update", "ar", 1)];
    await openAutomations();
    const offer = row("Offer update");
    expect(within(offer).getByText(/different number of blanks in each language/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    // A disabled automation never sends, so it no longer stops the other settings from saving.
    await userEvent.click(within(offer).getByRole("switch"));
    expect(within(offer).getByText(/different number of blanks in each language/)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("shows the error state, not editable defaults, when the server cannot read the settings (503)", async () => {
    overrides.configGet = () => reply(503, { error: "Service unavailable" });
    await openAutomations(false);
    expect(await screen.findByText("We couldn't load this")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Send WhatsApp messages" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("tells the admin when the settings could not be loaded, offers a retry and never renders the failure", async () => {
    overrides.configGet = () => reply(500, { error: "boom: connect ECONNREFUSED" });
    await openAutomations(false);
    expect(await screen.findByText("We couldn't load this")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("We couldn't load the WhatsApp settings. Please try again.");
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Automatic messages" })).not.toBeInTheDocument();

    delete overrides.configGet;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Automatic messages" })).toBeInTheDocument();
  });

  it.each([
    [500, { error: "Internal: mongo exploded" }, "We couldn't save the WhatsApp settings. Please try again."],
    [403, { error: "Forbidden" }, "We couldn't save the WhatsApp settings. Please try again."],
    [400, { error: "Validation failed", details: [{ path: "automations.offerUpdate.params", message: "Too big" }] }, "We couldn't save the settings. Check the daily limit and the blanks, then try again."],
  ])("maps a %i save failure to its own copy and never shows the server text", async (code, body, copy) => {
    overrides.configPatch = () => reply(code, body);
    await openAutomations();
    await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
    await userEvent.click(saveButton());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(copy));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(saveButton()).toBeEnabled();
  });

  it("toasts the generic save error when the request itself fails", async () => {
    overrides.configPatch = () => Promise.reject(new TypeError("Failed to fetch"));
    await openAutomations();
    await userEvent.click(screen.getByRole("switch", { name: "Send WhatsApp messages" }));
    await userEvent.click(saveButton());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't save the WhatsApp settings. Please try again."));
  });
});

describe("admin WhatsApp templates tab", () => {
  it("lists synced templates and disables Sync while WhatsApp is not connected", async () => {
    await openTemplates();
    expect(await screen.findByRole("heading", { name: "Message templates" })).toBeInTheDocument();
    expect(screen.getByText(/Message formats WhatsApp must approve before we can send them/)).toBeInTheDocument();
    expect(await screen.findByText("Waiting for WhatsApp to approve")).toBeInTheDocument();
    expect(screen.getAllByText("mployedin_application_received").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Sync templates from WhatsApp" })).toBeDisabled();
    expect(screen.getByText("You can sync templates once WhatsApp is connected.")).toBeInTheDocument();
  });

  it("shows each language of a template as its own row, with its parameter count", async () => {
    templates = [...baseTemplates, tpl("hello_world", "en_US", 0)];
    await openTemplates();
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Approved")).toBeInTheDocument();
    expect(within(rows[0]).getByText("English")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Service update")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Good (green)")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Waiting for WhatsApp to approve")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Arabic")).toBeInTheDocument();
    expect(within(rows[2]).getByText("English (United States)")).toBeInTheDocument();
    // Meta's uppercase codes are never shown raw.
    expect(within(table).queryByText(/^(APPROVED|PENDING|UTILITY|GREEN)$/)).not.toBeInTheDocument();
    // Zero variables is a real value, not a blank.
    expect(within(rows[2]).getByText("0")).toBeInTheDocument();
  });

  it("lists the starter templates to create in Business Manager", async () => {
    await openTemplates();
    expect(await screen.findByText("Templates to create in Meta Business Manager")).toBeInTheDocument();
    expect(screen.getByText("mployedin_admin_announcement")).toBeInTheDocument();
    expect(screen.getByText("mployedin_commission_paid")).toBeInTheDocument();
  });

  it("names Meta's category beside the plain one on each starter card, since that is the choice the admin makes in Meta Business Manager", async () => {
    await openTemplates();
    await screen.findByText("Templates to create in Meta Business Manager");
    const card = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
    expect(within(card("mployedin_commission_paid")).getByText("Service update (choose “Utility” in Meta Business Manager)")).toBeInTheDocument();
    expect(within(card("mployedin_admin_announcement")).getByText("Marketing (choose “Marketing” in Meta Business Manager)")).toBeInTheDocument();
    // The synced table keeps the plain name alone: Meta's name matters only where the admin creates the template.
    const table = await screen.findByRole("table");
    expect(within(table).queryByText(/choose “/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\(choose “/)).toHaveLength(8);
  });

  it("shows an empty state, not a failure, when nothing has been synced", async () => {
    templates = [];
    await openTemplates();
    expect(await screen.findByText("No templates yet. Create them in Meta Business Manager, then sync them here.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a failure with a retry, not 'no templates', when the list cannot be loaded", async () => {
    overrides.list = () => reply(500, { error: "boom: ECONNREFUSED" });
    await openTemplates();
    expect(await screen.findByText("We couldn't load this")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("We couldn't load the templates. Please try again.");
    expect(screen.queryByText("No templates yet. Create them in Meta Business Manager, then sync them here.")).not.toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();

    delete overrides.list;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Waiting for WhatsApp to approve")).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load this")).not.toBeInTheDocument();
  });

  it("syncs on a live server, then reloads the list", async () => {
    status = liveStatus;
    await openTemplates("Connected");
    await screen.findByText("Waiting for WhatsApp to approve");
    expect(screen.queryByText("You can sync templates once WhatsApp is connected.")).not.toBeInTheDocument();
    const sync = screen.getByRole("button", { name: "Sync templates from WhatsApp" });
    expect(sync).toBeEnabled();

    templates = [...baseTemplates, tpl("hello_world", "en_US", 0)];
    await userEvent.click(sync);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Synced 2 templates from WhatsApp."));
    expect(fetchMock).toHaveBeenCalledWith(SYNC_URL, { method: "POST" });
    await waitFor(() => expect(getCalls(LIST_URL)).toHaveLength(2));
    expect(await screen.findByText("hello_world")).toBeInTheDocument();
  });

  it.each([
    [409, { error: "WhatsApp is not configured on this server (WHATSAPP_* env vars)" }, "We couldn't sync templates because WhatsApp isn't fully connected yet. Ask your technical team to finish connecting it."],
    [409, { error: "Template sync needs WHATSAPP_BUSINESS_ACCOUNT_ID, which is not set on this server" }, "We couldn't sync templates because WhatsApp isn't fully connected yet. Ask your technical team to finish connecting it."],
    [502, { error: "Meta rejected the template sync: (#190) Invalid OAuth access token EAAB123" }, "WhatsApp didn't accept the template sync. Please try again, or ask your technical team to check the WhatsApp connection."],
    [500, { error: "We couldn't sync the templates. Please try again." }, "We couldn't sync templates from WhatsApp. Please try again."],
    [400, { error: "Validation failed", details: [{ message: "bad" }] }, "We couldn't sync templates from WhatsApp. Please try again."],
  ])("maps a %i sync failure to its own copy and never shows the server text", async (code, body, copy) => {
    status = liveStatus;
    overrides.sync = () => reply(code, body);
    await openTemplates("Connected");
    await screen.findByText("Waiting for WhatsApp to approve");
    await userEvent.click(screen.getByRole("button", { name: "Sync templates from WhatsApp" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(copy));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/EAAB123|WHATSAPP_/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync templates from WhatsApp" })).toBeEnabled();
  });

  it("toasts the generic sync error when the request itself fails", async () => {
    status = liveStatus;
    overrides.sync = () => Promise.reject(new TypeError("Failed to fetch"));
    await openTemplates("Connected");
    await screen.findByText("Waiting for WhatsApp to approve");
    await userEvent.click(screen.getByRole("button", { name: "Sync templates from WhatsApp" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't sync templates from WhatsApp. Please try again."));
  });

  it("treats a 200 with no result as a failed sync", async () => {
    status = liveStatus;
    overrides.sync = () => reply(200, {});
    await openTemplates("Connected");
    await screen.findByText("Waiting for WhatsApp to approve");
    await userEvent.click(screen.getByRole("button", { name: "Sync templates from WhatsApp" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't sync templates from WhatsApp. Please try again."));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  describe("when the mode is not known", () => {
    it("disables Sync and shows no not-connected hint while the status is still loading", async () => {
      overrides.status = () => new Promise(() => {});
      render(<AdminWhatsAppPage />);
      await userEvent.click(screen.getByRole("button", { name: "Message templates" }));
      expect(await screen.findByText("Waiting for WhatsApp to approve")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sync templates from WhatsApp" })).toBeDisabled();
      expect(screen.queryByText("You can sync templates once WhatsApp is connected.")).not.toBeInTheDocument();
    });

    it("disables Sync and shows no not-connected hint after the status failed to load", async () => {
      overrides.status = () => reply(500, { error: "boom" });
      render(<AdminWhatsAppPage />);
      await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't load the WhatsApp settings. Please try again."));
      await userEvent.click(screen.getByRole("button", { name: "Message templates" }));
      expect(await screen.findByText("Waiting for WhatsApp to approve")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sync templates from WhatsApp" })).toBeDisabled();
      expect(screen.queryByText("You can sync templates once WhatsApp is connected.")).not.toBeInTheDocument();
    });

    it("treats an omitted mode prop as unknown", async () => {
      render(<TemplatesTab />);
      expect(await screen.findByText("Waiting for WhatsApp to approve")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sync templates from WhatsApp" })).toBeDisabled();
      expect(screen.queryByText("You can sync templates once WhatsApp is connected.")).not.toBeInTheDocument();
    });

    it("still shows the hint while not connected and enables Sync once connected", async () => {
      const { unmount } = render(<TemplatesTab mode="mock" />);
      expect(await screen.findByText("You can sync templates once WhatsApp is connected.")).toBeInTheDocument();
      unmount();
      render(<TemplatesTab mode="live" />);
      expect(await screen.findByText("Waiting for WhatsApp to approve")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sync templates from WhatsApp" })).toBeEnabled();
    });
  });
});
