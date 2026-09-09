import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TemplatePicker } from "@/components/features/employer/jobs/TemplatePicker";

const mockPush = jest.fn();
const mockMutateAsync = jest.fn();
const mockLibrary = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/employer/jobs/new",
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(value: T) => value }));
jest.mock("@/hooks/useJobs", () => ({
  useJobTemplateLibrary: (filters: unknown) => mockLibrary(filters),
  useUseJobTemplate: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const template = {
  _id: "tpl1",
  name: "Senior Accountant",
  title: "Accountant",
  requirements: { skills: ["Accounting", "Excel", "Odoo", "Tally"] },
  usageCount: 2,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function library(templates: unknown[], total = templates.length) {
  return { data: { templates, total }, isLoading: false, isError: false, refetch: jest.fn() };
}

describe("TemplatePicker", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockMutateAsync.mockReset();
    mockLibrary.mockReset();
  });

  it("lists saved roles and opens the editor on the draft it creates", async () => {
    mockLibrary.mockReturnValue(library([template]));
    mockMutateAsync.mockResolvedValue({ job: { _id: "job9" } });
    render(<TemplatePicker locale="en" />);

    expect(screen.getByText("Senior Accountant")).toBeInTheDocument();
    expect(screen.getByText("Accountant · Accounting, Excel, Odoo")).toBeInTheDocument();
    expect(screen.getByText(/Used 2 times/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage templates" })).toHaveAttribute("href", "/en/employer/job-templates");

    fireEvent.click(screen.getByRole("button", { name: "Use: Senior Accountant" }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith("tpl1"));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/en/employer/jobs/job9/edit"));
  });

  it("points an employer with no templates at the jobs list, where templates are made", () => {
    mockLibrary.mockReturnValue(library([]));
    render(<TemplatePicker locale="en" />);

    expect(screen.getByText("No templates yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to your jobs" })).toHaveAttribute("href", "/en/employer/jobs");
  });

  it("passes the search to the library query and offers to clear a miss", () => {
    mockLibrary.mockReturnValue(library([]));
    render(<TemplatePicker locale="en" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search templates" }), { target: { value: "nurse" } });

    expect(mockLibrary).toHaveBeenLastCalledWith({ search: "nurse", page: 1, limit: 10 });
    expect(screen.getByText("No templates match “nurse”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(mockLibrary).toHaveBeenLastCalledWith({ search: undefined, page: 1, limit: 10 });
  });

  it("shows the error state with a retry instead of a blank panel", () => {
    const refetch = jest.fn();
    mockLibrary.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<TemplatePicker locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});
