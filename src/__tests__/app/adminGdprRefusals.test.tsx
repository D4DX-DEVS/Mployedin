/**
 * @jest-environment jsdom
 */
/**
 * Admin → GDPR → Data Requests: refusing a request an admin already started,
 * and the date a refusal was decided (UK GDPR Art 12(3)/(4)).
 *
 * A started (in progress) request used to offer only Complete; for a deletion
 * that is the irreversible erasure, so a request found to be exempt or
 * unverifiable after Start could not be answered at all. It now offers Reject
 * too, through the same form (a reason is required).
 *
 * A refusal's decision date is stored in `completedAt` (the model documents
 * it), so the list, the details and the average response time show it.
 *
 * Also: a list that could not be loaded says so with Retry, instead of "No data
 * requests" (an admin could read that as nothing to answer), and the two
 * server codes a decision can meet get their own message.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminGdprPage from "@/app/[locale]/(dashboard)/admin/gdpr/page";
import { toast } from "sonner";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/en/admin/gdpr",
}));
jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => ({
    page: 1, limit: 10, total: 0, totalPages: 1,
    setPage: jest.fn(), setLimit: jest.fn(), updateTotal: jest.fn(), resetPage: jest.fn(),
    paginationParams: () => new URLSearchParams({ page: "1", limit: "10" }),
  }),
}));
type MockAction = { key: string; label: string; onSelect: () => void };
jest.mock("@/components/shared/RowActions", () => ({
  RowActions: ({ name, quick = [], menu = [] }: { name: string; quick?: MockAction[]; menu?: MockAction[] }) => (
    <div data-testid={`actions-${name}`}>
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

const started = {
  _id: "64d000000000000000000005",
  userId: "64d000000000000000000003",
  userName: "Sara Started",
  userEmail: "sara@example.com",
  requestType: "delete",
  status: "in_progress",
  createdAt: "2026-09-01T10:00:00Z",
  handledByName: "Super Admin",
};
const refused = {
  ...started,
  _id: "64d000000000000000000007",
  userName: "Rami Refused",
  status: "rejected",
  createdAt: "2026-09-01T10:00:00Z",
  completedAt: "2026-09-04T10:00:00Z",
  outcomeReason: "We could not verify who you are.",
};

const fetchMock = jest.fn();
let listOk = true;
let patchAnswer: { ok: boolean; status?: number; body?: unknown } = { ok: true, body: {} };

beforeEach(() => {
  jest.clearAllMocks();
  listOk = true;
  patchAnswer = { ok: true, body: {} };
  window.history.replaceState(null, "", "/en/admin/gdpr");
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      return Promise.resolve({ ok: patchAnswer.ok, status: patchAnswer.status ?? 200, json: async () => patchAnswer.body });
    }
    if (String(url).startsWith("/api/admin/gdpr?")) {
      if (!listOk) return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [started, refused],
          total: 2,
          stats: { totalRequests: 2, pendingRequests: 1, completedRequests: 0, avgResponseMs: null, dataSubjects: 2, activeConsents: 0 },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ items: [], total: 0 }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
const listCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/admin/gdpr?"));

describe("refusing a started request", () => {
  it("offers Reject next to Complete on an in-progress request", async () => {
    render(<AdminGdprPage />);
    const row = await screen.findByTestId("actions-Sara Started");

    expect(within(row).getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("Reject on a started deletion needs a reason, sends a refusal and never the erasure", async () => {
    render(<AdminGdprPage />);
    const row = await screen.findByTestId("actions-Sara Started");

    await userEvent.click(within(row).getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });
    // The erasure warning belongs to Complete only.
    expect(within(dialog).queryByText(/Completing this erases/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Enter a reason/);
    expect(patchCalls()).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "An exemption applies: an open legal claim.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(String(patchCalls()[0][0])).toContain(started._id);
    expect(JSON.parse(String((patchCalls()[0][1] as RequestInit).body))).toEqual({
      status: "rejected",
      outcomeReason: "An exemption applies: an open legal claim.",
    });
  });

  it("offers Reject in the details of a started request too", async () => {
    render(<AdminGdprPage />);
    const row = await screen.findByTestId("actions-Sara Started");

    await userEvent.click(within(row).getByRole("button", { name: "View" }));
    const details = await screen.findByRole("dialog", { name: "Data request" });
    expect(within(details).getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(within(details).getByRole("button", { name: "Complete" })).toBeInTheDocument();
  });
});

describe("the date a refusal was decided", () => {
  it("shows the refusal date in the list", async () => {
    render(<AdminGdprPage />);
    await screen.findByText("Rami Refused");

    const rowEl = screen.getByText("Rami Refused").closest("tr") as HTMLElement;
    expect(within(rowEl).getByText(/Sep 0?4, 2026/)).toBeInTheDocument();
  });

  it("shows Refused on with the date and the response time in the details", async () => {
    render(<AdminGdprPage />);
    const row = await screen.findByTestId("actions-Rami Refused");

    await userEvent.click(within(row).getByRole("button", { name: "View" }));
    const details = await screen.findByRole("dialog", { name: "Data request" });
    const label = within(details).getByText("Refused on");
    expect(label.parentElement).toHaveTextContent(/Sep 0?4, 2026/);
    expect(within(details).getByText("Response time").parentElement).toHaveTextContent("3 days");
  });
});

describe("a list that could not be loaded", () => {
  it("says so with Retry instead of No data requests, and Retry loads it again", async () => {
    listOk = false;
    render(<AdminGdprPage />);

    expect(await screen.findByText("We couldn't load GDPR data")).toBeInTheDocument();
    expect(screen.queryByText("No data requests found")).not.toBeInTheDocument();
    const before = listCalls().length;

    listOk = true;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
    expect(await screen.findByText("Rami Refused")).toBeInTheDocument();
  });
});

describe("what a failed decision says", () => {
  const rejectStarted = async () => {
    render(<AdminGdprPage />);
    const row = await screen.findByTestId("actions-Sara Started");
    await userEvent.click(within(row).getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Not enough information");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
  };

  it("tells the admin when someone else changed the request", async () => {
    patchAnswer = { ok: false, status: 409, body: { code: "STALE" } };
    await rejectStarted();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This request changed. Reload and try again."));
  });

  it("tells the admin when an erasure stopped half-way", async () => {
    patchAnswer = { ok: false, status: 500, body: { code: "ERASURE_FAILED" } };
    await rejectStarted();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The erasure didn't finish. The request is still in progress; try again."));
  });

  it("tells the admin to finish an erasure that already started instead of refusing it", async () => {
    patchAnswer = { ok: false, status: 409, body: { code: "ERASURE_STARTED" } };
    await rejectStarted();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This account's erasure has already started. Complete the request to finish it."));
  });
});
