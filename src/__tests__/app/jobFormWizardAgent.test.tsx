/**
 * @jest-environment jsdom
 *
 * Agents post with the employer's five-step wizard. The agent build adds an
 * employer picker limited to the agent's assigned employers (the page used to
 * read the API's default page of 10 and offer area-only employers that POST
 * then refused), honours ?employer= from an employer card, and offers the
 * picked employer's job templates once there is one.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

const fetchMock = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
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
jest.mock("@/components/features/employer/job-form/Step1BasicInfo", () => ({ Step1BasicInfo: () => <div data-testid="step-1" /> }));
jest.mock("@/components/features/employer/job-form/Step2JobDetails", () => ({ Step2JobDetails: () => <div /> }));
jest.mock("@/components/features/employer/job-form/Step3Requirements", () => ({ Step3Requirements: () => <div /> }));
jest.mock("@/components/features/employer/job-form/Step4SalarySettings", () => ({ Step4SalarySettings: () => <div /> }));
jest.mock("@/components/features/employer/job-form/AdvancedSettingsSection", () => ({ AdvancedSettingsSection: () => <div /> }));
jest.mock("@/components/features/employer/job-form/JobQualityScore", () => ({ JobQualityScore: () => <div /> }));
jest.mock("@/components/features/employer/job-form/MatchPreviewPanel", () => ({ MatchPreviewPanel: () => <div /> }));
jest.mock("@/components/features/employer/job-form/StickyActionBar", () => ({ StickyActionBar: () => null }));

function employersResponse(employers: unknown[]) {
  return { ok: true, json: async () => ({ employers }) };
}

beforeEach(() => {
  fetchMock.mockReset();
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });
  Object.defineProperty(window, "scrollTo", { configurable: true, value: jest.fn() });
});

it("loads the agent's employers in one request and preselects the one from the employer card", async () => {
  fetchMock.mockResolvedValue(
    employersResponse([
      { _id: "64a000000000000000000003", companyName: "Gulf Care Clinic", assignedToMe: true },
      { _id: "64a000000000000000000004", companyName: "Area Only LLC", assignedToMe: false },
    ]),
  );

  render(<JobFormWizard locale="en" basePath="agent" initialEmployerId="64a000000000000000000003" />);

  expect(fetchMock).toHaveBeenCalledWith("/api/employers?limit=500");
  expect(await screen.findByText("Gulf Care Clinic")).toBeInTheDocument();
  expect(screen.queryByText("Area Only LLC")).not.toBeInTheDocument();
  expect(screen.getByTestId("step-1")).toBeInTheDocument();
});

it("offers the picked employer's templates, and none before an employer is picked", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    url.startsWith("/api/employers/job-templates")
      ? { ok: true, json: async () => ({ templates: [] }) }
      : employersResponse([{ _id: "64a000000000000000000003", companyName: "Gulf Care Clinic", assignedToMe: true }]),
  );

  const { unmount } = render(<JobFormWizard locale="en" basePath="agent" />);
  await screen.findByText(/^Employer/);
  expect(screen.queryByRole("button", { name: /load template/i })).not.toBeInTheDocument();
  unmount();

  render(<JobFormWizard locale="en" basePath="agent" initialEmployerId="64a000000000000000000003" />);
  fireEvent.click(await screen.findByRole("button", { name: /load template/i }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/employers/job-templates?employerId=64a000000000000000000003"),
  );
});

it("keeps the employer picked on the start screen when the AI draft fills the form", async () => {
  fetchMock.mockResolvedValue(
    employersResponse([{ _id: "64a000000000000000000003", companyName: "Gulf Care Clinic", assignedToMe: true }]),
  );
  // The AI creator's handoff names no employer of its own.
  window.sessionStorage.setItem("job-ai-prefill", JSON.stringify({ title: "Staff Nurse", description: "Ward nurse for a busy clinic." }));

  render(<JobFormWizard locale="en" basePath="agent" initialEmployerId="64a000000000000000000003" useAiPrefill />);

  expect(await screen.findByText("Gulf Care Clinic")).toBeInTheDocument();
  expect(window.sessionStorage.getItem("job-ai-prefill")).toBeNull();
});

it("tells an agent with no assigned employers why the picker is empty", async () => {
  fetchMock.mockResolvedValue(employersResponse([{ _id: "64a000000000000000000004", companyName: "Area Only LLC", assignedToMe: false }]));

  render(<JobFormWizard locale="en" basePath="agent" />);

  await waitFor(() => {
    expect(screen.getByText(/No employers are assigned to you yet/i)).toBeInTheDocument();
  });
});

it("leaves the employer build without a picker and with templates", () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) });
  render(<JobFormWizard locale="en" />);
  expect(screen.queryByText(/^Employer/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /load template/i })).toBeInTheDocument();
});
