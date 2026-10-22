/**
 * @jest-environment jsdom
 */
/**
 * [LEGAL] UK GDPR Art 12(4): a person whose request is refused is told why.
 * Their Data & Privacy history shows the reason for a refused request, and for
 * a finished one that was only partly done. The team's internal notes are never
 * shown.
 */
import React from "react";
import { renderWithProviders, screen, within } from "@/test-utils";
import { DataPrivacyPanel } from "@/components/features/privacy/DataPrivacyPanel";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const INTERNAL = "Spoke to legal, keep the invoices for 6 years";

const base = { _id: "64d000000000000000000002", requestType: "delete", createdAt: "2026-09-01T10:00:00Z", completedAt: null, outcome: null, outcomeReason: null };

function serve(requests: unknown[]) {
  global.fetch = jest.fn(async (url: string) => {
    if (url === "/api/gdpr/requests") return { ok: true, json: async () => ({ requests }) };
    if (url === "/api/user/consent") return { ok: true, json: async () => ({ consents: { terms_and_privacy: null, cookies: null } }) };
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

async function historyItem(index = 0) {
  const heading = await screen.findByRole("heading", { name: "Your data requests" });
  // The list replaces a skeleton once the requests arrive.
  const items = await within(heading.closest("section") as HTMLElement).findAllByRole("listitem");
  return items[index];
}

describe("Data & Privacy: your data requests", () => {
  it("tells the person why a request was refused", async () => {
    serve([{ ...base, status: "rejected", outcomeReason: "We could not verify who you are." }]);
    renderWithProviders(<DataPrivacyPanel />);

    const item = await historyItem();
    expect(within(item).getByText("Rejected")).toBeInTheDocument();
    expect(within(item).getByText("Why we refused this request")).toBeInTheDocument();
    expect(within(item).getByText("We could not verify who you are.")).toBeInTheDocument();
  });

  it("tells the person when a request was refused", async () => {
    serve([{ ...base, status: "rejected", completedAt: "2026-09-04T10:00:00Z", outcomeReason: "We could not verify who you are." }]);
    renderWithProviders(<DataPrivacyPanel />);

    const item = await historyItem();
    expect(within(item).getByText(/^Refused on (Sep 4, 2026|2026-09-04)/)).toBeInTheDocument();
  });

  it("tells the person what was not done, and why, on a request that was completed in part", async () => {
    serve([{ ...base, status: "completed", completedAt: "2026-09-03T10:00:00Z", outcome: "Account erased", outcomeReason: "Invoices were kept: the law requires it" }]);
    renderWithProviders(<DataPrivacyPanel />);

    const item = await historyItem();
    expect(within(item).getByText("What we did not do, and why")).toBeInTheDocument();
    expect(within(item).getByText("Invoices were kept: the law requires it")).toBeInTheDocument();
  });

  it.each([
    ["a refused request", { status: "rejected", outcomeReason: "We could not verify who you are." }],
    ["a completed request that was only partly done", { status: "completed", completedAt: "2026-09-03T10:00:00Z", outcomeReason: "Invoices were kept" }],
  ])("[LEGAL] Art 12(4): tells the person they can complain to the ICO, on %s", async (_label, over) => {
    serve([{ ...base, ...over }]);
    renderWithProviders(<DataPrivacyPanel />);

    const item = await historyItem();
    expect(within(item).getByText(/If you disagree, you can contact us, or complain to the/)).toBeInTheDocument();
    const link = within(item).getByRole("link", { name: "Information Commissioner's Office (ico.org.uk) (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://ico.org.uk/make-a-complaint/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not show the complaint line where there is no reason to disagree with", async () => {
    serve([
      { ...base, status: "completed", completedAt: "2026-09-03T10:00:00Z" },
      { ...base, _id: "64d000000000000000000003", status: "pending", outcomeReason: "A draft" },
    ]);
    renderWithProviders(<DataPrivacyPanel />);

    await historyItem();
    expect(screen.queryByRole("link", { name: /Information Commissioner/ })).not.toBeInTheDocument();
  });

  it("adds nothing to a completed request that has no reason", async () => {
    serve([{ ...base, status: "completed", completedAt: "2026-09-03T10:00:00Z", outcome: "Account erased" }]);
    renderWithProviders(<DataPrivacyPanel />);

    const item = await historyItem();
    expect(within(item).queryByText(/why/i)).not.toBeInTheDocument();
    expect(within(item).queryByText("Account erased")).not.toBeInTheDocument();
  });

  it("adds nothing to a refused request that somehow has no reason", async () => {
    serve([{ ...base, status: "rejected" }]);
    renderWithProviders(<DataPrivacyPanel />);

    const item = await historyItem();
    expect(within(item).queryByText(/why/i)).not.toBeInTheDocument();
  });

  it.each(["pending", "in_progress", "cancelled"])("shows no reason on a %s request", async (status) => {
    serve([{ ...base, status, outcomeReason: "A draft the team has not finished" }]);
    renderWithProviders(<DataPrivacyPanel />);

    const item = await historyItem();
    expect(within(item).queryByText("A draft the team has not finished")).not.toBeInTheDocument();
  });

  it("never shows the internal notes, even if they were sent by mistake", async () => {
    serve([{ ...base, status: "rejected", outcomeReason: "Not verified", adminNotes: INTERNAL }]);
    const { container } = renderWithProviders(<DataPrivacyPanel />);

    await historyItem();
    expect(container.textContent).not.toContain(INTERNAL);
    expect(screen.queryByText(/Internal notes/i)).not.toBeInTheDocument();
  });

  it("keeps a long reason inside the card and the line breaks the team wrote", async () => {
    serve([{ ...base, status: "rejected", outcomeReason: "Line one\nLine two" }]);
    renderWithProviders(<DataPrivacyPanel />);

    const item = await historyItem();
    const reason = within(item).getByText(/Line one/);
    expect(reason).toHaveClass("whitespace-pre-wrap");
    expect(reason).toHaveClass("break-words");
  });
});
