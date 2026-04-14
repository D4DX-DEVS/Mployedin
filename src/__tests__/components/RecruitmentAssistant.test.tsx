/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecruitmentAssistant } from "@/components/features/employer/RecruitmentAssistant";

const pushMock = jest.fn();
const useVoiceInputMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ locale: "en" }),
}));

jest.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: (...args: unknown[]) => useVoiceInputMock(...args),
}));

jest.mock("@/components/features/employer/RecruitmentAssistant/tabs/WelcomeScreens", () => ({
  JobCreatorWelcome: () => <div>Job creator welcome</div>,
  InterviewWelcome: () => <div>Interview welcome</div>,
  ScreeningWelcome: () => <div>Screening welcome</div>,
}));

const baseVoiceInputState = {
  state: "idle" as const,
  transcript: "",
  detectedLanguage: null,
  isRecording: false,
  isProcessing: false,
  durationMs: 0,
  durationLabel: "00:00",
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  cancelRecording: jest.fn(),
  submitRecording: jest.fn(),
  clearTranscript: jest.fn(),
  clearError: jest.fn(),
  error: null,
};

async function openAssistant() {
  const openButton = await screen.findByRole("button", { name: "Open Recruitment AI" });
  fireEvent.click(openButton);
}

describe("RecruitmentAssistant", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });

    pushMock.mockReset();
    useVoiceInputMock.mockReset();
    useVoiceInputMock.mockReturnValue({ ...baseVoiceInputState });
  });

  it("configures voice input for explicit send mode", async () => {
    render(<RecruitmentAssistant />);

    await screen.findByRole("button", { name: "Open Recruitment AI" });

    const options = useVoiceInputMock.mock.calls[0][0] as Record<string, unknown>;

    expect(options.language).toBe("auto");
    expect(options.mode).toBe("explicitSend");
    expect(options.maxDurationMs).toBe(15000);
  });

  it("shows cancel, live recording state, and send controls while recording", async () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "recording",
      isRecording: true,
      durationMs: 4000,
      durationLabel: "00:04",
    });

    render(<RecruitmentAssistant />);
    await openAssistant();

    expect(screen.getByRole("status")).toHaveTextContent("Listening...");
    expect(screen.getByRole("status")).toHaveTextContent("Tap send when ready.");
    expect(screen.getByRole("status")).toHaveTextContent("00:04");
    expect(screen.getByRole("button", { name: "Cancel voice input" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send voice input" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start voice input" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("shows processing feedback and disables the composer while transcribing", async () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "processing",
      isProcessing: true,
    });

    render(<RecruitmentAssistant />);
    await openAssistant();

    expect(screen.getByRole("status")).toHaveTextContent("Processing voice...");
    expect(screen.queryByRole("button", { name: "Start voice input" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("shows inline-only voice feedback when transcription fails or language is detected", async () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      error: "Didn't catch that. Try again.",
      detectedLanguage: "en-US",
    });

    render(<RecruitmentAssistant />);
    await openAssistant();

    expect(screen.getByRole("alert")).toHaveTextContent("Didn't catch that. Try again.");
    expect(screen.queryByText("Detected language: English")).not.toBeInTheDocument();
  });
});