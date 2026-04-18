/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConversationalAI } from "@/components/shared/ConversationalAI";

const pushMock = jest.fn();
const useVoiceInputMock = jest.fn();
const fetchMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/en/job-seeker/dashboard",
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
  const openButton = await screen.findByRole("button", { name: "Open AI Assistant" });
  fireEvent.click(openButton);
}

describe("ConversationalAI", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });

    pushMock.mockReset();
    useVoiceInputMock.mockReset();
    fetchMock.mockReset();
    useVoiceInputMock.mockReturnValue({ ...baseVoiceInputState });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/job-seeker/profile")) {
        return new Promise(() => {});
      }

      if (url.includes("/api/ai/chat-history")) {
        return new Promise(() => {});
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    global.fetch = fetchMock as typeof fetch;
  });

  it("configures voice input for explicit send mode", () => {
    render(<ConversationalAI context="general_assist" />);

    const options = useVoiceInputMock.mock.calls[0][0] as Record<string, unknown>;

    expect(options.language).toBe("auto");
    expect(options.mode).toBe("explicitSend");
    expect(options.maxDurationMs).toBe(60000);
  });

  it("keeps the idle auto, mic, and send controls visible in the composer", async () => {
    render(<ConversationalAI context="general_assist" />);

    await openAssistant();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeVisible());

    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Ask me anything…");
    expect(screen.getByRole("button", { name: "Voice language: AUTO" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start voice input" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send message" })).toBeVisible();
  });

  it("expands the textarea height for longer chat input", async () => {
    render(<ConversationalAI context="general_assist" />);

    await openAssistant();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeVisible());

    const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
    Object.defineProperty(textbox, "scrollHeight", {
      configurable: true,
      value: 180,
    });

    fireEvent.change(textbox, { target: { value: "Need help with a longer job search prompt that should expand the composer area." } });

    expect(textbox.style.height).toBe("180px");
  });

  it("shows cancel, live recording state, and send controls while recording", async () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "recording",
      isRecording: true,
      durationMs: 5000,
      durationLabel: "00:05",
    });

    render(<ConversationalAI context="general_assist" />);

    await openAssistant();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());

    expect(screen.getByRole("status")).toHaveTextContent("Listening...");
    expect(screen.getByRole("status")).toHaveTextContent("Tap send when ready.");
    expect(screen.getByRole("status")).toHaveTextContent("00:05");
    expect(screen.getByRole("button", { name: "Cancel voice input" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send voice input" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start voice input" })).not.toBeInTheDocument();
  });

  it("calls cancelRecording when the cancel button is clicked", async () => {
    const cancelRecordingMock = jest.fn();
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "recording",
      isRecording: true,
      cancelRecording: cancelRecordingMock,
    });

    render(<ConversationalAI context="general_assist" />);

    await openAssistant();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Cancel voice input" }));

    expect(cancelRecordingMock).toHaveBeenCalledTimes(1);
  });

  it("calls submitRecording when the send voice button is clicked", async () => {
    const submitRecordingMock = jest.fn();
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "recording",
      isRecording: true,
      submitRecording: submitRecordingMock,
    });

    render(<ConversationalAI context="general_assist" />);

    await openAssistant();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Send voice input" }));

    expect(submitRecordingMock).toHaveBeenCalledTimes(1);
  });

  it("shows a voice error alert when recording fails", async () => {
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      error: "Microphone access denied.",
    });

    render(<ConversationalAI context="general_assist" />);

    await openAssistant();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeVisible());

    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access denied.");
  });

  it("cancels recording when Escape is pressed", async () => {
    const cancelRecordingMock = jest.fn();
    useVoiceInputMock.mockReturnValue({
      ...baseVoiceInputState,
      state: "recording",
      isRecording: true,
      cancelRecording: cancelRecordingMock,
    });

    render(<ConversationalAI context="general_assist" />);

    await openAssistant();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());

    fireEvent.keyDown(window, { key: "Escape" });

    expect(cancelRecordingMock).toHaveBeenCalledTimes(1);
  });
});