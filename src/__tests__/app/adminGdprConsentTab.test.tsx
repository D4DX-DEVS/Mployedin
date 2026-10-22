/**
 * @jest-environment jsdom
 */
/**
 * Admin > GDPR > Consent Logs, redesigned (owner-approved 2026-10-21):
 * cookie-choice count cards with a period, one table row per saved cookie
 * choice (not one per category), its filters and their URL keys, the two views
 * (tabs), and the other consents with no IP address column. The record dialog
 * and the Terms card: adminGdprConsentRecord.test.tsx.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConsentLogsTab } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/ConsentLogsTab";
import {
  OTHER_ROWS,
  REF,
  ROWS,
  api,
  calls,
  card,
  cards,
  choicesTable,
  fail,
  fetchMock,
  installConsentFetch,
  ok,
  rowOf,
  urlParam,
} from "../helpers/consentLogsTab";

const replaceMock = jest.fn((href: string) => window.history.replaceState(null, "", href));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => "/en/admin/gdpr",
  useParams: () => ({ locale: "en" }),
}));
jest.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(value: T) => value }));
jest.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm: jest.fn(), ConfirmDialogNode: null }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

/** For the tests that type, pick and click through several steps: the 5 s default is tight when every suite runs at once. */
const LONG_TEST_MS = 20_000;

const lastChoices = () => calls("/api/admin/gdpr/consent/choices").at(-1)!;
const lastOther = () => calls("/api/admin/gdpr/consent").at(-1)!;

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/en/admin/gdpr");
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  installConsentFetch();
});

describe("cookie choice count cards", () => {
  it("shows four cards, each after Total with its share of the total", async () => {
    render(<ConsentLogsTab />);

    await waitFor(() => expect(within(card("Total choices")).getByText("20")).toBeInTheDocument());
    expect(card("Accepted all")).toHaveTextContent("10");
    expect(card("Accepted all")).toHaveTextContent("50% of total");
    expect(card("Rejected all")).toHaveTextContent("6");
    expect(card("Rejected all")).toHaveTextContent("30% of total");
    expect(card("Custom choices")).toHaveTextContent("4");
    expect(card("Custom choices")).toHaveTextContent("20% of total");
    expect(card("Total choices")).not.toHaveTextContent("% of total");
    expect(within(cards()).getAllByRole("listitem")).toHaveLength(4);
  });

  it("says 0% rather than dividing by nothing when nobody chose", async () => {
    api.summary = { days: 30, total: 0, acceptedAll: 0, rejectedAll: 0, custom: 0 };
    render(<ConsentLogsTab />);

    await waitFor(() => expect(card("Rejected all")).toHaveTextContent("0% of total"));
    expect(cards()).not.toHaveTextContent("NaN");
  });

  it("keeps the counting help line, once, and no longer shows the old one-line summary", async () => {
    render(<ConsentLogsTab />);

    expect(await screen.findAllByText("Each choice is counted once. Someone who changes their choice is counted again.")).toHaveLength(1);
    expect(screen.queryByRole("group", { name: /Cookie choices in the last/ })).not.toBeInTheDocument();
  });

  it("counts the last 30 days by default, for the cards and the table alike", async () => {
    render(<ConsentLogsTab />);
    await choicesTable();

    expect(calls("/api/admin/gdpr/consent/summary").at(-1)?.searchParams.get("days")).toBe("30");
    expect(lastChoices().searchParams.get("days")).toBe("30");
    expect(screen.getByRole("combobox", { name: "Period" })).toHaveTextContent("Last 30 days");
  });

  it("follows the period picker: cards and table reload for it, and the URL keeps it", async () => {
    render(<ConsentLogsTab />);
    await choicesTable();

    await userEvent.click(screen.getByRole("combobox", { name: "Period" }));
    await userEvent.click(await screen.findByRole("option", { name: "Last 7 days" }));

    await waitFor(() => expect(calls("/api/admin/gdpr/consent/summary").at(-1)?.searchParams.get("days")).toBe("7"));
    await waitFor(() => expect(lastChoices().searchParams.get("days")).toBe("7"));
    expect(urlParam("period")).toBe("7");
  });

  it("opens on the period in the link", async () => {
    window.history.replaceState(null, "", "/en/admin/gdpr?period=365");
    render(<ConsentLogsTab />);
    await choicesTable();

    expect(calls("/api/admin/gdpr/consent/summary").at(-1)?.searchParams.get("days")).toBe("365");
    expect(screen.getByRole("combobox", { name: "Period" })).toHaveTextContent("Last 12 months");
  });

  it("offers exactly the four periods", async () => {
    render(<ConsentLogsTab />);
    await userEvent.click(screen.getByRole("combobox", { name: "Period" }));

    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Last 7 days", "Last 30 days", "Last 90 days", "Last 12 months"]);
  });

  it("says it couldn't load the counts, and Retry loads them again", async () => {
    let failing = true;
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input: string, init?: RequestInit) =>
      failing && String(input).startsWith("/api/admin/gdpr/consent/summary") ? fail() : base(input, init),
    );
    render(<ConsentLogsTab />);

    expect(await within(cards()).findByText("We couldn't load the cookie choice counts.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(within(cards()).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(within(card("Total choices")).getByText("20")).toBeInTheDocument());
  });
});

