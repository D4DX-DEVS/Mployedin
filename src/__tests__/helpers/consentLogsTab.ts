/**
 * Shared fixtures for the Admin > GDPR > Consent Logs tab tests
 * (adminGdprConsentTab.test.tsx and adminGdprConsentRecord.test.tsx): the rows
 * each admin API answers with, a fetch routed by path, and the queries both
 * files use. Each test file keeps its own jest.mock calls (they are hoisted).
 */
import { screen, within } from "@testing-library/react";

export const REF = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
export const OTHER_REF = "0f8fad5b-d9cb-469f-a165-70867728950e";
export const THIRD_REF = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

export const choiceRow = (over: Record<string, unknown>) => ({
  userId: "64d000000000000000000003",
  userName: "Sara Ahmed",
  userEmail: "sara@example.com",
  receiptId: REF,
  recordedAt: "2026-10-18T09:30:00.000Z",
  source: "banner",
  policyVersion: "cookie-v1",
  preferences: false,
  media: false,
  outcome: "rejected",
  ...over,
});

export const ROWS = [
  choiceRow({}),
  choiceRow({ userName: "Omar Khan", userEmail: "omar@example.com", receiptId: OTHER_REF, preferences: true, media: true, outcome: "accepted", source: "settings" }),
  choiceRow({ userName: "Lina Haddad", userEmail: null, receiptId: THIRD_REF, preferences: true, media: null, outcome: "custom" }),
  // Written before choice references existed.
  choiceRow({ userName: "Hana Youssef", userEmail: "hana@example.com", receiptId: null, preferences: true, media: false, outcome: "custom" }),
];

export const RECORDS: Record<string, unknown> = {
  [REF]: {
    record: ROWS[0],
    status: "replaced",
    otherChoices: [
      { recordedAt: "2026-10-19T08:00:00.000Z", relation: "later", outcome: "accepted", preferences: true, media: true, source: "settings" },
      { recordedAt: "2026-09-01T10:00:00.000Z", relation: "earlier", outcome: "custom", preferences: true, media: null, source: "settings" },
    ],
    wording: "same",
  },
  [THIRD_REF]: { record: ROWS[2], status: "current", otherChoices: [], wording: "unknown" },
};

export const OTHER_ROWS = [
  {
    _id: "64d0000000000000000000b2",
    userId: "64d000000000000000000004",
    userName: "Omar Khan",
    userEmail: "omar@example.com",
    consentType: "terms_and_privacy",
    granted: true,
    timestamp: "2026-09-30T09:30:00Z",
    source: "registration",
    policyVersion: "2026-09-29",
    receiptId: null,
    // An old server would still send it; the table must not show it.
    ipAddress: "10.0.0.1",
  },
];

export type Json = Record<string, unknown>;
export const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });
export const fail = (status = 500) => Promise.resolve({ ok: false, status, json: async () => ({}) });

/** What each API answers; tests overwrite a field before rendering. Reset by installConsentFetch(). */
export const api: {
  summary: Json;
  choices: (url: URL) => Promise<unknown>;
  other: (url: URL) => Promise<unknown>;
  terms: () => Promise<unknown>;
  termsBody: Json;
} = {
  summary: {},
  choices: () => ok({}),
  other: () => ok({}),
  terms: () => ok({}),
  termsBody: {},
};

export const fetchMock = jest.fn();

/** Routes every admin request the tab makes; anything else is a test bug. */
export function installConsentFetch(): void {
  api.summary = { days: 30, total: 20, acceptedAll: 10, rejectedAll: 6, custom: 4 };
  api.termsBody = { version: "2026-09-29", isBaseline: true, acceptedUsers: 3, totalUsers: 40, pendingUsers: 37 };
  api.terms = () => ok(api.termsBody);
  api.choices = () => ok({ data: ROWS, page: 1, pageSize: 10, total: ROWS.length, totalPages: 1 });
  api.other = () => ok({ items: OTHER_ROWS, total: OTHER_ROWS.length });
  fetchMock.mockImplementation((input: string, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/admin/gdpr/consent/summary") return ok({ ...api.summary, days: Number(url.searchParams.get("days") ?? 30) });
    if (url.pathname === "/api/admin/gdpr/consent/choices") return api.choices(url);
    if (url.pathname.startsWith("/api/admin/gdpr/consent/choices/")) {
      const ref = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      return RECORDS[ref] ? ok(RECORDS[ref]) : fail(404);
    }
    if (url.pathname === "/api/admin/gdpr/consent/receipt") {
      return ok({
        receipts: [{ receiptId: REF, preferences: false, media: false, version: 1, locale: "en", createdAt: "2026-10-18T09:30:00.000Z", wordingMatchesCurrent: true, source: null }],
        linkedAccount: { userId: "64d000000000000000000003", userName: "Sara Ahmed", userEmail: "sara@example.com", source: "banner", firstChoice: true },
      });
    }
    if (url.pathname === "/api/admin/gdpr/consent") return api.other(url);
    if (url.pathname === "/api/admin/gdpr/terms") {
      if (init?.method === "POST") return ok({ ...api.termsBody, version: "2026-10-21T10:00:00.000Z", isBaseline: false, acceptedUsers: 0, pendingUsers: 40 });
      return api.terms();
    }
    return Promise.reject(new Error(`unexpected fetch ${input}`));
  });
  global.fetch = fetchMock as unknown as typeof fetch;
}

/** Every request to one API path, as URLs, oldest first. */
export const calls = (path: string) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url), "http://localhost"))
    .filter((u) => u.pathname === path);

export const urlParam = (key: string) => new URLSearchParams(window.location.search).get(key);

export const cards = () => screen.getByRole("region", { name: "Cookie choice counts" });
export const card = (label: string) => within(cards()).getByText(label).closest("li") as HTMLElement;
export const choicesTable = async () => {
  await screen.findByText("Lina Haddad");
  return screen.getAllByRole("table")[0];
};
export const rowOf = (table: HTMLElement, name: string) => within(table).getByText(name).closest("tr") as HTMLElement;
