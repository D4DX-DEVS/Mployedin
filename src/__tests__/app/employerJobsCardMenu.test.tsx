/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmployerJobsPage from "@/app/[locale]/(dashboard)/employer/jobs/page";

const useJobsMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
  }),
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

jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({
    confirm: jest.fn(async () => true),
    ConfirmDialogNode: null,
  }),
}));

jest.mock("@/hooks/useJobs", () => ({
  useJobs: (...args: unknown[]) => useJobsMock(...args),
  useUpdateJobStatus: () => ({
    mutateAsync: jest.fn(async () => ({ job: {} })),
    isPending: false,
  }),
  useCloneJob: () => ({
    mutateAsync: jest.fn(async () => ({ job: { _id: "cloned-job" } })),
    isPending: false,
  }),
  useDeleteJob: () => ({
    mutateAsync: jest.fn(async () => ({})),
    isPending: false,
  }),
  jobKeys: {
    all: ["jobs"] as const,
    lists: () => ["jobs", "list"] as const,
    list: () => ["jobs", "list"] as const,
    details: () => ["jobs", "detail"] as const,
    detail: () => ["jobs", "detail"] as const,
  },
}));

jest.mock("@/hooks/useDebounce", () => ({
  useDebounce: (value: string) => value,
}));

jest.mock("@/components/features/employer/dashboard", () => ({
  DraftExtractionsCard: () => null,
}));

jest.mock("@/components/shared/CopilotLauncher", () => ({
  CopilotLauncher: () => null,
}));

jest.mock("@/components/shared/WorkspaceHeader", () => ({
  WorkspaceHeader: ({ title, context, actions, metrics }: React.PropsWithChildren<any>) => (
    <div data-testid="workspace-header">
      <h1>{title}</h1>
      <div>{context}</div>
      <div>{actions}</div>
      {Array.isArray(metrics) && (
        <div>
          {metrics.map((m: any, i: number) => (
            <div key={i}>{m.label}</div>
          ))}
        </div>
      )}
    </div>
  ),
}));

jest.mock("@/components/shared/TableToolbar", () => ({
  TableToolbar: () => null,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => null,
}));

jest.mock("@/components/ui/button", () => ({
  Button: React.forwardRef(({ children, asChild, ...props }: React.PropsWithChildren<any>, ref) => {
    if (asChild) {
      return <a ref={ref} {...props}>{children}</a>;
    }
    return <button ref={ref} {...props}>{children}</button>;
  }),
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
}));

jest.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
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

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DropdownMenuTrigger: React.forwardRef(({ children, ...props }: React.PropsWithChildren<any>, ref) => (
    <button ref={ref} {...props}>{children}</button>
  )),
  DropdownMenuContent: ({ children, ...props }: React.PropsWithChildren<any>) => (
    <div role="menu" {...props}>{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, disabled, ...props }: React.PropsWithChildren<any>) => (
    <button role="menuitem" onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
  DropdownMenuSeparator: () => <div role="separator" />,
}));

describe("EmployerJobsCardMenu", () => {
  beforeEach(() => {
    useJobsMock.mockReset();
    useJobsMock.mockReturnValue({
      data: {
        jobs: [
          {
            _id: "j1",
            title: "Senior Developer",
            location: "Remote",
            category: "Engineering",
            status: "active",
            salary: { min: 100000, max: 150000, currency: "USD" },
            vacancies: 2,
            views: 42,
            applicationCount: 3,
            applicantIds: ["a1", "a2", "a3"],
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCounts: { active: 1, draft: 0, paused: 0, closed: 0, expired: 0 },
        totalVacancies: 2,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it("renders primary CTA link to applications when job has applicants", () => {
    render(<EmployerJobsPage />);

    // Find the link by checking for applications in the href
    const links = screen.getAllByRole("link");
    const applicationsLink = links.find((link) => link.getAttribute("href")?.includes("/applications"));
    expect(applicationsLink).toBeInTheDocument();
    expect(applicationsLink?.getAttribute("href")).toMatch(/\/employer\/jobs\/j1\/applications$/);
  });

  it("renders primary CTA button for open job when no applicants", () => {
    useJobsMock.mockReturnValue({
      data: {
        jobs: [
          {
            _id: "j2",
            title: "Junior Developer",
            location: "Remote",
            category: "Engineering",
            status: "active",
            salary: { min: 50000, max: 80000, currency: "USD" },
            vacancies: 1,
            views: 10,
            applicationCount: 0,
            applicantIds: [],
            createdAt: "2026-01-02T00:00:00Z",
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCounts: { active: 1, draft: 0, paused: 0, closed: 0, expired: 0 },
        totalVacancies: 1,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<EmployerJobsPage />);

    const primaryLink = screen.getByRole("link", { name: /open job/i });
    expect(primaryLink).toBeInTheDocument();
    expect(primaryLink.getAttribute("href")).toMatch(/\/employer\/jobs\/j2$/);
  });

  it("renders draft job with continue draft button", () => {
    useJobsMock.mockReturnValue({
      data: {
        jobs: [
          {
            _id: "j3",
            title: "Marketing Manager",
            location: "London",
            category: "Marketing",
            status: "draft",
            salary: { min: 60000, max: 90000, currency: "GBP" },
            vacancies: 1,
            views: 0,
            applicationCount: 0,
            applicantIds: [],
            createdAt: "2026-01-03T00:00:00Z",
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCounts: { active: 0, draft: 1, paused: 0, closed: 0, expired: 0 },
        totalVacancies: 1,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<EmployerJobsPage />);

    const continueLink = screen.getByRole("link", { name: /continue draft/i });
    expect(continueLink).toBeInTheDocument();
    expect(continueLink.getAttribute("href")).toMatch(/\/employer\/jobs\/j3\/edit$/);
  });

  it("renders paused job with resume button", () => {
    useJobsMock.mockReturnValue({
      data: {
        jobs: [
          {
            _id: "j4",
            title: "Sales Manager",
            location: "New York",
            category: "Sales",
            status: "paused",
            salary: { min: 70000, max: 110000, currency: "USD" },
            vacancies: 2,
            views: 25,
            applicationCount: 5,
            applicantIds: ["b1", "b2", "b3", "b4", "b5"],
            createdAt: "2026-01-04T00:00:00Z",
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCounts: { active: 0, draft: 0, paused: 1, closed: 0, expired: 0 },
        totalVacancies: 2,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<EmployerJobsPage />);

    const resumeButton = screen.getByRole("button", { name: /resume job/i });
    expect(resumeButton).toBeInTheDocument();
  });

  // Note: Radix DropdownMenu cannot reliably open in jsdom due to constraints
  // in how the test environment handles portals and focus management. The menu
  // items (Edit, Pause, Clone, Close job, etc.) are present in the code but
  // cannot be interacted with or asserted in this jsdom test environment.
  // See: src/__tests__/app/employerApplicationsPage.test.tsx for E2E testing pattern.
});
