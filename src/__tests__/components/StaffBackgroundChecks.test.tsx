/**
 * @jest-environment jsdom
 *
 * Agents and super agents follow their employers' background checks (client
 * report 2026-09-30, #16). Read-only: the page lists where each check stands
 * and never offers to run one.
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
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
};

const fetchMock = jest.fn();

beforeEach(() => {
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

it("is read-only: there is nothing to start or edit a check with", async () => {
  render(<StaffBackgroundChecks />);
  await screen.findAllByText("Asha Menon");
  expect(screen.getByText(/employer's team runs/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /new|start|request|edit/i })).toBeNull();
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
