/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationsBoard, BOARD_PAGE_SIZE } from "@/components/features/employer/applications/ApplicationsBoard";
import type { Applicant } from "@/components/features/employer/applications/ApplicationsWorkspace";

const useInfiniteApplicationsMock = jest.fn();
jest.mock("@/hooks/useApplications", () => ({
  useInfiniteApplications: (...args: unknown[]) => useInfiniteApplicationsMock(...args),
  applicationKeys: { all: ["applications"] },
}));

jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a> }));
jest.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: any) => <div>{children}</div>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: any) => <span>{children}</span>,
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApp = (overrides?: Partial<Applicant>): Applicant => ({
  _id: "app-1",
  jobId: { _id: "job-1", title: "Engineer" },
  jobSeekerId: {
    _id: "seeker-1",
    userId: { _id: "user-1", name: "Alice Smith", avatar: undefined },
    skills: ["React"],
    totalExperienceYears: 3,
    experience: [{ isCurrent: true, jobTitle: "Senior Dev", company: "TechCo" }],
  },
  status: "applied",
  appliedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  aiMatchScore: 85,
  viewedByEmployerAt: undefined,
  ...overrides,
});

/** One loaded page for a column, the way `useInfiniteApplications` hands it over. */
function column(applications: Applicant[], total: number, extra: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ applications, pagination: { page: 1, limit: BOARD_PAGE_SIZE, total } }] },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
    hasNextPage: total > applications.length,
    isFetchingNextPage: false,
    ...extra,
  };
}

