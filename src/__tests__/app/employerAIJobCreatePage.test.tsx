/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import EmployerAIJobCreatePage from "@/app/[locale]/(dashboard)/employer/jobs/ai-create/page";

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
  isRecording: false,
  isProcessing: false,
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  clearTranscript: jest.fn(),
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

  it("shows a visible recording status when voice capture is active", () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "recording",
      isRecording: true,
    });

    render(<EmployerAIJobCreatePage />);

    expect(screen.getByRole("status")).toHaveTextContent("Recording... Speak now. Tap the mic to stop.");
    expect(screen.getByRole("button", { name: "Stop voice input" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("shows processing feedback while audio is being transcribed", () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "processing",
      isProcessing: true,
    });

    render(<EmployerAIJobCreatePage />);

    expect(screen.getByRole("status")).toHaveTextContent("Processing your audio...");
    expect(screen.getByRole("button", { name: "Processing voice input" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("announces voice errors when recording is unavailable", () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "error",
      error: "Microphone access denied.",
    });

    render(<EmployerAIJobCreatePage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access denied.");
  });
});