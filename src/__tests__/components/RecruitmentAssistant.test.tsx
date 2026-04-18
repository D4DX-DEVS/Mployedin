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

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: (...args: unknown[]) => useVoiceInputMock(...args),
}));

jest.mock("@/components/features/employer/RecruitmentAssistant/tabs/WelcomeScreens", () => ({
  JobCreatorWelcome: ({ onStartBlank }: { onStartBlank: () => void }) => (
    <div>
      <div>Job creator welcome</div>
      <button type="button" onClick={onStartBlank}>Open blank chat</button>
    </div>
  ),
  InterviewWelcome: ({ onStartBlank }: { onStartBlank: () => void }) => (
    <div>
      <div>Interview welcome</div>
      <button type="button" onClick={onStartBlank}>Open blank chat</button>
    </div>
  ),
  ScreeningWelcome: ({ onStartBlank }: { onStartBlank: () => void }) => (
    <div>
      <div>Screening welcome</div>
      <button type="button" onClick={onStartBlank}>Open blank chat</button>
    </div>
  ),
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

async function openBlankChat() {
  await openAssistant();
  fireEvent.click(screen.getByRole("button", { name: "Open blank chat" }));
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
    expect(options.maxDurationMs).toBe(60000);
  });

  it("shows a guided welcome state before rendering the composer", async () => {
    render(<RecruitmentAssistant />);

    await openAssistant();

    expect(screen.getByText("Job creator welcome")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("reveals the composer after starting a blank chat", async () => {
    render(<RecruitmentAssistant />);

    await openAssistant();
    fireEvent.click(screen.getByRole("button", { name: "Open blank chat" }));

    expect(screen.getByRole("textbox")).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("keeps the idle auto, mic, and send controls visible in the composer", async () => {
    render(<RecruitmentAssistant />);

    await openBlankChat();

    expect(screen.getByText("AUTO")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start voice input" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send message" })).toBeVisible();
  });

  it("expands the textarea height for longer chat input", async () => {
    render(<RecruitmentAssistant />);

    await openBlankChat();

    const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
    Object.defineProperty(textbox, "scrollHeight", {
      configurable: true,
      value: 280,
    });

    fireEvent.change(textbox, {
      target: { value: "Need a senior MERN developer with React, Node.js, MongoDB, hiring in Kochi, hybrid, salary flexible, two openings, immediate joiners preferred." },
    });

    expect(textbox.style.height).toBe("220px");
  });

  it("returns to the guided welcome state after starting a new conversation", async () => {
    render(<RecruitmentAssistant />);

    await openAssistant();
    fireEvent.click(screen.getByRole("button", { name: "Open blank chat" }));
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));

    expect(screen.getByText("Job creator welcome")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
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
    await openBlankChat();

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
    await openBlankChat();

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
    await openBlankChat();

    expect(screen.getByRole("alert")).toHaveTextContent("Didn't catch that. Try again.");
    expect(screen.queryByText("Detected language: English")).not.toBeInTheDocument();
  });
});