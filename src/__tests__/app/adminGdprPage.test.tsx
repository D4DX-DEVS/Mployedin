/**
 * @jest-environment jsdom
 */
/**
 * Admin → System → GDPR / Data Privacy.
 *
 * Completed and rejected are terminal states (GDPR_REQUEST_TRANSITIONS), and
 * both were one click from a row menu with no confirmation. The Retention tab
 * rendered six hardcoded "auto-delete" policies that no job enforces.
 *
 * Finished requests had an empty Actions cell and no way to open them, so the
 * reason a user gave for deleting their account was never shown to anyone.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminGdprPage from "@/app/[locale]/(dashboard)/admin/gdpr/page";

let mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => mockSearchParams,
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

// Row menus are Radix dropdowns; render quick buttons and menu items alike as
// plain buttons.
type MockAction = { key: string; label: string; onSelect: () => void };
jest.mock("@/components/shared/RowActions", () => ({
  RowActions: ({ quick = [], menu = [] }: { quick?: MockAction[]; menu?: MockAction[] }) => (
    <div>
      {[...quick, ...menu].map((item) => (
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
  requestType: "delete",
  status: "pending",
  createdAt: "2026-09-01T10:00:00Z",
  notes: "Moving abroad",
  handledByName: null,
};
const inProgress = {
  ...pending,
  _id: "64d000000000000000000005",
  status: "in_progress",
  notes: undefined,
  handledByName: "Super Admin",
};
const exported = {
  ...pending,
  _id: "64d000000000000000000006",
  userName: "Omar Khan",
  userEmail: "omar@example.com",
  requestType: "export",
  status: "completed",
  completedAt: "2026-09-01T10:00:01Z",
  notes: undefined,
};

const fetchMock = jest.fn();
let avgResponseMs: number | null = 30 * 60 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  avgResponseMs = 30 * 60 * 60 * 1000;
  window.history.replaceState(null, "", "/en/admin/gdpr");
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Promise.resolve({ ok: true, json: async () => ({}) });
    if (String(url).startsWith("/api/admin/gdpr?")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [pending, inProgress, exported],
          total: 3,
          stats: {
            totalRequests: 3,
            pendingRequests: 2,
            completedRequests: 1,
            avgResponseMs,
            dataSubjects: 3,
            activeConsents: 0,
          },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ items: [], total: 0 }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
const listCalls = () => fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/admin/gdpr?"));

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

  it("labels request types in words, not raw codes", async () => {
    render(<AdminGdprPage />);
    await screen.findByText("Omar Khan");

    expect(screen.getByText("Data Export")).toBeInTheDocument();
    expect(screen.getAllByText("Erasure")).toHaveLength(2);
    expect(screen.queryByText("export")).not.toBeInTheDocument();
  });

  it("offers View on every row, finished ones included", async () => {
    render(<AdminGdprPage />);
    await screen.findByText("Omar Khan");

    expect(screen.getAllByRole("button", { name: "View" })).toHaveLength(3);
  });

  it("View shows the reason the user gave, and the request can be acted on from there", async () => {
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await userEvent.click(screen.getAllByRole("button", { name: "View" })[0]);
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Moving abroad")).toBeInTheDocument();
    expect(within(dialog).getByText("sara@example.com")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(JSON.parse(String((patchCalls()[0][1] as RequestInit).body))).toEqual({ status: "in_progress" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("marks an export as self-service, with nothing for an admin to do", async () => {
    render(<AdminGdprPage />);
    await screen.findByText("Omar Khan");

    await userEvent.click(screen.getAllByRole("button", { name: "View" })[2]);
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Self-service")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    // An export has no reason to show.
    expect(within(dialog).queryByText(/no reason given/i)).not.toBeInTheDocument();
  });

  it("shows dates to the minute, without seconds", async () => {
    render(<AdminGdprPage />);
    await screen.findByText("Omar Khan");

    await userEvent.click(screen.getAllByRole("button", { name: "View" })[2]);
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getAllByText(/2026/)[0].textContent).not.toMatch(/\d:\d\d:\d\d/);
  });

  it("shows who handled a request", async () => {
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await userEvent.click(screen.getAllByRole("button", { name: "View" })[1]);
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Super Admin")).toBeInTheDocument();
    expect(within(dialog).getByText(/no reason given/i)).toBeInTheDocument();
  });

  it("keeps a Cancelled status filter that arrives in the link", async () => {
    mockSearchParams = new URLSearchParams("status=cancelled");
    window.history.replaceState(null, "", "/en/admin/gdpr?status=cancelled");
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await waitFor(() => expect(listCalls().at(-1)).toContain("status=cancelled"));
  });

  it("shows the average response time in readable units", async () => {
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    expect(screen.getByText("1.3 days")).toBeInTheDocument();
  });

  it("says 1 day, not 1 days", async () => {
    avgResponseMs = 24 * 60 * 60 * 1000;
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    expect(screen.getByText("1 day")).toBeInTheDocument();
  });

  it("Complete from the details asks first; cancelling leaves the details open and sends nothing", async () => {
    confirm.mockResolvedValue(false);
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await userEvent.click(screen.getAllByRole("button", { name: "View" })[1]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Complete" }));

    // A deletion: the destructive warning, not the plain one.
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect(patchCalls()).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Complete from the details saves once confirmed, then closes them", async () => {
    confirm.mockResolvedValue(true);
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await userEvent.click(screen.getAllByRole("button", { name: "View" })[1]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Complete" }));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(String(patchCalls()[0][0])).toContain(inProgress._id);
    expect(JSON.parse(String((patchCalls()[0][1] as RequestInit).body))).toEqual({ status: "completed" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the details open when saving fails", async () => {
    confirm.mockResolvedValue(true);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve({ ok: true, json: async () => ({ items: [pending, inProgress, exported], total: 3 }) });
    });
    render(<AdminGdprPage />);
    await screen.findAllByText("Sara Ahmed");

    await userEvent.click(screen.getAllByRole("button", { name: "View" })[0]);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
