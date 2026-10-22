/**
 * @jest-environment jsdom
 */
/**
 * Admin → GDPR, phone round 2 (the owner's screenshot of the page while it was
 * still loading): the stat figures were "0" / "—", the sort box had no label,
 * and a phone first painted the desktop table. Now: stat figures are skeletons
 * until the first answer, the sort label is in the server-rendered markup, both
 * skeletons are in the page (CSS picks one), and the filters of a phone are one
 * compact row under the search box.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminGdprPage from "@/app/[locale]/(dashboard)/admin/gdpr/page";
import { PhoneFilterRow, type PhoneFilter, type PhoneSort } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/PhoneFilterRow";
import { InlineFilterBar } from "@/components/shared/InlineFilterBar";
import { TableSortControl } from "@/components/shared/TableSortControl";

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
jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: ({ summary }: { summary?: React.ReactNode }) => <div data-testid="pagination">{summary ?? "0–0 / 0"}</div>,
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const STATUS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
];
const TYPE = [
  { value: "all", label: "All types" },
  { value: "delete", label: "Erasure" },
];

function row(over: { status?: string; type?: string; order?: "asc" | "desc"; field?: string; fields?: number } = {}) {
  const onStatus = jest.fn();
  const onType = jest.fn();
  const onOrder = jest.fn();
  const onField = jest.fn();
  const filters: PhoneFilter[] = [
    { key: "status", label: "Status", value: over.status ?? "all", options: STATUS, onChange: onStatus },
    { key: "type", label: "Type", value: over.type ?? "all", options: TYPE, onChange: onType },
  ];
  const fields = [
    { value: "createdAt", label: "Submitted" },
    { value: "completedAt", label: "Completed" },
  ].slice(0, over.fields ?? 2);
  const sort: PhoneSort = { field: over.field ?? "createdAt", fields, onFieldChange: onField, order: over.order ?? "desc", onOrderChange: onOrder };
  render(<PhoneFilterRow filters={filters} sort={sort} />);
  return { onStatus, onType, onOrder, onField };
}

describe("PhoneFilterRow", () => {
  it("is three equal compact buttons in a grid (not a wrapping flex row), each at least 44px", () => {
    row();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0].parentElement).toHaveClass("grid", "grid-cols-3", "gap-2");
    expect(buttons[0].parentElement?.className).not.toMatch(/flex-wrap/);
    for (const b of buttons) expect(b).toHaveClass("min-h-11", "w-full");
  });

  it("shows the field name while a filter is on All, and the accessible name says what it is set to", () => {
    row();

    const status = screen.getByRole("button", { name: "Status: All statuses" });
    expect(status).toHaveTextContent("Status");
    expect(status).not.toHaveAttribute("data-active");
    expect(screen.getByRole("button", { name: "Type: All types" })).toHaveTextContent("Type");
  });

  it("shows the chosen value, tinted, while a filter is on (words, not only colour)", () => {
    row({ status: "pending", type: "delete" });

    const status = screen.getByRole("button", { name: "Status: Pending" });
    expect(status).toHaveTextContent("Pending");
    expect(status).toHaveAttribute("data-active", "true");
    expect(status).toHaveClass("bg-primary/10", "text-primary");
    expect(screen.getByRole("button", { name: "Type: Erasure" })).toHaveTextContent("Erasure");
  });

  it("opens a menu of the options and reports the choice", async () => {
    const { onStatus } = row();

    await userEvent.click(screen.getByRole("button", { name: "Status: All statuses" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual(["All statuses", "Pending", "Completed"]);
    expect(within(menu).getByRole("menuitemradio", { name: "All statuses" })).toBeChecked();

    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "Completed" }));
    expect(onStatus).toHaveBeenCalledWith("completed");
  });

  it("folds the sort direction into the same button: Newest / Oldest, no separate arrow button", () => {
    const { unmount } = render(
      <PhoneFilterRow filters={[]} sort={{ field: "createdAt", fields: [{ value: "createdAt", label: "Submitted" }], order: "desc", onOrderChange: jest.fn() }} />,
    );
    expect(screen.getByRole("button", { name: "Sort: Submitted, newest first" })).toHaveTextContent("Newest");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    unmount();

    row({ order: "asc" });
    expect(screen.getByRole("button", { name: "Sort: Submitted, oldest first" })).toHaveTextContent("Oldest");
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("names the field too when the sort is not by the first one: \"Completed · Newest\"", () => {
    row({ field: "completedAt" });

    const button = screen.getByRole("button", { name: "Sort: Completed, newest first" });
    expect(button).toHaveTextContent("Completed · Newest");
  });

  it("changes the direction from the sort menu, and the field when there is more than one", async () => {
    const { onOrder, onField } = row();

    await userEvent.click(screen.getByRole("button", { name: "Sort: Submitted, newest first" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitemradio", { name: "Newest first" })).toBeChecked();
    expect(within(menu).getByRole("menuitemradio", { name: "Submitted" })).toBeChecked();

    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "Oldest first" }));
    expect(onOrder).toHaveBeenCalledWith("asc");

    await userEvent.click(screen.getByRole("button", { name: "Sort: Submitted, newest first" }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: "Completed" }));
    expect(onField).toHaveBeenCalledWith("completedAt");
  });

  it("leaves the field group out of the menu when the table sorts by a single date", async () => {
    row({ fields: 1 });

    await userEvent.click(screen.getByRole("button", { name: "Sort: Submitted, newest first" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual(["Newest first", "Oldest first"]);
  });

  it("two filters and a sort make a two-column row on the Other consents tab", () => {
    render(
      <PhoneFilterRow
        filters={[{ key: "type", label: "Type", value: "all", options: TYPE, onChange: jest.fn() }]}
        sort={{ field: "createdAt", fields: [{ value: "createdAt", label: "Timestamp" }], order: "desc", onOrderChange: jest.fn() }}
      />,
    );

    expect(screen.getAllByRole("button")[0].parentElement).toHaveClass("grid-cols-2");
  });
});

describe("InlineFilterBar phoneRow", () => {
  it("is shown below sm only, and nothing is rendered when it is not passed", () => {
    const { container, rerender } = render(<InlineFilterBar>filters</InlineFilterBar>);
    expect(container.querySelector(".sm\\:hidden")).toBeNull();

    rerender(<InlineFilterBar phoneRow={<span>phone row</span>}>filters</InlineFilterBar>);
    expect(screen.getByText("phone row").parentElement).toHaveClass("sm:hidden");
  });
});

describe("TableSortControl first paint", () => {
  it("has the current field's label in the server-rendered markup, not an empty box", () => {
    const html = renderToString(
      <TableSortControl
        value="createdAt"
        onValueChange={() => undefined}
        options={[{ value: "createdAt", label: "Submitted" }, { value: "completedAt", label: "Completed" }]}
        order="desc"
        onOrderChange={() => undefined}
        compact
      />,
    );

    expect(html).toContain("Submitted");
  });
});

describe("admin GDPR page while loading", () => {
  beforeEach(() => {
    // The list never answers: the page stays in its loading state.
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
  });

  it("shows skeletons for the four figures, never 0 or a dash", () => {
    const { container } = render(<AdminGdprPage />);

    expect(container.querySelectorAll("[data-stat-skeleton]")).toHaveLength(4);
    const values = [...container.querySelectorAll("[data-header-metric-value]")].map((el) => el.textContent?.trim());
    expect(values).toEqual(["", "", "", ""]);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("shows a skeleton, not \"0–0 / 0\", in the pagination footer", () => {
    render(<AdminGdprPage />);

    const footer = screen.getByTestId("pagination");
    expect(footer).not.toHaveTextContent("0–0");
    expect(footer.querySelector("[data-pagination-skeleton]")).not.toBeNull();
  });

  it("has both skeletons, switched by CSS, so a phone's first paint is not the desktop table", () => {
    render(<AdminGdprPage />);

    expect(screen.getByTestId("requests-cards-skeleton")).toHaveClass("sm:hidden");
    expect(screen.getByTestId("requests-table-skeleton")).toHaveClass("max-sm:hidden");
  });

  it("drops the panel's border and padding on phones with CSS", () => {
    const { container } = render(<AdminGdprPage />);

    const section = screen.getByTestId("requests-cards-skeleton").parentElement as HTMLElement;
    expect(section).toHaveClass("max-sm:!border-0", "max-sm:!p-0", "max-sm:!bg-transparent");
    expect(container.querySelector("[data-phone-filters]")?.closest(".panel-head")).toHaveClass("max-sm:!border-0", "max-sm:!p-0");
  });

  it("has the compact filter row and the sort label from the first render", () => {
    render(<AdminGdprPage />);

    expect(screen.getByRole("button", { name: "Status: All statuses" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort: Submitted, newest first" })).toBeInTheDocument();
    // The desktop sort box reads "Submitted" too.
    expect(screen.getAllByText("Submitted").length).toBeGreaterThan(0);
  });
});

describe("admin GDPR page, server-rendered (the first paint of a phone, or a page with scripts off)", () => {
  it("already holds the phone layout: both skeletons, the compact row, the sort label, no figures", () => {
    const html = renderToString(<AdminGdprPage />);

    expect(html.match(/data-stat-skeleton/g)).toHaveLength(4);
    expect(html).toContain("requests-cards-skeleton");
    expect(html).toContain("requests-table-skeleton");
    expect(html).toContain("data-phone-filters");
    expect(html).toContain("Sort: Submitted, newest first");
    expect(html).toMatch(/Submitted<\/span>/);
  });
});

describe("admin GDPR page once loaded", () => {
  it("shows the real figures, including a real 0", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          items: [],
          total: 0,
          stats: { totalRequests: 0, pendingRequests: 0, completedRequests: 0, avgResponseMs: null, dataSubjects: 0, activeConsents: 0 },
        }),
      }),
    ) as unknown as typeof fetch;
    const { container } = render(<AdminGdprPage />);

    await screen.findByText("No data requests found");
    expect(screen.getByTestId("pagination")).toHaveTextContent("0–0 / 0");
    expect(container.querySelectorAll("[data-stat-skeleton]")).toHaveLength(0);
    const values = [...container.querySelectorAll("[data-header-metric-value]")].map((el) => el.textContent?.trim());
    expect(values).toEqual(["0", "0", "0", "—"]);
  });
});
