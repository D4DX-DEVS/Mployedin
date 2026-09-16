/**
 * @jest-environment jsdom
 */
/**
 * Streaming-reply lifecycle of the AI Job Creator.
 *
 * Muse Spark reasons before it answers, so the first visible character can take
 * 5–20 s, and a request can legitimately complete with NO text at all (the
 * reasoning consumed the completion budget). These guard the three things that
 * turned that into "the page is stuck" on 2026-09-16: no thinking state, an
 * empty reply rendered as a blank bubble with no way out, and the blank bubble
 * being persisted (sessionStorage + the drafts thread) and restored forever.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import EmployerAIJobCreatePage from "@/app/[locale]/(dashboard)/employer/jobs/ai-create/page";

const pushMock = jest.fn();
const useVoiceInputMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: (...args: unknown[]) => useVoiceInputMock(...args),
}));

const idleVoiceInput = {
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

const AI_CHAT_STORAGE_KEY = "job-ai-chat-session";
const ERROR_COPY = "Sorry, something went wrong. Please try again.";
const GREETING = "Hello! I can draft this job with a few basics first.";
const PLACEHOLDER = "Describe the role, location, skills, and optional salary or openings...";

function encode(text: string): Uint8Array {
  return new NodeTextEncoder().encode(text);
}

/** A fetch Response whose body streams the given chunks, then ends. */
function streamedResponse(chunks: string[]) {
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length ? { done: false, value: encode(chunks[i++]) } : { done: true, value: undefined },
      }),
    },
  };
}

describe("EmployerAIJobCreatePage streaming reply", () => {
  const fetchMock = jest.fn();
  let chatResponses: Promise<unknown>[] = [];

  beforeAll(() => {
    if (!("TextDecoder" in globalThis)) Object.assign(globalThis, { TextDecoder: NodeTextDecoder });
    if (!("TextEncoder" in globalThis)) Object.assign(globalThis, { TextEncoder: NodeTextEncoder });
  });

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: jest.fn() });
    useVoiceInputMock.mockReset();
    useVoiceInputMock.mockReturnValue({ ...idleVoiceInput });
    window.sessionStorage.clear();
    chatResponses = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/ai/chat") return chatResponses.shift() ?? Promise.reject(new Error("no chat response queued"));
      return Promise.resolve({ ok: true, json: async () => ({ threadId: "thread-1" }) });
    });
    global.fetch = fetchMock as typeof fetch;
  });

  const chatCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/ai/chat");
  const draftCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/ai/chat/drafts");

  async function ask(question: string) {
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: question } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    });
  }

  it("shows a thinking state until the first character of the reply arrives", async () => {
    chatResponses.push(new Promise(() => {})); // never resolves — the model is still reasoning
    render(<EmployerAIJobCreatePage />);
    await ask("remote devops engineer, 5 years");
    expect(await screen.findByRole("status")).toHaveTextContent("Thinking…");
  });

  it("turns an empty reply into an error with a Retry that re-asks the same question", async () => {
    chatResponses.push(Promise.resolve(streamedResponse([])));
    chatResponses.push(Promise.resolve(streamedResponse(["Got it — ", "which country?"])));
    render(<EmployerAIJobCreatePage />);
    await ask("remote devops engineer, 5 years");

    expect(await screen.findByText(ERROR_COPY)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });
    // A failed turn is never written to the thread.
    expect(draftCalls()).toHaveLength(0);

    await act(async () => {
      fireEvent.click(retry);
    });

    expect(await screen.findByText("Got it — which country?")).toBeInTheDocument();
    expect(screen.queryByText(ERROR_COPY)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    const calls = chatCalls();
    expect(calls).toHaveLength(2);
    const first = JSON.parse(calls[0][1].body).messages;
    const second = JSON.parse(calls[1][1].body).messages;
    expect(second).toEqual(first);
    expect(first[first.length - 1]).toEqual({ role: "user", content: "remote devops engineer, 5 years" });
  });

  it("persists the thread once per completed reply, not once per streamed chunk", async () => {
    chatResponses.push(Promise.resolve(streamedResponse(["one ", "two ", "three ", "four"])));
    render(<EmployerAIJobCreatePage />);
    await ask("hi");
    expect(await screen.findByText("one two three four")).toBeInTheDocument();
    await waitFor(() => expect(draftCalls()).toHaveLength(1));
    const persisted = JSON.parse(draftCalls()[0][1].body).messages;
    expect(persisted[persisted.length - 1]).toEqual({ role: "assistant", content: "one two three four" });
  });

  it("carries the AI's screening questions into the form prefill, normalised to the form's shape", async () => {
    // The wizard's step 5 stayed empty after an AI draft because JOB_DATA had no
    // screeningQuestions contract and the prefill dropped them (2026-09-16).
    const draft = {
      title: "DevOps Engineer",
      screeningQuestions: [
        { label: "How many years of DevOps experience do you have?", type: "number", required: true },
        { question: "Are you eligible to work in Qatar?", type: "radio", options: ["Yes", " No ", ""] },
        { label: "Which tools?", type: "wizard", options: ["Terraform", "Ansible"] },
        { label: "Preferred start date", type: "select" }, // choice type with no options → free text
        { label: "   " },
      ],
    };
    chatResponses.push(Promise.resolve(streamedResponse([`Here is the draft.<JOB_DATA>${JSON.stringify(draft)}</JOB_DATA>`])));
    render(<EmployerAIJobCreatePage />);
    await ask("remote devops engineer, 5 years");

    fireEvent.click(await screen.findByRole("button", { name: /Review in Full Form/ }));

    const prefill = JSON.parse(window.sessionStorage.getItem("job-ai-prefill") ?? "{}");
    expect(prefill.title).toBe("DevOps Engineer");
    expect(prefill.screeningQuestions).toHaveLength(4);
    expect(prefill.screeningQuestions.map((q: { label: string; type: string; required: boolean; options?: string[]; order: number }) =>
      [q.label, q.type, q.required, q.options, q.order])).toEqual([
      ["How many years of DevOps experience do you have?", "number", true, undefined, 0],
      ["Are you eligible to work in Qatar?", "radio", false, ["Yes", "No"], 1],
      ["Which tools?", "select", false, ["Terraform", "Ansible"], 2],
      ["Preferred start date", "text", false, undefined, 3],
    ]);
    for (const q of prefill.screeningQuestions) expect(q.id).toMatch(/^sq_ai_\d+_[a-z0-9]+$/);
    expect(pushMock).toHaveBeenCalled();
  });

  it("does not restore a reply that never arrived", async () => {
    window.sessionStorage.setItem(
      AI_CHAT_STORAGE_KEY,
      JSON.stringify({
        messages: [
          { role: "assistant", content: GREETING },
          { role: "user", content: "remote devops engineer" },
          { role: "assistant", content: "" },
          { role: "user", content: "hi" },
          { role: "assistant", content: ERROR_COPY, error: true },
        ],
        extractedJob: null,
        extractedBulkJobs: [],
      }),
    );
    render(<EmployerAIJobCreatePage />);
    await waitFor(() => {
      const saved = JSON.parse(window.sessionStorage.getItem(AI_CHAT_STORAGE_KEY) ?? "{}");
      expect(saved.messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
        ["assistant", GREETING],
        ["user", "remote devops engineer"],
        ["user", "hi"],
      ]);
    });
    expect(screen.queryByText(ERROR_COPY)).toBeNull();
  });
});