describe("cookie choices table: one row per saved choice", () => {
  it("lists one row per choice with the user, the choice badge and both categories in words", async () => {
    render(<ConsentLogsTab />);
    const table = await choicesTable();

    expect(within(table).getAllByRole("row")).toHaveLength(ROWS.length + 1);
    const sara = rowOf(table, "Sara Ahmed");
    expect(within(sara).getByText("sara@example.com")).toBeInTheDocument();
    expect(within(sara).getByText("Rejected all")).toBeInTheDocument();
    expect(within(sara).getByText("Display settings: Off")).toBeInTheDocument();
    expect(within(sara).getByText("YouTube videos: Off")).toBeInTheDocument();
    expect(within(sara).getByText("Cookie banner")).toBeInTheDocument();
    expect(within(sara).getByText("Cookie wording v1")).toBeInTheDocument();

    const omar = rowOf(table, "Omar Khan");
    expect(within(omar).getByText("Accepted all")).toBeInTheDocument();
    expect(within(omar).getByText("Cookie settings")).toBeInTheDocument();
  });

  it("shows a missing category as Not recorded and the choice as Custom choice", async () => {
    render(<ConsentLogsTab />);
    const lina = rowOf(await choicesTable(), "Lina Haddad");

    expect(within(lina).getByText("Custom choice")).toBeInTheDocument();
    expect(within(lina).getByText("Display settings: On")).toBeInTheDocument();
    expect(within(lina).getByText("YouTube videos: Not recorded")).toBeInTheDocument();
  });

  it("never shows a choice by colour alone: every badge has its words and an icon", async () => {
    render(<ConsentLogsTab />);
    const table = await choicesTable();

    for (const label of ["Rejected all", "Accepted all"]) {
      const badge = within(table).getByText(label).closest("[data-choice-outcome]") as HTMLElement;
      expect(badge.querySelector("svg")).not.toBeNull();
    }
  });

  it("shows the first 8 characters of the reference, the full one on hover, and runs the lookup on a click", async () => {
    render(<ConsentLogsTab />);
    const sara = rowOf(await choicesTable(), "Sara Ahmed");

    const ref = within(sara).getByRole("button", { name: new RegExp(REF) });
    expect(ref).toHaveTextContent(/^1b9d6bcd$/);
    expect(ref).toHaveAttribute("title", REF);
    await userEvent.click(ref);

    await waitFor(() => expect(calls("/api/admin/gdpr/consent/receipt").map((u) => u.searchParams.get("ref"))).toEqual([REF]));
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("says Not recorded for a choice made before references existed, with no View button", async () => {
    render(<ConsentLogsTab />);
    const hana = rowOf(await choicesTable(), "Hana Youssef");

    expect(within(hana).getByText("Not recorded")).toBeInTheDocument();
    expect(within(hana).queryByRole("button", { name: /View/ })).not.toBeInTheDocument();
  });

  it("asks the server for one page of choices with every filter it shows, kept under its own URL keys", async () => {
    render(<ConsentLogsTab />);
    await choicesTable();

    expect(Object.fromEntries(lastChoices().searchParams)).toEqual({ page: "1", pageSize: "10", days: "30", order: "desc" });

    await userEvent.click(screen.getByRole("combobox", { name: "Choice" }));
    await userEvent.click(await screen.findByRole("option", { name: "Rejected all" }));
    await waitFor(() => expect(lastChoices().searchParams.get("outcome")).toBe("rejected"));

    await userEvent.click(screen.getByRole("combobox", { name: "Source" }));
    await userEvent.click(await screen.findByRole("option", { name: "Cookie settings" }));
    await waitFor(() => expect(lastChoices().searchParams.get("source")).toBe("settings"));

    await userEvent.type(screen.getByRole("textbox", { name: "Search by name, e-mail or choice reference" }), "sara");
    await waitFor(() => expect(lastChoices().searchParams.get("search")).toBe("sara"));

    await userEvent.click(screen.getByRole("button", { name: "Sort descending" }));
    await waitFor(() => expect(lastChoices().searchParams.get("order")).toBe("asc"));

    // The search box writes to the URL after a pause (debounced), so wait for it.
    await waitFor(() =>
      expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
        choicesOutcome: "rejected",
        choicesSource: "settings",
        choicesSearch: "sara",
        choicesOrder: "asc",
      }),
    );
  }, LONG_TEST_MS);

  it("never reads Data Requests' page, order or limit, and opens on its own", async () => {
    window.history.replaceState(null, "", "/en/admin/gdpr?page=3&limit=50&sortOrder=asc&status=pending");
    const { unmount } = render(<ConsentLogsTab />);
    await choicesTable();

    expect(Object.fromEntries(lastChoices().searchParams)).toEqual({ page: "1", pageSize: "10", days: "30", order: "desc" });
    unmount();

    // Enough choices for a second page of 25, so the page in the link stands.
    api.choices = () => ok({ data: ROWS, page: 2, pageSize: 25, total: 60, totalPages: 3 });
    window.history.replaceState(null, "", "/en/admin/gdpr?page=3&choicesPage=2&choicesLimit=25&choicesOrder=asc");
    render(<ConsentLogsTab />);
    await choicesTable();
    expect(Object.fromEntries(lastChoices().searchParams)).toEqual({ page: "2", pageSize: "25", days: "30", order: "asc" });
    // Data Requests' own keys are left alone.
    expect(urlParam("page")).toBe("3");
  }, LONG_TEST_MS);

  it("shows an empty state whose Clear filters clears the filters and the period", async () => {
    api.choices = () => ok({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
    window.history.replaceState(null, "", "/en/admin/gdpr?choicesOutcome=custom&choicesSource=banner&period=90");
    render(<ConsentLogsTab />);

    const empty = (await screen.findByText("No cookie choices found")).closest("[data-empty-state]") as HTMLElement;
    expect(empty).toHaveTextContent("Only choices made while signed in are listed.");
    await userEvent.click(within(empty).getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(Object.fromEntries(lastChoices().searchParams)).toEqual({ page: "1", pageSize: "10", days: "30", order: "desc" }));
    expect(urlParam("period")).toBeNull();
  });

  it("counts a period other than 30 days as a filter: Reset in the filter bar puts everything back", async () => {
    window.history.replaceState(null, "", "/en/admin/gdpr?period=7");
    render(<ConsentLogsTab />);
    await choicesTable();

    await userEvent.type(screen.getByRole("textbox", { name: "Search by name, e-mail or choice reference" }), "sara");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(Object.fromEntries(lastChoices().searchParams)).toEqual({ page: "1", pageSize: "10", days: "30", order: "desc" }));
    expect(urlParam("period")).toBeNull();
    // The cleared search reaches the URL after the search box's pause (debounced), like typing does.
    await waitFor(() => expect(urlParam("choicesSearch")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument());
  }, LONG_TEST_MS);

  it("offers no Reset when nothing is filtered", async () => {
    render(<ConsentLogsTab />);
    await choicesTable();

    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("shows a skeleton shaped like the table while it loads", async () => {
    api.choices = () => new Promise(() => undefined);
    render(<ConsentLogsTab />);

    const skeleton = await screen.findByTestId("cookie-choices-skeleton");
    expect(within(skeleton).getAllByRole("columnheader")).toHaveLength(8);
  });

  it("says it couldn't load the choices, and Retry asks again", async () => {
    let failing = true;
    api.choices = () => (failing ? fail() : ok({ data: ROWS, page: 1, pageSize: 10, total: ROWS.length, totalPages: 1 }));
    render(<ConsentLogsTab />);

    expect(await screen.findByText("We couldn't load the cookie choices")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Lina Haddad")).toBeInTheDocument();
  });

  it("has no IP address column", async () => {
    render(<ConsentLogsTab />);
    const table = await choicesTable();

    expect(within(table).queryByText(/IP Address/i)).not.toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "User", "Choice reference", "Choice", "Details", "Source", "Banner version", "Recorded at", "Actions",
    ]);
  });
});

describe("the two views", () => {
  it("are tabs, Cookie choices first and selected", async () => {
    render(<ConsentLogsTab />);
    await choicesTable();

    const list = screen.getByRole("tablist", { name: "Consent records" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Cookie choices", "Other consents"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("switch from the keyboard: the arrow key moves to Other consents and shows it", async () => {
    render(<ConsentLogsTab />);
    await choicesTable();

    screen.getByRole("tab", { name: "Cookie choices" }).focus();
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() => expect(screen.getByRole("tab", { name: "Other consents" })).toHaveAttribute("aria-selected", "true"));
    expect(await screen.findByText("Terms & Privacy Policy")).toBeInTheDocument();
    expect(urlParam("consentView")).toBe("other");
  });
});

describe("other consents", () => {
  async function openOther() {
    render(<ConsentLogsTab />);
    await choicesTable();
    await userEvent.click(screen.getByRole("tab", { name: "Other consents" }));
    return screen.findByText("Terms & Privacy Policy");
  }

  it("still lists Terms rows, from the consents that are not cookie choices", async () => {
    await openOther();

    expect(lastOther().searchParams.get("type")).toBe("other");
    expect(screen.getByText("Omar Khan")).toBeInTheDocument();
    expect(screen.getByText(/^Version of .*2026/)).toBeInTheDocument();
    expect(urlParam("consentView")).toBe("other");
  });

  it("has no IP address column and never prints one", async () => {
    await openOther();

    expect(screen.queryByText(/IP Address/i)).not.toBeInTheDocument();
    expect(screen.queryByText("10.0.0.1")).not.toBeInTheDocument();
  });

  it("filters by the other consent types only", async () => {
    await openOther();
    await userEvent.click(screen.getByRole("combobox", { name: /Consent type/i }));

    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["All consent types", "Terms & Privacy Policy", "Cookies", "Marketing emails"]);
    await userEvent.click(screen.getByRole("option", { name: "Marketing emails" }));
    await waitFor(() => expect(lastOther().searchParams.get("type")).toBe("marketing"));
    expect(urlParam("otherType")).toBe("marketing");
  });

  it("keeps its own page and search: nothing carries over from the Cookie choices view", async () => {
    api.choices = () => ok({ data: ROWS, page: 2, pageSize: 10, total: 40, totalPages: 4 });
    api.other = () => ok({ items: OTHER_ROWS, total: 45 });
    window.history.replaceState(null, "", "/en/admin/gdpr?choicesSearch=sara&choicesPage=2&otherPage=3");
    render(<ConsentLogsTab />);
    await screen.findByText("Sara Ahmed");
    await userEvent.click(screen.getByRole("tab", { name: "Other consents" }));
    await screen.findByText("Terms & Privacy Policy");

    expect(lastOther().searchParams.get("page")).toBe("3");
    expect(lastOther().searchParams.has("search")).toBe(false);
    expect(lastChoices().searchParams.get("page")).toBe("2");
  }, LONG_TEST_MS);
});
