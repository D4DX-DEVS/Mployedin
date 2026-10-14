/**
 * @jest-environment jsdom
 *
 * Agents and super agents follow their employers' background checks (client
 * report 2026-09-30, #16). Since 2026-10-14 agents also run them: each row's
 * button follows the server's `viewer` flags for that row.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffBackgroundChecks } from "@/components/features/background-checks/StaffBackgroundChecks";

let searchParamsState = new URLSearchParams();

const paginationState = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
  paginationParams: () => new URLSearchParams({ page: "1", limit: "20" }),
};
jest.mock("@/hooks/usePagination", () => ({ usePagination: () => paginationState }));
jest.mock("next/navigation", () => ({
  // The URL has to actually move, or useUrlFilter's write cache carries one
  // test's ?checkId= into the next (see url-filter test leak).
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn((href: string) => {
      window.history.replaceState({}, "", href);
      searchParamsState = new URLSearchParams(href.split("?")[1] ?? "");
    }),
  }),
  usePathname: () => "/en/agent/background-checks",
  useSearchParams: () => searchParamsState,
  useParams: () => ({ locale: "en" }),
}));
jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

const check = {
  _id: "c1",
  status: "in_progress",
  outcome: "pending",
  checkType: "both",
  requestedAt: "2026-09-29T10:00:00.000Z",
  candidateName: "Asha Menon",
  jobTitle: "Accountant",
  companyName: "Acme",
  references: { total: 2, responded: 1, declined: 0 },
  assignee: null,
  viewer: { canStart: true, canWork: false, canAssign: false, canCancel: false, canEditNotes: false, heldByOther: false },
};
const FOLLOW_ONLY = { canStart: false, canWork: false, canAssign: false, canCancel: false, canEditNotes: false, heldByOther: false };

const fetchMock = jest.fn();

beforeEach(() => {
  window.history.replaceState({}, "", "/en/agent/background-checks");
  searchParamsState = new URLSearchParams();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [check], total: 1 }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

it("lists each check with its candidate, employer, status and replies", async () => {
  render(<StaffBackgroundChecks />);
  const table = await screen.findByRole("table");
  await within(table).findByText("Asha Menon");
  expect(fetchMock).toHaveBeenCalledWith("/api/background-checks?page=1&limit=20");
  expect(within(table).getByText("Accountant")).toBeInTheDocument();
  expect(within(table).getByText("Acme")).toBeInTheDocument();
  expect(within(table).getByText("In progress")).toBeInTheDocument();
  expect(within(table).getByText("1 of 2 references replied")).toBeInTheDocument();
  expect(paginationState.updateTotal).toHaveBeenCalledWith(1);
});

it("offers Start on a check nobody holds, and sends a start action", async () => {
  render(<StaffBackgroundChecks />);
  const table = await screen.findByRole("table");
  const start = await within(table).findByRole("button", { name: /start check/i });
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
  await userEvent.click(start);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/background-checks/c1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "start" }) })
    )
  );
});

it("offers only View to someone who follows but doesn't run checks", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [{ ...check, viewer: FOLLOW_ONLY }], total: 1 }) });
  render(<StaffBackgroundChecks />);
  const table = await screen.findByRole("table");
  expect(await within(table).findByRole("button", { name: /^view/i })).toBeInTheDocument();
  expect(within(table).queryByRole("button", { name: /start check/i })).toBeNull();
});

it("says who handles a check somebody else holds", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [{ ...check, assignee: { name: "Sarah", kind: "employer", isMe: false }, viewer: { ...FOLLOW_ONLY, heldByOther: true } }],
      total: 1,
    }),
  });
  render(<StaffBackgroundChecks />);
  const table = await screen.findByRole("table");
  expect(await within(table).findByText("Handled by Sarah (Employer team)")).toBeInTheDocument();
});

it("offers Continue on a check the agent holds", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [{ ...check, assignee: { name: "Ahmed", kind: "agent", isMe: true }, viewer: { ...FOLLOW_ONLY, canWork: true } }],
      total: 1,
    }),
  });
  render(<StaffBackgroundChecks />);
  const table = await screen.findByRole("table");
  expect(await within(table).findByRole("button", { name: /continue/i })).toBeInTheDocument();
  expect(within(table).getByText("Handled by you")).toBeInTheDocument();
});

it("sends the status filter from the URL", async () => {
  searchParamsState = new URLSearchParams("status=completed");
  render(<StaffBackgroundChecks />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/background-checks?page=1&limit=20&status=completed"));
});

it("ignores a status that isn't one of the four", async () => {
  searchParamsState = new URLSearchParams("status=%24ne");
  render(<StaffBackgroundChecks />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/background-checks?page=1&limit=20"));
});

it("says so when there are no checks", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [], total: 0 }) });
  render(<StaffBackgroundChecks />);
  expect(await screen.findByText("No background checks yet")).toBeInTheDocument();
});

it("offers a retry when the list can't be loaded", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
  render(<StaffBackgroundChecks />);
  const retry = await screen.findByRole("button", { name: /try again|retry/i });
  await userEvent.click(retry);
  await screen.findAllByText("Asha Menon");
});
