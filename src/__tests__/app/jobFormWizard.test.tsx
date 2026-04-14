/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

const pushMock = jest.fn();
const fetchMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </header>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/components/features/employer/job-form/useJobFormDraft", () => ({
  useJobFormDraft: () => ({
    draftId: undefined,
    savedIndicator: "Saved",
    saveDraft: jest.fn().mockResolvedValue(undefined),
    loadDraft: jest.fn().mockReturnValue(null),
  }),
  useDebounce: <T,>(value: T) => value,
}));

jest.mock("@/components/features/employer/job-form/StepIndicator", () => ({
  StepIndicator: () => <div data-testid="step-indicator" />,
}));

jest.mock("@/components/features/employer/job-form/Step1BasicInfo", () => ({
  Step1BasicInfo: () => <div data-testid="step-1" />,
}));

jest.mock("@/components/features/employer/job-form/Step2JobDetails", () => ({
  Step2JobDetails: () => <div data-testid="step-2" />,
}));

jest.mock("@/components/features/employer/job-form/Step3Requirements", () => ({
  Step3Requirements: () => <div data-testid="step-3" />,
}));

jest.mock("@/components/features/employer/job-form/Step4SalarySettings", () => ({
  Step4SalarySettings: () => <div data-testid="step-4" />,
}));

jest.mock("@/components/features/employer/job-form/AdvancedSettingsSection", () => ({
  AdvancedSettingsSection: () => <div data-testid="advanced-settings" />,
}));

jest.mock("@/components/features/employer/job-form/JobQualityScore", () => ({
  JobQualityScore: () => <div data-testid="job-quality-score" />,
}));

jest.mock("@/components/features/employer/job-form/MatchPreviewPanel", () => ({
  MatchPreviewPanel: () => <div data-testid="match-preview-panel" />,
}));

jest.mock("@/components/features/employer/job-form/StickyActionBar", () => ({
  StickyActionBar: () => null,
}));

describe("JobFormWizard template modal", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: jest.fn(),
    });

    pushMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ templates: [] }),
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });
  });

  it("opens the template modal, loads templates, and restores focus when closed", async () => {
    const user = userEvent.setup();

    render(<JobFormWizard locale="en" />);

    const trigger = screen.getByRole("button", { name: /load template/i });
    await user.click(trigger);

    expect(fetchMock).toHaveBeenCalledWith("/api/employers/job-templates");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName("Select a Template");
    expect(dialog).toHaveAccessibleDescription("Start from a previous hiring format, then adjust only what changed.");
    expect(await screen.findByText("No templates saved yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close template modal/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("closes the template modal when escape is pressed", async () => {
    const user = userEvent.setup();

    render(<JobFormWizard locale="en" />);

    await user.click(screen.getByRole("button", { name: /load template/i }));
    expect(await screen.findByText("Select a Template")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});