describe("ApplicationsBoard", () => {
  const baseFilters = { search: "", scoreMin: 0, scoreMax: 100 };
  const onOpen = jest.fn();
  const onMove = jest.fn();

  beforeAll(() => {
    // jsdom has no scrollTo on elements; the phone pager calls it.
    Element.prototype.scrollTo = jest.fn() as unknown as Element["scrollTo"];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useInfiniteApplicationsMock.mockImplementation(({ status }: any) =>
      status === "applied"
        ? column([mockApp({ _id: "app-1", status: "applied" })], 1)
        : status === "shortlisted"
          ? column([mockApp({ _id: "app-2", status: "shortlisted" })], 1)
          : column([], 0),
    );
  });

  const renderBoard = (statusCounts: Record<string, number>) =>
    render(
      <ApplicationsBoard
        jobId="job-1"
        locale="en"
        baseFilters={baseFilters}
        statusCounts={statusCounts}
        onOpen={onOpen}
        onMove={onMove}
      />
    );

  it("renders pipeline and off-path columns with counts", () => {
    renderBoard({ applied: 1, shortlisted: 1, interview_scheduled: 0, selected: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 0 });

    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
    expect(screen.getByText("Interviewing")).toBeInTheDocument();
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByText("Offer")).toBeInTheDocument();
    expect(screen.getByText("Hired")).toBeInTheDocument();

    const countElements = screen.queryAllByText("1");
    expect(countElements.length).toBeGreaterThan(0); // applied and shortlisted counts
  });

  it("asks each stage for its own first page of 20", () => {
    renderBoard({ applied: 1 });
    const calls = useInfiniteApplicationsMock.mock.calls.map(([f]: any) => f);
    expect(calls.map((f: any) => f.status)).toEqual(
      expect.arrayContaining(["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired"]),
    );
    expect(calls.every((f: any) => f.limit === BOARD_PAGE_SIZE && f.jobId === "job-1")).toBe(true);
  });

  it("renders cards with candidate info", () => {
    renderBoard({ applied: 1 });

    expect(screen.queryAllByText("Alice Smith").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Senior Dev").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("85% match").length).toBeGreaterThan(0);
  });

  it("calls onOpen when a card is clicked", async () => {
    renderBoard({ applied: 1 });

    const card = screen.queryAllByText("Alice Smith")[0]?.closest("article");
    expect(card).toBeTruthy();
    fireEvent.click(card as HTMLElement);
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
  });

  it("opens the candidate from the name button, never from the move menu", () => {
    renderBoard({ applied: 1 });
    fireEvent.click(screen.getAllByRole("button", { name: "Alice Smith" })[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Move to…" })[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    // No interactive wrapper around the card any more.
    expect(document.querySelector('[data-app-id="app-1"]')).not.toHaveAttribute("role");
  });

  it("shows the server total, 'Showing X of Y' and loads the next page on demand", async () => {
    const user = userEvent.setup();
    const fetchNextPage = jest.fn();
    useInfiniteApplicationsMock.mockImplementation(({ status }: any) =>
      status === "applied" ? column([mockApp({ _id: "app-1" })], 842, { fetchNextPage }) : column([], 0),
    );

    // The list's whole-job count is stale (1); the column's own total wins.
    renderBoard({ applied: 1 });

    expect(screen.getByText("842")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 842")).toBeInTheDocument();
    expect(document.querySelector('[data-board-column="applied"]')).toHaveAttribute("aria-label", "Applied: 842 candidates");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not offer 'Load more' or a progress line for a small stage", () => {
    renderBoard({ applied: 1 });
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Showing /)).not.toBeInTheDocument();
  });

  it("renders empty state for a column with no candidates", () => {
    useInfiniteApplicationsMock.mockImplementation(() => column([], 0));
    renderBoard({ applied: 0, shortlisted: 0, interview_scheduled: 0, selected: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 0 });

    expect(screen.getAllByText("No candidates here").length).toBeGreaterThan(0);
  });

  it("shows skeleton while loading", () => {
    useInfiniteApplicationsMock.mockImplementation(() => ({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    }));

    const { container } = renderBoard({ applied: 1 });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("displays 'New' indicator for unreviewed applied candidates", () => {
    const unreviewed = mockApp({ status: "applied", viewedByEmployerAt: undefined });
    useInfiniteApplicationsMock.mockImplementation(({ status }: any) =>
      status === "applied" ? column([unreviewed], 1) : column([], 0),
    );

    renderBoard({ applied: 1 });
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("drops a dragged card onto another stage and moves it there", async () => {
    onMove.mockResolvedValue(undefined);
    renderBoard({ applied: 1, shortlisted: 1 });

    const card = document.querySelector('[data-app-id="app-1"]') as HTMLElement;
    const target = document.querySelector('[data-board-column="interview_scheduled"]') as HTMLElement;
    const dataTransfer = { setData: jest.fn(), effectAllowed: "", dropEffect: "" };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveAttribute("data-drop-over", "true");
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    expect(onMove.mock.calls[0][0]._id).toBe("app-1");
    expect(onMove.mock.calls[0][1]).toBe("interview_scheduled");
    expect(target).not.toHaveAttribute("data-drop-over");
  });

  it("ignores a drop back onto the card's own stage", () => {
    renderBoard({ applied: 1 });

    const card = document.querySelector('[data-app-id="app-1"]') as HTMLElement;
    const own = document.querySelector('[data-board-column="applied"]') as HTMLElement;
    fireEvent.dragStart(card, { dataTransfer: { setData: jest.fn(), effectAllowed: "" } });
    fireEvent.drop(own, { dataTransfer: {} });

    expect(onMove).not.toHaveBeenCalled();
  });

  it("steps through the stages with the phone pager", async () => {
    const user = userEvent.setup();
    renderBoard({ applied: 1 });

    const prev = screen.getByRole("button", { name: "Previous stage" });
    const next = screen.getByRole("button", { name: "Next stage" });
    expect(screen.getByText("Stage 1 of 6")).toBeInTheDocument();
    expect(prev).toBeDisabled();

    await user.click(next);
    expect(screen.getByText("Stage 2 of 6")).toBeInTheDocument();
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    expect(prev).toBeEnabled();

    for (let i = 0; i < 10; i++) await user.click(next);
    expect(screen.getByText("Stage 6 of 6")).toBeInTheDocument();
    expect(next).toBeDisabled();
  });

  it("pages three stages at a time on a tablet-sized board", async () => {
    // jsdom has no layout: fake a 720px scroller holding 232px columns (768px tablet).
    const clientWidth = jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(720);
    const offsetWidth = jest.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(232);
    try {
      const user = userEvent.setup();
      renderBoard({ applied: 1 });

      const prev = screen.getByRole("button", { name: "Previous stage" });
      const next = screen.getByRole("button", { name: "Next stage" });
      expect(screen.getByText("Stages 1–3 of 6")).toBeInTheDocument();
      expect(prev).toBeDisabled();

      await user.click(next);
      expect(screen.getByText("Stages 4–6 of 6")).toBeInTheDocument();
      expect(next).toBeDisabled();
      expect(Element.prototype.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 3 * (232 + 12) }));

      await user.click(prev);
      expect(screen.getByText("Stages 1–3 of 6")).toBeInTheDocument();
      expect(prev).toBeDisabled();
    } finally {
      clientWidth.mockRestore();
      offsetWidth.mockRestore();
    }
  });

  it("keeps rejected and withdrawn in a strip under the six stages, collapsed by default", async () => {
    const user = userEvent.setup();
    renderBoard({ applied: 1, rejected: 2 });

    expect(document.querySelectorAll("[data-board-column]")).toHaveLength(6);
    const toggle = screen.getByRole("button", { name: "Show" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByText("Rejected (2)")).toBeInTheDocument();
    // The strip is not a drop target: dropping there must not move anything.
    const strip = screen.getByRole("heading", { name: "Rejected & withdrawn" }).closest("section") as HTMLElement;
    fireEvent.drop(strip, { dataTransfer: {} });
    expect(onMove).not.toHaveBeenCalled();
  });
});
