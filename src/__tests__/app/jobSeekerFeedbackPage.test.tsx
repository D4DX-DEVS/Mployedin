/**
 * @jest-environment jsdom
 *
 * A deleted or foreign application answered 404, the page stored the error body
 * as the application and told the seeker to wait for a final decision; neither
 * full-page state had an h1 (audit 2026-09-24 re-audit).
 */
import React from "react";
import { render, screen } from "@testing-library/react";

const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t }));
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "app1", locale: "en" }),
  useRouter: () => ({ push: jest.fn() }),
}));

import ApplicationFeedbackPage from "@/app/[locale]/(dashboard)/job-seeker/applications/[id]/feedback/page";

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;
}

it("says the application could not be loaded when it does not exist", async () => {
  mockFetch(404, { error: "Not found" });
  render(<ApplicationFeedbackPage />);

  expect(await screen.findByRole("heading", { level: 1, name: "feedbackNotAvailable" })).toBeInTheDocument();
  expect(screen.getByText("errorLoadingDetails")).toBeInTheDocument();
  expect(screen.queryByText("feedbackOnlyAfterDecision")).not.toBeInTheDocument();
});

it("explains the final-decision rule for an application still in progress", async () => {
  mockFetch(200, { application: { _id: "app1", status: "shortlisted" } });
  render(<ApplicationFeedbackPage />);

  expect(await screen.findByRole("heading", { level: 1, name: "feedbackNotAvailable" })).toBeInTheDocument();
  expect(screen.getByText("feedbackOnlyAfterDecision")).toBeInTheDocument();
});
