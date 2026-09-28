/**
 * @jest-environment jsdom
 */
/**
 * Admin → System → GDPR / Data Privacy.
 *
 * Completed and rejected are terminal states (GDPR_REQUEST_TRANSITIONS), and
 * both were one click from a row menu with no confirmation. The Retention tab
 * rendered six hardcoded "auto-delete" policies that no job enforces.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminGdprPage from "@/app/[locale]/(dashboard)/admin/gdpr/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/en/admin/gdpr",
}));

const paginationState = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
  paginationParams: () => new URLSearchParams({ page: "1", limit: "10" }),
};
jest.mock("@/hooks/usePagination", () => ({ usePagination: () => paginationState }));

const confirm = jest.fn();
jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm, ConfirmDialogNode: null }),
}));

// Row menus are Radix dropdowns; render their items as plain buttons.
jest.mock("@/components/shared/RowActions", () => ({
  RowActions: ({ menu = [] }: { menu?: Array<{ key: string; label: string; onSelect: () => void }> }) => (
    <div>
      {menu.map((item) => (
        <button key={item.key} type="button" onClick={item.onSelect}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("@/components/shared/PaginationControls", () => ({ PaginationControls: () => null }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const pending = {
  _id: "64d000000000000000000002",
  userId: "64d000000000000000000003",
  userName: "Sara Ahmed",
  userEmail: "sara@example.com",
  requestType: "rectification",
  status: "pending",
  createdAt: "2026-09-01T10:00:00Z",
};
const inProgress = { ...pending, _id: "64d000000000000000000005", status: "in_progress" };

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Promise.resolve({ ok: true, json: async () => ({}) });
    if (String(url).startsWith("/api/admin/gdpr?")) {
      return Promise.resolve({ ok: true, json: async () => ({ items: [pending, inProgress], total: 2 }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ items: [], total: 0 }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");

describe("admin GDPR page", () => {
  it("has no hardcoded retention-policy tab", async () => {
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");
    expect(screen.queryByRole("button", { name: /retention/i })).not.toBeInTheDocument();
  });

  it("asks before rejecting, and a cancel sends nothing", async () => {
    confirm.mockResolvedValue(false);
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", message: expect.stringContaining("Sara Ahmed") })
    );
    expect(patchCalls()).toHaveLength(0);
  });

  it("asks before completing, then saves once confirmed", async () => {
    confirm.mockResolvedValue(true);
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await userEvent.click(screen.getByRole("button", { name: "Complete" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(JSON.parse(String((patchCalls()[0][1] as RequestInit).body))).toEqual({ status: "completed" });
  });

  it("starts a request without a prompt (not a final state)", async () => {
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
  });
});
