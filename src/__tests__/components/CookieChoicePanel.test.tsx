/**
 * @jest-environment jsdom
 */
/**
 * Admin > GDPR > Consent Logs: "Find a consent record", the lookup of one
 * choice by the reference a visitor quotes. (The counts moved to the cards at
 * the top of the tab: adminGdprConsentTab.test.tsx.)
 *
 * "Reject all" is a choice like any other: it must be as visible and provable
 * as "Accept all", including for visitors who never signed in.
 */
import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { formatDateTime } from "@/lib/ui/intlFormat";
import { CookieChoicePanel } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/CookieChoicePanel";

const REF = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const OTHER_REF = "0f8fad5b-d9cb-469f-a165-70867728950e";

const rejectedAll = {
  receiptId: REF,
  preferences: false,
  media: false,
  version: 1,
  locale: "en",
  createdAt: "2026-10-18T09:30:00.000Z",
  wordingMatchesCurrent: true,
};

type Json = Record<string, unknown>;
type FetchResponse = { ok: boolean; json: () => Promise<Json> };
let lookupResponse: (ref: string) => Promise<FetchResponse>;
const fetchMock = jest.fn();

const ok = (body: Json) => Promise.resolve({ ok: true, json: async () => body });
const fail = () => Promise.resolve({ ok: false, json: async () => ({}) });

const lookupCalls = () =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/admin/gdpr/consent/receipt?"));

