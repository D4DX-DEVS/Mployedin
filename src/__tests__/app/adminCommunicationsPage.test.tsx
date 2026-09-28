/**
 * @jest-environment jsdom
 */
/**
 * Admin → System → Broadcasts.
 *
 * "Send Now" mailed every user with no confirmation (the audience defaults to
 * all, and Enter in the title field submits), and WhatsApp was selectable
 * although the broadcast worker never delivers it.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminCommunicationsPage from "@/app/[locale]/(dashboard)/admin/communications/page";

const confirm = jest.fn();
jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm, ConfirmDialogNode: null }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Promise.resolve({ ok: true, json: async () => ({ success: true, sent: 411, queued: true }) });
    if (String(url).startsWith("/api/admin/communications/audience")) return Promise.resolve({ ok: true, json: async () => ({ count: 411 }) });
    if (String(url).startsWith("/api/admin/communications")) return Promise.resolve({ ok: true, json: async () => ({ broadcasts: [] }) });
    return Promise.resolve({ ok: true, json: async () => ({ templates: [] }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");

async function fillAndSend() {
  render(<AdminCommunicationsPage />);
  await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Maintenance tonight");
  await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Down 1-2am");
  await userEvent.click(screen.getByRole("button", { name: /send now/i }));
}

describe("broadcast send", () => {
  it("shows the real recipient count and sends nothing when cancelled", async () => {
    confirm.mockResolvedValue(false);
    await fillAndSend();

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0].message).toContain("411 users");
    expect(posts()).toHaveLength(0);
  });

  it("sends once confirmed", async () => {
    confirm.mockResolvedValue(true);
    await fillAndSend();

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(String((posts()[0][1] as RequestInit).body))).toEqual(
      expect.objectContaining({ title: "Maintenance tonight", targetAll: true, channels: ["in_app"] })
    );
  });

  it("shows WhatsApp as coming soon and does not let it be picked", () => {
    render(<AdminCommunicationsPage />);
    const whatsapp = screen.getByRole("button", { name: /whatsapp/i });
    expect(whatsapp).toBeDisabled();
    expect(whatsapp).toHaveTextContent(/coming soon/i);
  });
});
