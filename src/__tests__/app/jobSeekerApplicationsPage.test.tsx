/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ApplicationsPage from "@/app/[locale]/(dashboard)/job-seeker/applications/page";

const fetchMock = jest.fn();
const pushMock = jest.fn();
const resetPageMock = jest.fn();
const updateTotalMock = jest.fn();
const setPageMock = jest.fn();
const setLimitMock = jest.fn();
const paginationParamsMock = jest.fn(() => new URLSearchParams({ page: "1", limit: "10" }));

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: pushMock }),
  // The page seeds its search box from `?search=` so the ⌘K palette can deep
  // link into a filtered list.
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    span: ({ children, layoutId, transition, ...props }: React.HTMLAttributes<HTMLSpanElement> & {
      layoutId?: string;
      transition?: unknown;
    }) => <span {...props}>{children}</span>,
    div: ({ children, initial, animate, exit, transition, ...props }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => ({
    page: 1,
    limit: 10,
    total: 2,
    totalPages: 1,
    setPage: setPageMock,
    setLimit: setLimitMock,
    resetPage: resetPageMock,
    updateTotal: updateTotalMock,
    paginationParams: paginationParamsMock,
  }),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => {
    if (asChild) {
      return <>{children}</>;
    }

    return <button {...props}>{children}</button>;
  },
}));

jest.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ options, value, onValueChange }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

jest.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

describe("ApplicationsPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pushMock.mockReset();
    resetPageMock.mockReset();
    updateTotalMock.mockReset();
    setPageMock.mockReset();
    setLimitMock.mockReset();
    paginationParamsMock.mockClear();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        applications: [
          {
            _id: "app-1",
            jobId: {
              _id: "job-1",
              title: "Senior Full Stack Developer",
              location: { city: "Kochi", country: "India" },
              salary: { min: 600000, max: 1200000, currency: "INR" },
            },
            status: "selected",
            aiMatchScore: 35,
            appliedAt: "2026-04-08T00:00:00.000Z",
            statusHistory: [
              { status: "applied", changedAt: "2026-04-08T00:00:00.000Z" },
              { status: "selected", changedAt: "2026-04-10T00:00:00.000Z", note: "Status updated to selected" },
            ],
          },
        ],
        pagination: { total: 2 },
      }),
    });

    global.fetch = fetchMock as typeof fetch;
  });

  it("animates the active filter control while preserving filtered fetch behavior", async () => {
    const user = userEvent.setup();

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10");
    });

    await user.click(screen.getByRole("tab", { name: "Selected" }));

    expect(resetPageMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/applications?page=1&limit=10&status=selected");
    });

    expect(screen.getByRole("tab", { name: "Selected" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps cards compact by default and expands details on demand", async () => {
    const user = userEvent.setup();

    render(<ApplicationsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /senior full stack developer/i })).toBeInTheDocument();
    });

    const detailToggle = screen.getByRole("button", { name: /view details for senior full stack developer/i });

    expect(detailToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { name: /my applications/i })).toBeInTheDocument();
    expect(screen.getByText("35% match")).toBeInTheDocument();
    expect(screen.getByText(/Kochi, India/i)).toBeInTheDocument();
    expect(screen.getByText(/Applied [A-Z][a-z]{2} \d{1,2}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeInTheDocument();
    expect(screen.queryByText("Status updated to selected")).not.toBeInTheDocument();

    await user.click(detailToggle);

    await waitFor(() => {
      expect(detailToggle).toHaveAttribute("aria-expanded", "true");
    });
    expect(screen.getByText("Status updated to selected")).toBeInTheDocument();
  });
});