beforeEach(() => {
  jest.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  lookupResponse = () => ok({ receipts: [rejectedAll], linkedAccount: null });
  fetchMock.mockImplementation((url: string) => {
    if (String(url).startsWith("/api/admin/gdpr/consent/receipt?")) {
      return lookupResponse(new URL(String(url), "http://localhost").searchParams.get("ref") ?? "");
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const lookupGroup = () => screen.getByRole("group", { name: "Find a consent record" });
const input = () => within(lookupGroup()).getByLabelText("Choice reference");
const lookUpButton = () => within(lookupGroup()).getByRole("button", { name: /Look up|Looking up/ });

async function lookUp(ref = REF) {
  await userEvent.clear(input());
  await userEvent.type(input(), ref);
  await userEvent.click(lookUpButton());
}

describe("cookie choice lookup", () => {
  const INVALID_HINT = /isn't a full choice reference/i;

  it("is headed Find a consent record and says it works for visitors who never signed in", () => {
    render(<CookieChoicePanel request={null} />);

    expect(screen.getByRole("heading", { name: "Find a consent record" })).toBeInTheDocument();
    expect(within(lookupGroup()).getByText(/This also works for visitors who never signed in\./)).toBeInTheDocument();
    // The counts are the cards' job now; the panel makes no summary request.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows where the choice was made, and Not recorded for an older receipt that did not store it", async () => {
    lookupResponse = () =>
      ok({ receipts: [{ ...rejectedAll, source: "settings" }, { ...rejectedAll, createdAt: "2026-10-01T09:30:00.000Z", source: null }], linkedAccount: null });
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const [newer, older] = await within(lookupGroup()).findAllByRole("listitem");
    expect(within(newer).getByText("Source").closest("div")).toHaveTextContent("Cookie settings");
    expect(within(older).getByText("Source").closest("div")).toHaveTextContent("Not recorded");
  });

  describe("a choice made while signed in", () => {
    const linked = (over: Record<string, unknown> = {}) =>
      ok({
        receipts: [rejectedAll],
        linkedAccount: { userId: "u1", userName: "Sara Ahmed", userEmail: "sara@example.com", source: "banner", firstChoice: true, ...over },
      });

    it("says it was the account's first recorded cookie choice", async () => {
      lookupResponse = () => linked();
      render(<CookieChoicePanel request={null} />);
      await lookUp();

      expect(await within(lookupGroup()).findByText("First recorded cookie choice for this account")).toBeInTheDocument();
      expect(within(lookupGroup()).queryByText("A later change to this account's cookie choice")).not.toBeInTheDocument();
    });

    it("says it was a later change", async () => {
      lookupResponse = () => linked({ firstChoice: false });
      render(<CookieChoicePanel request={null} />);
      await lookUp();

      expect(await within(lookupGroup()).findByText("A later change to this account's cookie choice")).toBeInTheDocument();
    });

    it("takes the source from the account when the receipt did not store it", async () => {
      lookupResponse = () => linked();
      render(<CookieChoicePanel request={null} />);
      await lookUp();

      const result = await within(lookupGroup()).findByRole("listitem");
      expect(within(result).getByText("Source").closest("div")).toHaveTextContent("Cookie banner");
    });

    it("opens the consent record from View record", async () => {
      lookupResponse = () => linked();
      const onViewRecord = jest.fn();
      render(<CookieChoicePanel request={null} onViewRecord={onViewRecord} />);
      await lookUp();

      await userEvent.click(await within(lookupGroup()).findByRole("button", { name: "View record" }));
      expect(onViewRecord).toHaveBeenCalledWith(REF);
    });
  });

  it("offers no View record for a choice made while signed out (there is no record to open)", async () => {
    render(<CookieChoicePanel request={null} onViewRecord={jest.fn()} />);
    await lookUp();

    await within(lookupGroup()).findByRole("listitem");
    expect(within(lookupGroup()).queryByRole("button", { name: "View record" })).not.toBeInTheDocument();
  });

  it("keeps Look up disabled until the input is a full reference", async () => {
    render(<CookieChoicePanel request={null} />);

    expect(lookUpButton()).toBeDisabled();
    await userEvent.type(input(), REF.slice(0, 12));
    expect(lookUpButton()).toBeDisabled();

    await userEvent.clear(input());
    await userEvent.type(input(), REF);
    expect(lookUpButton()).toBeEnabled();
    expect(lookupCalls()).toHaveLength(0);
  });

  it("does not call a half-typed reference wrong while it is still being typed", async () => {
    render(<CookieChoicePanel request={null} />);
    await userEvent.type(input(), REF.slice(0, 12));

    expect(within(lookupGroup()).queryByText(INVALID_HINT)).not.toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "false");
    expect(input()).not.toHaveAttribute("aria-describedby");
  });

  it("says what a reference looks like once the box is left with something incomplete in it", async () => {
    render(<CookieChoicePanel request={null} />);
    await userEvent.type(input(), REF.slice(0, 12));
    await userEvent.tab();

    expect(within(lookupGroup()).getByText(INVALID_HINT)).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input()).toHaveAttribute("aria-describedby", expect.any(String));
    expect(lookUpButton()).toBeDisabled();

    // Fixing it clears the hint.
    await userEvent.clear(input());
    await userEvent.type(input(), REF);
    expect(within(lookupGroup()).queryByText(INVALID_HINT)).not.toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "false");
  });

  it("says it on Enter too, and sends nothing", async () => {
    render(<CookieChoicePanel request={null} />);
    await userEvent.type(input(), `${REF.slice(0, 12)}{Enter}`);

    expect(within(lookupGroup()).getByText(INVALID_HINT)).toBeInTheDocument();
    expect(lookupCalls()).toHaveLength(0);
  });

  it("says it without leaving the box once the value is as long as a reference but is not one", async () => {
    render(<CookieChoicePanel request={null} />);
    await userEvent.type(input(), "z".repeat(36));

    expect(within(lookupGroup()).getByText(INVALID_HINT)).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(lookUpButton()).toBeDisabled();
  });

  it("says nothing about an empty box that was left", async () => {
    render(<CookieChoicePanel request={null} />);
    await userEvent.click(input());
    await userEvent.tab();

    expect(within(lookupGroup()).queryByText(INVALID_HINT)).not.toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "false");
  });

  it("looks up a typed reference, ignoring spaces around it and the case it was typed in", async () => {
    render(<CookieChoicePanel request={null} />);
    await lookUp(`  ${REF.toUpperCase()}  `);

    await waitFor(() => expect(lookupCalls()).toEqual([`/api/admin/gdpr/consent/receipt?ref=${REF}`]));
  });

  it("also looks up when Enter is pressed in the input", async () => {
    render(<CookieChoicePanel request={null} />);
    await userEvent.type(input(), `${REF}{Enter}`);

    await waitFor(() => expect(lookupCalls()).toHaveLength(1));
  });

  it("shows a Reject all choice as Rejected all, with Display settings Off and Videos Off", async () => {
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const result = await within(lookupGroup()).findByRole("listitem");
    expect(within(result).getByText("Rejected all")).toBeInTheDocument();
    expect(within(result).getByText("Display settings").closest("div")).toHaveTextContent("Off");
    expect(within(result).getByText("Videos").closest("div")).toHaveTextContent("Off");
    expect(within(result).queryByText("On")).not.toBeInTheDocument();
  });

  it("shows when the choice was made, the wording version, the language and that the wording is today's", async () => {
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const result = await within(lookupGroup()).findByRole("listitem");
    expect(within(result).getByText(formatDateTime(rejectedAll.createdAt))).toBeInTheDocument();
    expect(within(result).getByText("Cookie wording v1")).toBeInTheDocument();
    expect(within(result).getByText("English")).toBeInTheDocument();
    expect(within(result).getByText("Same wording as today")).toBeInTheDocument();
    expect(within(result).queryByText("Older wording")).not.toBeInTheDocument();
  });

  it("says Older wording when the text has changed since the choice", async () => {
    lookupResponse = () => ok({ receipts: [{ ...rejectedAll, wordingMatchesCurrent: false, locale: "ar" }], linkedAccount: null });
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const result = await within(lookupGroup()).findByRole("listitem");
    expect(within(result).getByText("Older wording")).toBeInTheDocument();
    expect(within(result).queryByText("Same wording as today")).not.toBeInTheDocument();
    expect(within(result).getByText("Arabic")).toBeInTheDocument();
  });

  it.each([
    ["Accepted all", true, true],
    ["Custom choice", true, false],
    ["Custom choice", false, true],
  ])("reads the choice as %s (display settings %s, videos %s)", async (label, preferences, media) => {
    lookupResponse = () => ok({ receipts: [{ ...rejectedAll, preferences, media }], linkedAccount: null });
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const result = await within(lookupGroup()).findByRole("listitem");
    expect(within(result).getByText(label)).toBeInTheDocument();
  });

  it("shows the name and e-mail of the account a signed-in choice was logged against", async () => {
    lookupResponse = () =>
      ok({ receipts: [rejectedAll], linkedAccount: { userId: "u1", userName: "Sara Ahmed", userEmail: "sara@example.com" } });
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const group = lookupGroup();
    expect(await within(group).findByText("Sara Ahmed")).toBeInTheDocument();
    expect(within(group).getByText("sara@example.com")).toBeInTheDocument();
    expect(within(group).queryByText(/No account is linked/i)).not.toBeInTheDocument();
  });

  it("says no account is linked for a choice made while signed out", async () => {
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    expect(await within(lookupGroup()).findByText(/No account is linked/i)).toBeInTheDocument();
  });

  it("says nothing was found, and that it may be older than 12 months", async () => {
    lookupResponse = () => ok({ receipts: [], linkedAccount: null });
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const group = lookupGroup();
    expect(await within(group).findByText("No cookie choice found for this reference")).toBeInTheDocument();
    expect(within(group).getByText(/more than 12 months old/i)).toBeInTheDocument();
    // The shared EmptyState, not a one-off box.
    expect(group.querySelector("[data-empty-state]")).not.toBeNull();
    expect(within(group).queryByRole("listitem")).not.toBeInTheDocument();
    expect(within(group).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still names the account when the choice's own details have expired", async () => {
    lookupResponse = () =>
      ok({ receipts: [], linkedAccount: { userId: "u1", userName: "Sara Ahmed", userEmail: "sara@example.com" } });
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const group = lookupGroup();
    expect(await within(group).findByText(/no longer stored/i)).toBeInTheDocument();
    expect(within(group).getByText("Sara Ahmed")).toBeInTheDocument();
    expect(within(group).queryByText("No cookie choice found for this reference")).not.toBeInTheDocument();
    // The account's log row did not say where it was made either.
    expect(within(group).getByText("Source").closest("div")).toHaveTextContent("Not recorded");
  });

  it("still says where the choice was made, from the account's log, when the choice's own details have expired", async () => {
    lookupResponse = () =>
      ok({ receipts: [], linkedAccount: { userId: "u1", userName: "Sara Ahmed", userEmail: "sara@example.com", source: "settings", firstChoice: false } });
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const group = lookupGroup();
    await within(group).findByText(/no longer stored/i);
    expect(within(group).getByText("Source").closest("div")).toHaveTextContent("Cookie settings");
  });

  it("shows a skeleton and a pending button while the request runs", async () => {
    let finish: (v: FetchResponse) => void = () => undefined;
    lookupResponse = () => new Promise<FetchResponse>((resolve) => { finish = resolve; });
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const button = within(lookupGroup()).getByRole("button", { name: /Looking up/ });
    expect(button).toBeDisabled();
    expect(within(lookupGroup()).getByTestId("cookie-choice-skeleton")).toBeInTheDocument();
    expect(within(lookupGroup()).queryByRole("listitem")).not.toBeInTheDocument();

    await act(async () => finish({ ok: true, json: async () => ({ receipts: [rejectedAll], linkedAccount: null }) }));
    expect(await within(lookupGroup()).findByRole("listitem")).toBeInTheDocument();
    expect(within(lookupGroup()).queryByTestId("cookie-choice-skeleton")).not.toBeInTheDocument();
  });

  it("says it couldn't look the choice up, and Retry asks again for the same reference", async () => {
    lookupResponse = () => fail();
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    const group = lookupGroup();
    expect(await within(group).findByText("We couldn't look up this choice")).toBeInTheDocument();
    expect(within(group).queryByText(/Failed to/i)).not.toBeInTheDocument();
    expect(lookupCalls()).toHaveLength(1);

    lookupResponse = () => ok({ receipts: [rejectedAll], linkedAccount: null });
    await userEvent.click(within(group).getByRole("button", { name: "Retry" }));

    expect(await within(group).findByRole("listitem")).toBeInTheDocument();
    expect(lookupCalls()).toEqual([`/api/admin/gdpr/consent/receipt?ref=${REF}`, `/api/admin/gdpr/consent/receipt?ref=${REF}`]);
  });

  it("treats a network failure like any other failure", async () => {
    lookupResponse = () => Promise.reject(new Error("offline"));
    render(<CookieChoicePanel request={null} />);
    await lookUp();

    expect(await within(lookupGroup()).findByText("We couldn't look up this choice")).toBeInTheDocument();
  });

  it("fills the input, runs the lookup and scrolls the panel into view when a table reference is clicked", async () => {
    const { rerender } = render(<CookieChoicePanel request={null} />);
    expect(lookupCalls()).toHaveLength(0);

    rerender(<CookieChoicePanel request={{ reference: REF, nonce: 1 }} />);

    expect(input()).toHaveValue(REF);
    expect(await within(lookupGroup()).findByRole("listitem")).toBeInTheDocument();
    expect(lookupCalls()).toEqual([`/api/admin/gdpr/consent/receipt?ref=${REF}`]);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("runs the lookup again when the same reference is clicked a second time", async () => {
    const { rerender } = render(<CookieChoicePanel request={{ reference: REF, nonce: 1 }} />);
    await within(lookupGroup()).findByRole("listitem");

    rerender(<CookieChoicePanel request={{ reference: REF, nonce: 2 }} />);

    await waitFor(() => expect(lookupCalls()).toHaveLength(2));
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("shows the answer for the reference asked last, even if an earlier one answers later", async () => {
    const pending: Record<string, (v: FetchResponse) => void> = {};
    lookupResponse = (ref) => new Promise<FetchResponse>((resolve) => { pending[ref] = resolve; });
    const { rerender } = render(<CookieChoicePanel request={{ reference: REF, nonce: 1 }} />);
    rerender(<CookieChoicePanel request={{ reference: OTHER_REF, nonce: 2 }} />);
    await waitFor(() => expect(lookupCalls()).toHaveLength(2));

    await act(async () => {
      pending[OTHER_REF]({ ok: true, json: async () => ({ receipts: [{ ...rejectedAll, receiptId: OTHER_REF, preferences: true, media: true }], linkedAccount: null }) });
    });
    await act(async () => {
      pending[REF]({ ok: true, json: async () => ({ receipts: [rejectedAll], linkedAccount: null }) });
    });

    const result = await within(lookupGroup()).findByRole("listitem");
    expect(within(result).getByText("Accepted all")).toBeInTheDocument();
    expect(input()).toHaveValue(OTHER_REF);
  });
});
