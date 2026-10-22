/**
 * @jest-environment jsdom
 */
/**
 * Admin → GDPR on a phone (the owner's two screenshots): "Erasure" was squeezed
 * to a letter per line beside two buttons, and "In Progress" requests printed
 * "Unknown status". Each request is now a three-line card (who, what and
 * status, actions); the type label never shrinks or breaks; every button is at
 * least 44px; the consent logs are cards that show the choice itself.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminGdprPage from "@/app/[locale]/(dashboard)/admin/gdpr/page";
import { GdprRequestCards } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/GdprRequestCards";
import { RequestStatusBadge } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/RequestStatusBadge";
import { CookieChoiceCards, OtherConsentCards } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/ConsentPhoneCards";
import type { GdprRequestRow } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/types";
import type { CookieChoiceRow } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/cookieChoice";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/en/admin/gdpr",
}));

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => ({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    setPage: jest.fn(),
    setLimit: jest.fn(),
    updateTotal: jest.fn(),
    resetPage: jest.fn(),
    paginationParams: () => new URLSearchParams({ page: "1", limit: "10" }),
  }),
}));
jest.mock("@/components/shared/PaginationControls", () => ({ PaginationControls: () => null }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// Row menus are Radix dropdowns; render quick buttons and menu items alike as
// plain buttons, and keep the class the row was given so the 44px rule can be checked.
type MockAction = { key: string; label: string; onSelect: () => void };
jest.mock("@/components/shared/RowActions", () => ({
  RowActions: ({ quick = [], menu = [], className }: { quick?: MockAction[]; menu?: MockAction[]; className?: string }) => (
    <div data-testid="row-actions" className={className}>
      {[...quick, ...menu].map((item) => (
        <button key={item.key} type="button" onClick={item.onSelect}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

function setPhone(isPhone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: isPhone && query.includes("max-width: 639px"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      onchange: null,
      dispatchEvent: jest.fn(),
    }),
  });
}

afterEach(() => {
  // jsdom has no matchMedia: leave it as it was found.
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const row = (over: Partial<GdprRequestRow>): GdprRequestRow => ({
  _id: "64d000000000000000000001",
  userId: "64d000000000000000000003",
  userName: "Sara Ahmed",
  userEmail: "sara@example.com",
  requestType: "delete",
  status: "pending",
  createdAt: "2026-10-18T10:00:00Z",
  handledByName: null,
  ...over,
});

const REQUESTS: GdprRequestRow[] = [
  row({ _id: "64d00000000000000000a001", userName: "Sara Pending" }),
  row({ _id: "64d00000000000000000a002", userName: "Omar Started", status: "in_progress", handledByName: "Super Admin" }),
  row({ _id: "64d00000000000000000a003", userName: "Lina Refused", status: "rejected", completedAt: "2026-10-20T09:00:00Z" }),
  row({ _id: "64d00000000000000000a004", userName: "Hadi Done", requestType: "export", status: "completed", completedAt: "2026-10-19T09:00:00Z" }),
  row({ _id: "64d00000000000000000a005", userName: "Noor Rectify", requestType: "rectification" }),
  row({ _id: "64d00000000000000000a006", userName: "Rana Restrict", requestType: "restrict", status: "in_progress" }),
  row({ _id: "64d00000000000000000a007", userName: "Gone Person", status: "cancelled" }),
];

const cardOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("GdprRequestCards", () => {
  const renderCards = (actionsFor = jest.fn(() => [] as never[]), onView = jest.fn()) => {
    render(<GdprRequestCards requests={REQUESTS} onView={onView} actionsFor={actionsFor} />);
    return { actionsFor, onView };
  };

  it("is one card per request, named Data Requests", () => {
    renderCards();

    const list = screen.getByRole("list", { name: "Data Requests" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(REQUESTS.length);
  });

  it.each([
    ["Sara Pending", "Erasure"],
    ["Hadi Done", "Data Export"],
    ["Noor Rectify", "Rectification"],
    ["Rana Restrict", "Restrict Processing"],
  ])("%s: the type label (%s) never shrinks or breaks, so beside buttons it wraps around instead of going letter by letter", (name, label) => {
    renderCards();

    const text = within(cardOf(name)).getByText(label);
    expect(text).toHaveClass("shrink-0", "whitespace-nowrap");
    expect(text.querySelector("svg")).toHaveClass("shrink-0");
  });

  it("words 'in progress' instead of 'Unknown status'", () => {
    renderCards();

    expect(within(cardOf("Omar Started")).getByText("In Progress")).toBeInTheDocument();
    expect(within(cardOf("Rana Restrict")).getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText(/unknown status/i)).not.toBeInTheDocument();
  });

  it("shows when it was submitted, and when it was completed only if it was", () => {
    renderCards();

    expect(within(cardOf("Sara Pending")).getByText(/^Submitted /)).toBeInTheDocument();
    expect(within(cardOf("Sara Pending")).queryByText(/^Completed /)).not.toBeInTheDocument();
    expect(within(cardOf("Hadi Done")).getByText(/^Completed /)).toBeInTheDocument();
  });

  it("shows when a refusal was decided as Refused, not Completed", () => {
    renderCards();

    expect(within(cardOf("Lina Refused")).getByText(/^Refused /)).toBeInTheDocument();
    expect(within(cardOf("Lina Refused")).queryByText(/^Completed /)).not.toBeInTheDocument();
  });

  it("offers View on every card and the status moves each request still has", async () => {
    const actionsFor = jest.fn((r: GdprRequestRow) =>
      r.status === "pending" ? [{ key: "complete", label: "Complete", icon: (() => null) as never, onSelect: jest.fn() }] : [],
    );
    const { onView } = renderCards(actionsFor as never);

    for (const r of REQUESTS) {
      expect(within(cardOf(r.userName)).getByRole("button", { name: "View" })).toBeInTheDocument();
    }
    expect(within(cardOf("Sara Pending")).getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(within(cardOf("Lina Refused")).queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();

    await userEvent.click(within(cardOf("Omar Started")).getByRole("button", { name: "View" }));
    expect(onView).toHaveBeenCalledWith(REQUESTS[1]);
  });

  it("gives the actions row a wrapping layout and 44px buttons (not 'flex-wrap', which the phone chip rule shrinks to 30px)", () => {
    renderCards();

    const actions = within(cardOf("Sara Pending")).getByTestId("row-actions");
    expect(actions).toHaveClass("[flex-flow:row_wrap]", "[&_button]:min-h-11", "[&_button]:min-w-11");
    expect(actions.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/);
  });

  it("keeps the e-mail left to right and cut with an ellipsis, so an Arabic page never cuts its start", () => {
    renderCards();

    const email = within(cardOf("Sara Pending")).getByText("sara@example.com");
    expect(email).toHaveAttribute("dir", "ltr");
    expect(email).toHaveClass("truncate");
  });
});

describe("RequestStatusBadge", () => {
  it.each([
    ["pending", "Pending"],
    ["in_progress", "In Progress"],
    ["completed", "Completed"],
    ["rejected", "Rejected"],
  ])("%s reads %s", (status, text) => {
    render(<RequestStatusBadge status={status} />);

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/unknown status/i)).not.toBeInTheDocument();
  });
});

describe("cookie choice cards", () => {
  const choice = (over: Partial<CookieChoiceRow>): CookieChoiceRow => ({
    userId: "64d000000000000000000003",
    userName: "Visitor One",
    userEmail: "visitor@example.com",
    receiptId: "5a2e21b7-721b-4fc7-9db8-161ee89f3fd0",
    recordedAt: "2026-10-21T18:07:20Z",
    source: "cookie_banner",
    policyVersion: "cookie-wording-v1",
    preferences: false,
    media: false,
    outcome: "rejected",
    ...over,
  });

  it("shows the choice itself (words and icon), what it covers, and where it came from", () => {
    render(<CookieChoiceCards rows={[choice({})]} onLookup={jest.fn()} onView={jest.fn()} />);

    const card = screen.getByRole("list", { name: "Cookie choices" }).querySelector("li") as HTMLElement;
    expect(within(card).getByText("Visitor One")).toBeInTheDocument();
    expect(within(card).getByText("Rejected all")).toBeInTheDocument();
    expect(within(card).getByText("Display settings: Off")).toBeInTheDocument();
    expect(within(card).getByText("YouTube videos: Off")).toBeInTheDocument();
    expect(within(card).getByText(/Cookie banner/)).toBeInTheDocument();
  });

  it("looks the reference up or opens the record, with two 44px buttons that wrap", async () => {
    const onLookup = jest.fn();
    const onView = jest.fn();
    render(<CookieChoiceCards rows={[choice({})]} onLookup={onLookup} onView={onView} />);

    const lookup = screen.getByRole("button", { name: /Look up choice reference 5a2e21b7/ });
    const view = screen.getByRole("button", { name: "View record for Visitor One" });
    expect(lookup).toHaveTextContent("5a2e21b7");
    expect(lookup).toHaveClass("min-h-11");
    expect(view).toHaveClass("min-h-11");
    expect(lookup.parentElement).toHaveClass("[flex-flow:row_wrap]");

    await userEvent.click(lookup);
    await userEvent.click(view);
    expect(onLookup).toHaveBeenCalledWith("5a2e21b7-721b-4fc7-9db8-161ee89f3fd0");
    expect(onView).toHaveBeenCalledWith("5a2e21b7-721b-4fc7-9db8-161ee89f3fd0");
  });

  it("has no buttons for a choice written before references existed", () => {
    render(<CookieChoiceCards rows={[choice({ receiptId: null })]} onLookup={jest.fn()} onView={jest.fn()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("other consent cards", () => {
  it("shows who, which consent and its version, yes or no in words, and where and when", () => {
    render(
      <OtherConsentCards
        rows={[
          { _id: "c1", userName: "Visitor One", userEmail: "visitor@example.com", consentType: "terms_and_privacy", granted: true, timestamp: "2026-10-01T15:48:00Z", source: "registration", policyVersion: "2026-09-01" },
          { _id: "c2", userName: "Visitor Two", userEmail: null, consentType: "marketing", granted: false, timestamp: "2026-10-02T08:00:00Z", source: null },
        ]}
      />,
    );

    const list = screen.getByRole("list", { name: "Other consents" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(within(first).getByText("Terms & Privacy Policy")).toBeInTheDocument();
    expect(within(first).getByText("Yes")).toBeInTheDocument();
    expect(within(second).getByText("No")).toBeInTheDocument();
    expect(within(second).queryByText(/@/)).not.toBeInTheDocument();
  });
});

describe("admin GDPR page on a phone", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).startsWith("/api/admin/gdpr?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: REQUESTS,
            total: REQUESTS.length,
            stats: { totalRequests: 7, pendingRequests: 2, completedRequests: 1, avgResponseMs: 3_600_000, dataSubjects: 3, activeConsents: 0 },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [], total: 0 }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("lists requests as cards, not a table, and Reject still opens the form", async () => {
    setPhone(true);
    render(<AdminGdprPage />);

    const list = await screen.findByRole("list", { name: "Data Requests" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(REQUESTS.length);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/unknown status/i)).not.toBeInTheDocument();

    await userEvent.click(within(cardOf("Sara Pending")).getByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("dialog", { name: "Reject this request?" })).toBeInTheDocument();
  });

  it("keeps the table on a wider screen", async () => {
    setPhone(false);
    render(<AdminGdprPage />);

    await screen.findAllByText("Sara Pending");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Data Requests" })).not.toBeInTheDocument();
  });
});
