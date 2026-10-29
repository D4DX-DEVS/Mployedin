/**
 * @jest-environment jsdom
 */
/**
 * Admin > GDPR > Consent Logs: the consent record dialog (from a row's View
 * and from the lookup's "View record") and the Terms card. The cards, table,
 * filters and views: adminGdprConsentTab.test.tsx.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { ConsentLogsTab } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/ConsentLogsTab";
import { ENTRIES, REF, api, calls, choicesTable, fail, fetchMock, installConsentFetch, ok, rowOf } from "../helpers/consentLogsTab";

const replaceMock = jest.fn((href: string) => window.history.replaceState(null, "", href));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => "/en/admin/gdpr",
  useParams: () => ({ locale: "en" }),
}));
jest.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(value: T) => value }));

const confirm = jest.fn();
jest.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm, ConfirmDialogNode: null }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/en/admin/gdpr");
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  installConsentFetch();
});

describe("consent record dialog", () => {
  async function openRecord(name: string) {
    render(<ConsentLogsTab />);
    const row = rowOf(await choicesTable(), name);
    await userEvent.click(within(row).getByRole("button", { name: /View/ }));
    return screen.findByRole("dialog", { name: "Consent record" });
  }

  it("shows who, the status, the reference, when, where, the banner version and the wording", async () => {
    const dialog = await openRecord("Sara Ahmed");

    await within(dialog).findByText("Replaced by a later choice");
    expect(within(dialog).getByText("Sara Ahmed")).toBeInTheDocument();
    expect(within(dialog).getByText("sara@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText(REF)).toBeInTheDocument();
    expect(within(dialog).getByText("Cookie banner")).toBeInTheDocument();
    expect(within(dialog).getByText("Cookie wording v1")).toBeInTheDocument();
    expect(within(dialog).getByText("Same as today")).toBeInTheDocument();
    expect(calls(`/api/admin/gdpr/consent/choices/${REF}`)).toHaveLength(1);
  });

  it("lists what the choice allowed, with each category's description from Cookie settings", async () => {
    const dialog = await openRecord("Sara Ahmed");
    const categories = await within(dialog).findByRole("table", { name: "What the choice allowed" });

    const necessary = within(categories).getByText("Strictly necessary").closest("tr") as HTMLElement;
    expect(necessary).toHaveTextContent("Always on");
    expect(necessary).toHaveTextContent("Needed to provide the services you ask for");
    const display = within(categories).getByText("Display settings").closest("tr") as HTMLElement;
    expect(display).toHaveTextContent("Off");
    expect(display).toHaveTextContent("Keeps your language, display currency");
    const videos = within(categories).getByText("YouTube videos").closest("tr") as HTMLElement;
    expect(videos).toHaveTextContent("Off");
    expect(videos).toHaveTextContent("Lets videos play on our pages.");
  });

  it("lists the account's other choices newest first, each tagged Earlier or Later in words", async () => {
    const dialog = await openRecord("Sara Ahmed");
    const others = await within(dialog).findByRole("table", { name: "Other choices on this account" });

    const rows = within(others).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Later");
    expect(rows[0]).toHaveTextContent("Accepted all");
    expect(rows[0]).toHaveTextContent("Cookie settings");
    expect(rows[1]).toHaveTextContent("Earlier");
    expect(rows[1]).toHaveTextContent("Custom choice");
    expect(rows[1]).toHaveTextContent("Not recorded");
    expect(within(dialog).queryByText("Previous changes")).not.toBeInTheDocument();
  });

  it("says when there are no other choices, shows Not recorded for a missing category and No longer kept for expired wording", async () => {
    const dialog = await openRecord("Lina Haddad");

    await within(dialog).findByText("Current choice");
    expect(within(dialog).getByText("No other cookie choices are recorded for this account.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("table", { name: "Other choices on this account" })).not.toBeInTheDocument();
    const categories = within(dialog).getByRole("table", { name: "What the choice allowed" });
    expect(within(categories).getByText("YouTube videos").closest("tr")).toHaveTextContent("Not recorded");
    expect(within(dialog).getByText("No longer kept")).toBeInTheDocument();
  });

  it("copies the full reference and says so", async () => {
    const dialog = await openRecord("Sara Ahmed");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Copy choice reference" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(REF);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Choice reference copied"));
  });

  it("says it couldn't copy when the browser refuses", async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValue(new Error("denied"));
    const dialog = await openRecord("Sara Ahmed");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Copy choice reference" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't copy the choice reference"));
  });

  it("opens from the lookup's View record for a signed-in choice", async () => {
    render(<ConsentLogsTab />);
    const sara = rowOf(await choicesTable(), "Sara Ahmed");
    await userEvent.click(within(sara).getByRole("button", { name: new RegExp(REF) }));

    const lookup = screen.getByRole("group", { name: "Find a consent record" });
    expect(await within(lookup).findByText("First recorded cookie choice for this account")).toBeInTheDocument();
    await userEvent.click(within(lookup).getByRole("button", { name: "View record" }));

    const dialog = await screen.findByRole("dialog", { name: "Consent record" });
    expect(await within(dialog).findByText("Replaced by a later choice")).toBeInTheDocument();
  });
});

describe("other consent details", () => {
  async function openEntry() {
    render(<ConsentLogsTab />);
    await choicesTable();
    await userEvent.click(screen.getByRole("tab", { name: "Other consents" }));
    await screen.findByText("Omar Khan");
    const row = rowOf(screen.getAllByRole("table")[0], "Omar Khan");
    await userEvent.click(within(row).getByRole("button", { name: /View/ }));
    return screen.findByRole("dialog", { name: "Consent details" });
  }

  it("shows who, the consent and what it means, the answer, status, source and version", async () => {
    const dialog = await openEntry();

    await within(dialog).findByText("Replaced by a later answer");
    expect(within(dialog).getByText("Omar Khan")).toBeInTheDocument();
    expect(within(dialog).getByText("omar@example.com")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Terms & Privacy Policy").length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/Agreement to the Terms of Service/)).toBeInTheDocument();
    expect(within(dialog).getByText("Sign-up form")).toBeInTheDocument();
    expect(within(dialog).getByText(/An older version/)).toBeInTheDocument();
    expect(within(dialog).queryByText("10.0.0.1")).not.toBeInTheDocument();
    expect(calls("/api/admin/gdpr/consent/entries/64d0000000000000000000b2")).toHaveLength(1);
  });

  it("lists the account's other answers of the same type, tagged Later or Earlier", async () => {
    const dialog = await openEntry();
    const history = await within(dialog).findByRole("table", { name: "Other answers of this type on this account" });

    const [, later] = within(history).getAllByRole("row");
    expect(later).toHaveTextContent("Later");
    expect(later).toHaveTextContent("Yes");
    expect(later).toHaveTextContent("Accepted updated terms");
  });

  it("says when the entry no longer exists", async () => {
    const saved = ENTRIES["64d0000000000000000000b2"];
    delete ENTRIES["64d0000000000000000000b2"];
    try {
      const dialog = await openEntry();
      expect(await within(dialog).findByText("This consent entry no longer exists")).toBeInTheDocument();
    } finally {
      ENTRIES["64d0000000000000000000b2"] = saved;
    }
  });
});

describe("Terms card", () => {
  const termsCard = async () => (await screen.findByText("Terms of Service & Privacy Policy")).closest("section") as HTMLElement;

  it("shows the version as a date, how many still have to accept, and links to both documents", async () => {
    render(<ConsentLogsTab />);
    const terms = await termsCard();

    expect(terms).toHaveTextContent("Still to accept: 37");
    expect(terms).toHaveTextContent(/Current version: .*2026/);
    expect(terms).not.toHaveTextContent("v1.0");
    expect(within(terms).getByRole("link", { name: /View terms/ })).toHaveAttribute("href", "/en/terms");
    expect(within(terms).getByRole("link", { name: /View privacy policy/ })).toHaveAttribute("href", "/en/privacy");
  });

  it("shows a skeleton while the terms version loads", async () => {
    api.terms = () => new Promise(() => undefined);
    render(<ConsentLogsTab />);

    expect(await screen.findByTestId("terms-card-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a new terms version" })).not.toBeInTheDocument();
  });

  it("says it couldn't load the terms version, and Retry loads it", async () => {
    let failing = true;
    api.terms = () => (failing ? fail() : ok(api.termsBody));
    render(<ConsentLogsTab />);

    const error = (await screen.findByText("We couldn't load the terms version")).closest("[role='alert']") as HTMLElement;
    failing = false;
    await userEvent.click(within(error).getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Still to accept: 37")).toBeInTheDocument();
  });

  it("takes who still has to accept from the server only: an answer without it is an error, never a guess", async () => {
    const { pendingUsers: _pending, ...withoutPending } = api.termsBody;
    api.terms = () => ok(withoutPending);
    render(<ConsentLogsTab />);

    expect(await screen.findByText("We couldn't load the terms version")).toBeInTheDocument();
    expect(screen.queryByText(/Still to accept/)).not.toBeInTheDocument();
  });

  it("names the button for what it does and says who is asked again", async () => {
    confirm.mockResolvedValue(false);
    render(<ConsentLogsTab />);
    const button = await screen.findByRole("button", { name: "Start a new terms version" });

    expect(screen.getByText("Everyone except admins will be asked to accept the current terms again before they continue.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask everyone to accept again" })).not.toBeInTheDocument();
    await userEvent.click(button);

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "Start a new terms version?",
      message: expect.stringContaining("including people who have already accepted"),
      variant: "destructive",
    }));
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("starts the new version once confirmed and shows the new counts", async () => {
    confirm.mockResolvedValue(true);
    render(<ConsentLogsTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Start a new terms version" }));

    await waitFor(() => expect(screen.getByText("Still to accept: 40")).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalled();
  });
});
