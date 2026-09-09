/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { OffersWorkspace } from "@/components/features/employer/offers/OffersWorkspace";

const useOffersMock = jest.fn();
const useWithdrawOfferMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("next/link", () => {
  return ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  );
});

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
  }),
}));

jest.mock("@/hooks/useOffers", () => ({
  useOffers: (...args: unknown[]) => useOffersMock(...args),
  useWithdrawOffer: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

jest.mock("@/hooks/useTableExport", () => ({
  useTableExport: () => ({
    handleExportCsv: jest.fn(),
    handleExportExcel: jest.fn(),
    handleExportPdf: jest.fn(),
  }),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }: any) => {
    if (asChild) {
      return children;
    }
    return <button {...props}>{children}</button>;
  },
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
}));

jest.mock("@/components/ui/table", () => ({
  Table: ({ children, ...props }: any) => <table {...props}>{children}</table>,
  TableHeader: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TableBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TableRow: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TableHead: ({ children, ...props }: any) => <th {...props}>{children}</th>,
  TableCell: ({ children, ...props }: any) => <td {...props}>{children}</td>,
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ options, value, onValueChange, placeholder }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <select aria-label={placeholder} value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

jest.mock("@/components/shared/WorkspaceHeader", () => ({
  WorkspaceHeader: () => null,
}));

jest.mock("@/components/shared/TableToolbar", () => ({
  TableToolbar: () => null,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => null,
}));

jest.mock("@/components/shared/CandidateDataNotice", () => ({
  CandidateDataNotice: () => null,
}));

describe("OffersWorkspace", () => {
  beforeEach(() => {
    useOffersMock.mockReset();

    useOffersMock.mockReturnValue({
      data: {
        offers: [
          {
            _id: "offer-1",
            jobId: { _id: "job-1", title: "Senior Developer", location: "Dubai" },
            jobSeekerId: {
              _id: "candidate-1",
              userId: { _id: "user-1", name: "Alice Johnson" },
              fullName: "Alice Johnson",
            },
            status: "pending",
            salary: { amount: 150000, currency: "AED", period: "yearly" },
            startDate: "2026-10-01",
            expiresAt: "2026-09-30",
            createdAt: "2026-09-08T00:00:00.000Z",
            benefits: "Health insurance, 30 days leave",
            notes: "Great fit for the team",
          },
          {
            _id: "offer-2",
            jobId: { _id: "job-1", title: "Senior Developer", location: "Dubai" },
            jobSeekerId: {
              _id: "candidate-2",
              userId: { _id: "user-2", name: "Bob Smith" },
              fullName: "Bob Smith",
            },
            status: "accepted",
            salary: { amount: 140000, currency: "AED", period: "yearly" },
            startDate: "2026-11-01",
            expiresAt: "2026-09-25",
            createdAt: "2026-09-01T00:00:00.000Z",
          },
        ],
        pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
        stats: {
          total: 5,
          pending: 2,
          accepted: 2,
          declined: 1,
        },
      },
      isLoading: false,
    });
  });

  it("renders embedded mode without workspace header or job selector", () => {
    render(<OffersWorkspace jobId="job-1" embedded />);

    // Should not have job combobox
    expect(screen.queryByRole("combobox", { name: /select job/i })).not.toBeInTheDocument();

    // Should call useOffers with jobId
    expect(useOffersMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1" })
    );
  });

  it("does not fetch job list when embedded", () => {
    // Mock fetch at the global level
    const originalFetch = global.fetch;
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });
    global.fetch = fetchSpy as any;

    try {
      render(<OffersWorkspace jobId="job-1" embedded />);

      // fetch should not be called for /api/jobs
      const calls = fetchSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("/api/jobs")
      );
      expect(calls.length).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("renders status filter chips in embedded mode", () => {
    render(<OffersWorkspace jobId="job-1" embedded />);

    // Status chips should be present (look for them more specifically)
    const buttons = screen.getAllByRole("button");
    const statusChips = buttons.filter((btn) =>
      ["Offers", "Pending", "Accepted", "Declined"].some((text) =>
        btn.textContent?.includes(text)
      )
    );
    expect(statusChips.length).toBeGreaterThan(0);
  });

  it("renders non-embedded mode with job selector", () => {
    const originalFetch = global.fetch;
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });
    global.fetch = fetchSpy as any;

    try {
      render(<OffersWorkspace />);

      // fetch should be called for job list
      const calls = fetchSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("/api/jobs?limit=100&fields=title&myJobs=true")
      );
      expect(calls.length).toBeGreaterThan(0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
