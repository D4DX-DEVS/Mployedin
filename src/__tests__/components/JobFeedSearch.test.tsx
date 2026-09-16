/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { JobFeedPage } from "@/components/features/job-seeker/feed/JobFeedPage";
import { writeQuery } from "@/lib/ui/urlQuery";

/**
 * The seeker job board hand-rolled its search: local useState plus a 400ms
 * useDebounce, seeded from `?search=` but never writing back to it. Two
 * consequences this suite pins down — Enter was a dead key (no form, no submit
 * handler, only Escape was bound), and a search the user typed had no address,
 * so it could not be shared, bookmarked, or restored with Back. Every other
 * searchable list in the app uses the shared useUrlFilter hook.
 */

/* A no-op replace mock would strand lib/ui/urlQuery's module-level `pending`
   cache: it hands back the query string it last wrote until window.location
   catches up, so one test's search leaks into the next. Applying the href is
   also what the real router does. */
const replace = jest.fn((href: string) => {
  window.history.replaceState({}, "", href);
});
let currentParams = new URLSearchParams();

/* Keep useSearchParams, window.location AND urlQuery's `pending` cache in
   agreement. Setting history alone is not enough: `pending` still holds the
   previous test's string, and readQuery only drops it once it matches
   window.location, so the stale value wins. Going through writeQuery is what
   makes the cache coherent again. */
function setUrl(search: string) {
  currentParams = new URLSearchParams(search);
  writeQuery(new URLSearchParams(search), (href) =>
    window.history.replaceState({}, "", href)
  );
}

jest.mock("next/navigation", () => ({
  useSearchParams: () => currentParams,
  useRouter: () => ({ replace, push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/en/job-seeker/jobs",
  useParams: () => ({ locale: "en" }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _p, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/hooks/useFeatureGate", () => ({
  useFeatureGate: () => ({ allowed: true, isLoading: false, limit: null, used: 0 }),
}));
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: jest.fn() }));

// The board's own children are not under test; stub them so the suite fails
// only for search-behaviour reasons.
jest.mock("@/components/features/job-seeker/feed/JobFeedCard", () => ({
  JobFeedCard: ({ job }: { job: { _id: string; title: string } }) => <div>{job.title}</div>,
}));
jest.mock("@/components/features/job-seeker/feed/JobFeedSidebar", () => ({
  JobFeedSidebar: () => <div />,
}));
jest.mock("@/components/features/job-seeker/feed/EasyApplyFlowDialog", () => ({
  EasyApplyFlowDialog: () => null,
}));
jest.mock("@/components/features/job-seeker/feed/SaveSearchDialog", () => ({
  SaveSearchDialog: () => null,
}));

const searchCalls: string[] = [];

// The board's infinite-scroll sentinel constructs one; jsdom ships no such API.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
  NoopIntersectionObserver;

beforeEach(() => {
  jest.clearAllMocks();
  searchCalls.length = 0;
  setUrl("");

  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/jobs") && url.includes("search=")) {
      searchCalls.push(new URL(url, "http://localhost").searchParams.get("search") ?? "");
      return {
        ok: true,
        json: async () => ({ jobs: [], total: 0, pagination: { total: 0 } }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        jobs: [], nextCursor: null, total: 0, poolPage: 1, totalPoolPages: 1,
        totalJobs: 0, matchedCount: 0, strongMatches: 0, newThisWeek: 0,
        appliedJobIds: [],
      }),
    } as Response;
  }) as typeof fetch;
});

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <JobFeedPage locale="en" />
    </QueryClientProvider>
  );
}

const searchBox = () => screen.getByRole("searchbox") as HTMLInputElement;

describe("job board search", () => {
  it("exposes the search field inside a search landmark", async () => {
    renderBoard();
    await waitFor(() => expect(searchBox()).toBeInTheDocument());
    expect(searchBox().closest("form")).not.toBeNull();
    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("applies the query on Enter without waiting out the debounce", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderBoard();

    await waitFor(() => expect(searchBox()).toBeInTheDocument());
    await user.type(searchBox(), "developer");
    await user.keyboard("{Enter}");

    // No timer advance at all: Enter must not depend on the 400ms debounce.
    await waitFor(() => expect(searchCalls).toContain("developer"));
    jest.useRealTimers();
  });

  it("puts the typed query in the URL so the search can be shared", async () => {
    const user = userEvent.setup();
    renderBoard();

    await waitFor(() => expect(searchBox()).toBeInTheDocument());
    await user.type(searchBox(), "designer");

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const href = String(replace.mock.calls.at(-1)?.[0] ?? "");
    expect(new URL(href, "http://localhost").searchParams.get("search")).toBe("designer");
  });

  it("seeds the box from ?search= so deep links keep working", async () => {
    setUrl("search=analyst");
    renderBoard();
    await waitFor(() => expect(searchBox().value).toBe("analyst"));
  });

  it("clears with the X button instead of submitting the form", async () => {
    const user = userEvent.setup();
    renderBoard();

    await waitFor(() => expect(searchBox()).toBeInTheDocument());
    await user.type(searchBox(), "analyst");

    const clear = screen.getByRole("button", { name: /clear/i });
    expect(clear).toHaveAttribute("type", "button");
    await user.click(clear);
    expect(searchBox().value).toBe("");
  });
});
