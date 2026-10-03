/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminCommunicationsPage from "@/app/[locale]/(dashboard)/admin/communications/page";

// Heavy user-event flows (typing, Radix selects): a single test can pass 5 s when the whole suite runs in parallel.
jest.setTimeout(20_000);

const confirm = jest.fn().mockResolvedValue(true);
jest.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm, ConfirmDialogNode: null }) }));
const toastError = jest.fn();
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: (...a: unknown[]) => toastError(...a) } }));

// jsdom lacks the pointer-capture and scrollIntoView calls Radix Select makes when it opens.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

const fetchMock = jest.fn();
let templatesResponse: () => Promise<unknown>;
const announcement = { _id: "t1", name: "mployedin_admin_announcement", language: "en", status: "APPROVED", bodyParamCount: 2, bodyText: "Hi {{1}}, {{2}}" };
const hello = { _id: "t2", name: "hello_world", language: "en_US", status: "APPROVED", bodyParamCount: 0, bodyText: "Hello World" };

beforeEach(() => {
  jest.clearAllMocks();
  confirm.mockResolvedValue(true);
  templatesResponse = () => Promise.resolve({ ok: true, json: async () => ({ templates: [announcement, hello] }) });
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "POST") return Promise.resolve({ ok: true, json: async () => ({ success: true, sent: 3, queued: true }) });
    if (u.startsWith("/api/admin/whatsapp/templates")) return templatesResponse();
    if (u.startsWith("/api/admin/communications/audience")) return Promise.resolve({ ok: true, json: async () => ({ count: 3 }) });
    if (u.startsWith("/api/admin/communications")) return Promise.resolve({ ok: true, json: async () => ({ broadcasts: [] }) });
    return Promise.resolve({ ok: true, json: async () => ({ templates: [] }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
const postedWhatsApp = () => JSON.parse(String((posts()[0][1] as RequestInit).body)).whatsapp;

describe("broadcast WhatsApp channel", () => {
  it("loads approved templates when WhatsApp is selected and refuses to send without one", async () => {
    render(<AdminCommunicationsPage />);
    await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/admin/whatsapp/templates?status=APPROVED"))).toBe(true));
    expect(await screen.findByText("WhatsApp template")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Maintenance");
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Down tonight");
    await userEvent.click(screen.getByRole("button", { name: /send now/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Choose a WhatsApp template before sending."));
    expect(posts()).toHaveLength(0);
  });

  it("posts the template, language and parameters", async () => {
    render(<AdminCommunicationsPage />);
    await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "WhatsApp template" }));
    await userEvent.click(await screen.findByRole("option", { name: "mployedin_admin_announcement · en" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Maintenance");
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Down tonight");
    await userEvent.clear(screen.getByRole("textbox", { name: "Blank 2" }));
    // user-event reads "{{" as one literal "{" and a bare "}" as itself: this types {{message}}.
    await userEvent.type(screen.getByRole("textbox", { name: "Blank 2" }), "{{{{message}}");
    await userEvent.click(screen.getByRole("button", { name: /send now/i }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postedWhatsApp()).toEqual({ templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "{{message}}"] });
  });

  it("posts a zero-variable template with an empty parameter list and no parameter fields", async () => {
    render(<AdminCommunicationsPage />);
    await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "WhatsApp template" }));
    await userEvent.click(await screen.findByRole("option", { name: "hello_world · en_US" }));
    expect(screen.queryByRole("textbox", { name: "Blank 1" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Hi");
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "There");
    await userEvent.click(screen.getByRole("button", { name: /send now/i }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(postedWhatsApp()).toEqual({ templateName: "hello_world", language: "en_US", params: [] });
  });

  it("explains a refusal because WhatsApp is switched off (409 whatsapp_disabled), in fixed copy", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST") return Promise.resolve({ ok: false, status: 409, json: async () => ({ error: "whatsapp_disabled" }) });
      if (u.startsWith("/api/admin/whatsapp/templates")) return templatesResponse();
      if (u.startsWith("/api/admin/communications/audience")) return Promise.resolve({ ok: true, json: async () => ({ count: 3 }) });
      return Promise.resolve({ ok: true, json: async () => ({ broadcasts: [] }) });
    });
    render(<AdminCommunicationsPage />);
    await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "WhatsApp template" }));
    await userEvent.click(await screen.findByRole("option", { name: "hello_world · en_US" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Hi");
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "There");
    await userEvent.click(screen.getByRole("button", { name: /send now/i }));
    const copy = "We couldn't send this broadcast: WhatsApp sending is switched off in the WhatsApp settings. Switch it on there, or send without the WhatsApp channel.";
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(copy));
    expect(screen.queryByText(/whatsapp_disabled/)).not.toBeInTheDocument();
  });

  it("sends no WhatsApp block when the channel is not selected", async () => {
    render(<AdminCommunicationsPage />);
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Hi");
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "There");
    await userEvent.click(screen.getByRole("button", { name: /send now/i }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(String((posts()[0][1] as RequestInit).body))).not.toHaveProperty("whatsapp");
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/admin/whatsapp/templates"))).toBe(false);
  });

  it("tells the admin when the templates could not be loaded, in fixed copy", async () => {
    templatesResponse = () => Promise.resolve({ ok: false, json: async () => ({ error: "mongo exploded at 10.0.0.4" }) });
    render(<AdminCommunicationsPage />);
    await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't load the WhatsApp templates. Please try again."));
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining("mongo"));
    expect(screen.queryByText(/mongo/)).not.toBeInTheDocument();
  });

  describe("template load failure", () => {
    const templateFetches = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/admin/whatsapp/templates")).length;

    it("shows its own error state with a Retry, not the no-approved-templates placeholder", async () => {
      templatesResponse = () => Promise.resolve({ ok: false, json: async () => ({}) });
      render(<AdminCommunicationsPage />);
      await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
      expect(await screen.findByText("We couldn't load the WhatsApp templates")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
      expect(screen.queryByText(/No approved templates yet/)).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "WhatsApp template" })).not.toBeInTheDocument();
    });

    it("Retry fetches the templates again and brings the picker back on success", async () => {
      templatesResponse = () => Promise.resolve({ ok: false, json: async () => ({}) });
      render(<AdminCommunicationsPage />);
      await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
      await screen.findByRole("button", { name: "Try again" });
      expect(templateFetches()).toBe(1);

      templatesResponse = () => Promise.resolve({ ok: true, json: async () => ({ templates: [announcement] }) });
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("combobox", { name: "WhatsApp template" })).toBeInTheDocument();
      expect(templateFetches()).toBe(2);
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });

    it("a failed Retry shows the error state again", async () => {
      templatesResponse = () => Promise.resolve({ ok: false, json: async () => ({}) });
      render(<AdminCommunicationsPage />);
      await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
      await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
      await waitFor(() => expect(templateFetches()).toBe(2));
      expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("an empty approved list still shows the no-approved-templates placeholder", async () => {
      templatesResponse = () => Promise.resolve({ ok: true, json: async () => ({ templates: [] }) });
      render(<AdminCommunicationsPage />);
      await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
      expect(await screen.findByText(/No approved templates yet/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });
  });

  describe("parameters", () => {
    async function pickAnnouncement() {
      render(<AdminCommunicationsPage />);
      await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
      await userEvent.click(await screen.findByRole("combobox", { name: "WhatsApp template" }));
      await userEvent.click(await screen.findByRole("option", { name: "mployedin_admin_announcement · en" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Maintenance");
      await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Down tonight");
    }

    it("blocks sending, with a hint, while a blank is empty", async () => {
      await pickAnnouncement();
      const send = screen.getByRole("button", { name: /send now/i });
      expect(send).toBeEnabled();
      await userEvent.clear(screen.getByRole("textbox", { name: "Blank 2" }));
      expect(send).toBeDisabled();
      expect(screen.getByText("Fill in every WhatsApp blank before sending.")).toBeInTheDocument();
      await userEvent.click(send);
      expect(posts()).toHaveLength(0);
      expect(confirm).not.toHaveBeenCalled();
    });

    it("treats a whitespace-only blank as empty, and sends again once it is filled", async () => {
      await pickAnnouncement();
      await userEvent.clear(screen.getByRole("textbox", { name: "Blank 2" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Blank 2" }), "   ");
      expect(screen.getByRole("button", { name: /send now/i })).toBeDisabled();
      await userEvent.type(screen.getByRole("textbox", { name: "Blank 2" }), "ok");
      expect(screen.getByRole("button", { name: /send now/i })).toBeEnabled();
      expect(screen.queryByText("Fill in every WhatsApp blank before sending.")).not.toBeInTheDocument();
    });

    it("never blocks a template with no blanks", async () => {
      render(<AdminCommunicationsPage />);
      await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
      await userEvent.click(await screen.findByRole("combobox", { name: "WhatsApp template" }));
      await userEvent.click(await screen.findByRole("option", { name: "hello_world · en_US" }));
      expect(screen.getByRole("button", { name: /send now/i })).toBeEnabled();
    });

    it("warns about the 1,024-character limit only while a blank uses the message placeholder", async () => {
      await pickAnnouncement();
      const note = /Each WhatsApp blank is limited to 1,024 characters/;
      expect(screen.getByText(note)).toBeInTheDocument();
      await userEvent.clear(screen.getByRole("textbox", { name: "Blank 2" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Blank 2" }), "fixed text");
      expect(screen.queryByText(note)).not.toBeInTheDocument();
    });
  });

  it("describes what WhatsApp sends, and drops the same-body claim, only while the channel is selected", async () => {
    render(<AdminCommunicationsPage />);
    expect(screen.getByText("Every selected channel receives the same message body.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(screen.queryByText("Every selected channel receives the same message body.")).not.toBeInTheDocument();
    expect(screen.getByText(/WhatsApp sends the approved template you choose/)).toBeInTheDocument();
  });
});
