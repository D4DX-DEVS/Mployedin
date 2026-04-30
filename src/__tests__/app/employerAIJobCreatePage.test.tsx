/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import EmployerAIJobCreatePage from "@/app/[locale]/(dashboard)/employer/jobs/ai-create/page";
import { toast } from "sonner";

const pushMock = jest.fn();
const useVoiceInputMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ locale: "en" }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, description }: { title: string; description: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: (...args: unknown[]) => useVoiceInputMock(...args),
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

describe("EmployerAIJobCreatePage", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });

    pushMock.mockReset();
    useVoiceInputMock.mockReset();
    useVoiceInputMock.mockReturnValue({ ...baseVoiceInputState });
  });

  it("configures voice input for explicit send without toast-backed errors", () => {
    render(<EmployerAIJobCreatePage />);

    const options = useVoiceInputMock.mock.calls[0][0] as Record<string, unknown>;

    expect(options.language).toBe("auto");
    expect(options.mode).toBe("explicitSend");
    expect(options.maxDurationMs).toBe(60000);
    expect(options.onError).toBeUndefined();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a visible recording status when voice capture is active", () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "recording",
      isRecording: true,
      durationLabel: "00:04",
    });

    render(<EmployerAIJobCreatePage />);

    expect(screen.getByRole("status")).toHaveTextContent("Listening...");
    expect(screen.getByRole("status")).toHaveTextContent("Tap send when you're ready.");
    expect(screen.getByRole("status")).toHaveTextContent("00:04");
    expect(screen.getByRole("button", { name: "Cancel voice input" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send voice input" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start voice input" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("shows processing feedback while audio is being transcribed", () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "processing",
      isProcessing: true,
    });

    render(<EmployerAIJobCreatePage />);

    expect(screen.getByRole("status")).toHaveTextContent("Processing voice...");
    expect(screen.queryByRole("button", { name: "Start voice input" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("announces voice errors when recording is unavailable", () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      error: "Microphone access denied.",
    });

    render(<EmployerAIJobCreatePage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access denied.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the detected language hint after a successful transcription", () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      detectedLanguage: "en-US",
    });

    render(<EmployerAIJobCreatePage />);

    expect(screen.getByText("Detected language: English")).toBeVisible();
  });
});