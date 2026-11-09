/**
 * @jest-environment jsdom
 *
 * A job opened from the AI job creator carries the uploaded poster's own text.
 * The form keeps it out of the job's fields and hands it to the AI assistant,
 * so "you missed the qualification from the poster" can be checked against the
 * poster instead of guessed (2026-11-09).
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

const csrfFetch = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
jest.mock("@/components/features/employer/job-form/useJobFormDraft", () => ({
  useJobFormDraft: () => ({
    draftId: undefined,
    savedIndicator: false,
    saveDraft: jest.fn().mockResolvedValue(undefined),
    loadDraft: jest.fn().mockReturnValue(null),
    autosaveLocal: jest.fn(),
    clearDraft: jest.fn(),
  }),
  useDebounce: <T,>(value: T) => value,
}));
jest.mock("@/components/features/employer/job-form/StepIndicator", () => ({ StepIndicator: () => <div /> }));
jest.mock("@/components/features/employer/job-form/Step1BasicInfo", () => ({ Step1BasicInfo: () => <div /> }));
jest.mock("@/components/features/employer/job-form/Step2JobDetails", () => ({ Step2JobDetails: () => <div /> }));
jest.mock("@/components/features/employer/job-form/Step3Requirements", () => ({ Step3Requirements: () => <div /> }));
jest.mock("@/components/features/employer/job-form/Step4SalarySettings", () => ({ Step4SalarySettings: () => <div /> }));
jest.mock("@/components/features/employer/job-form/AdvancedSettingsSection", () => ({ AdvancedSettingsSection: () => <div /> }));
jest.mock("@/components/features/employer/job-form/JobQualityScore", () => ({ JobQualityScore: () => <div /> }));
jest.mock("@/components/features/employer/job-form/MatchPreviewPanel", () => ({ MatchPreviewPanel: () => <div /> }));
jest.mock("@/components/features/employer/job-form/StickyActionBar", () => ({ StickyActionBar: () => null }));

const POSTER_TEXT = "OPERATIONS HEAD\nQualification: Any degree, 5 years in operations";

beforeEach(() => {
  window.sessionStorage.clear();
  csrfFetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ reply: "Added.", changes: {} }) });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  });
  Object.defineProperty(window, "scrollTo", { configurable: true, value: jest.fn() });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: jest.fn() });
});

async function askAssistant(text: string) {
  const [box] = await screen.findAllByPlaceholderText("For example: add the benefits, health cover and an annual flight");
  fireEvent.change(box, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(box, { key: "Enter" });
  });
  await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
  return JSON.parse((csrfFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
}

it("gives the assistant the poster's text, never the job's fields", async () => {
  window.sessionStorage.setItem(
    "job-ai-prefill",
    JSON.stringify({ title: "Operations Head", description: "Lead business operations.", posterText: POSTER_TEXT }),
  );
  render(<JobFormWizard locale="en" useAiPrefill />);

  const body = await askAssistant("You missed the qualification from the poster");
  expect(body.source).toBe(POSTER_TEXT);
  expect(body.job.title).toBe("Operations Head");
  expect(body.job).not.toHaveProperty("posterText");
});

it("sends no poster text for a job typed by hand", async () => {
  render(<JobFormWizard locale="en" />);
  const body = await askAssistant("Write the description");
  expect(body).not.toHaveProperty("source");
});

it("shows that the assistant uses the poster, lets the employer read it, and offers the check", async () => {
  window.sessionStorage.setItem(
    "job-ai-prefill",
    JSON.stringify({ title: "Operations Head", description: "Lead business operations.", posterText: POSTER_TEXT }),
  );
  render(<JobFormWizard locale="en" useAiPrefill />);

  expect((await screen.findAllByText("Using your poster")).length).toBeGreaterThan(0);
  const [check] = screen.getAllByRole("button", { name: "Check against the poster" });
  fireEvent.click(screen.getAllByRole("button", { name: "View text" })[0]);
  const dialog = await screen.findByRole("dialog", { name: "Text read from your poster" });
  expect(dialog).toHaveTextContent("Qualification: Any degree, 5 years in operations");

  fireEvent.keyDown(dialog, { key: "Escape" });
  await act(async () => {
    fireEvent.click(check);
  });
  await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
  const body = JSON.parse((csrfFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
  expect(body.instruction).toMatch(/^Compare this job with my poster/);
  expect(body.source).toBe(POSTER_TEXT);
});

it("shows no poster line for a job typed by hand", async () => {
  render(<JobFormWizard locale="en" />);
  await screen.findAllByPlaceholderText("For example: add the benefits, health cover and an annual flight");
  expect(screen.queryByText("Using your poster")).toBeNull();
  expect(screen.queryByRole("button", { name: "Check against the poster" })).toBeNull();
});
