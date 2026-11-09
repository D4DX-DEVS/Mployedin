/**
 * @jest-environment jsdom
 */
/**
 * AI Job Creator after a poster upload (client, 2026-11-09): "add the
 * qualification" in the chat got "what job?", and the full form's assistant
 * invented a qualification, because neither ever saw the draft or the poster.
 * The preview also hid qualifications, so the gap only showed in the form.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import EmployerAIJobCreatePage from "@/app/[locale]/(dashboard)/employer/jobs/ai-create/page";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/employer/jobs/ai-create",
  useSearchParams: () => new URLSearchParams(""),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
jest.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: () => ({
    state: "idle", transcript: "", detectedLanguage: null, isRecording: false, isProcessing: false,
    durationMs: 0, durationLabel: "00:00", startRecording: jest.fn(), stopRecording: jest.fn(),
    cancelRecording: jest.fn(), submitRecording: jest.fn(), clearTranscript: jest.fn(), clearError: jest.fn(), error: null,
  }),
}));

const PLACEHOLDER = "Describe the role, location, skills, and optional salary or openings...";
const POSTER_TEXT = "OPERATIONS HEAD\nEranakulam\nQualification: Any degree, 5 years in operations";

const EXTRACTED = {
  title: "Operations Head",
  category: "Other",
  description: "Lead business operations for a growing events company in Kochi.",
  location: { city: "Eranakulam", country: "India", isRemote: false },
  employmentType: "full_time",
  workMode: "onsite",
  requirements: { skills: ["Leadership", "IT Tools"], education: "Any degree" },
  responsibilities: ["Lead business operations", "Travel as required"],
  qualifications: [],
};

function streamed(text: string) {
  const bytes = new NodeTextEncoder().encode(text);
  let sent = false;
  return {
    ok: true,
    body: { getReader: () => ({ read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes })) }) },
  };
}

describe("AI Job Creator with an uploaded poster", () => {
  const fetchMock = jest.fn();
  let chatReply = "";

  beforeAll(() => {
    if (!("TextDecoder" in globalThis)) Object.assign(globalThis, { TextDecoder: NodeTextDecoder });
    if (!("TextEncoder" in globalThis)) Object.assign(globalThis, { TextEncoder: NodeTextEncoder });
  });

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: jest.fn() });
    window.sessionStorage.clear();
    pushMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/ai/job-extract") {
        return Promise.resolve({ ok: true, json: async () => ({ jobs: [EXTRACTED], posterText: POSTER_TEXT }) });
      }
      if (url === "/api/ai/chat") return Promise.resolve(streamed(chatReply));
      return Promise.resolve({ ok: true, json: async () => ({ threadId: "thread-1" }) });
    });
    global.fetch = fetchMock as typeof fetch;
  });

  async function uploadPoster(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "poster.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await screen.findByText(/I read your poster/);
  }

  it("shows every field of the draft, saying which ones the poster did not have", async () => {
    const { container } = render(<EmployerAIJobCreatePage />);
    await uploadPoster(container);
    expect(screen.getByText("Qualifications:")).toBeInTheDocument();
    expect(screen.getByText("Education:")).toBeInTheDocument();
    expect(screen.getByText("Any degree")).toBeInTheDocument();
    // Qualifications, openings, nice-to-have skills, benefits and screening questions are empty.
    expect(screen.getAllByText("Not on the poster").length).toBeGreaterThanOrEqual(4);
  });

  it("sends the draft on screen and the poster's text with the next chat message, and applies the answer to that draft", async () => {
    const { container } = render(<EmployerAIJobCreatePage />);
    await uploadPoster(container);

    chatReply = 'Added the qualification.\n<JOB_DATA>{"title":"Operations Head","qualifications":["Any degree with 5 years in operations"]}</JOB_DATA>';
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "add the qualification" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    });

    const chatCall = fetchMock.mock.calls.find(([url]) => url === "/api/ai/chat");
    const body = JSON.parse((chatCall![1] as RequestInit).body as string);
    expect(body.jobDraft).toMatchObject({ title: "Operations Head", responsibilities: ["Lead business operations", "Travel as required"] });
    expect(body.posterText).toBe(POSTER_TEXT);

    // The answer only named two fields; everything else on the draft stays.
    await screen.findByText("Any degree with 5 years in operations");
    expect(screen.getByText("Lead business operations")).toBeInTheDocument();
  });

  it("says what the poster gave and lacked, offers a one-tap request for each gap, and shows the text it read", async () => {
    const { container } = render(<EmployerAIJobCreatePage />);
    await uploadPoster(container);

    expect(screen.getByText(/Found: 2 skills, 2 responsibilities\./)).toBeInTheDocument();
    expect(screen.getByText(/Not on the poster: benefits, qualifications, salary, experience\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View poster text" }));
    const dialog = await screen.findByRole("dialog", { name: "Text read from your poster" });
    expect(dialog).toHaveTextContent("Qualification: Any degree, 5 years in operations");
    fireEvent.keyDown(dialog, { key: "Escape" });

    chatReply = 'Copied it.\n<JOB_DATA>{"qualifications":["Any degree","5 years in operations"]}</JOB_DATA>';
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add qualifications" }));
    });
    const chatCall = fetchMock.mock.calls.find(([url]) => url === "/api/ai/chat");
    const body = JSON.parse((chatCall![1] as RequestInit).body as string);
    expect(body.messages.at(-1)).toEqual({ role: "user", content: expect.stringMatching(/^Copy the qualifications from the poster/) });
    expect(body.posterText).toBe(POSTER_TEXT);
    // The typed box is left alone, and the filled gap's request goes away.
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue("");
    await screen.findByText("5 years in operations");
    expect(screen.queryByRole("button", { name: "Add qualifications" })).toBeNull();
    expect(screen.getByRole("button", { name: "Suggest benefits" })).toBeInTheDocument();
  });

  it("keeps the current poster's text when a second upload finds no jobs", async () => {
    const { container } = render(<EmployerAIJobCreatePage />);
    await uploadPoster(container);
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url === "/api/ai/job-extract"
        ? { ok: true, json: async () => ({ jobs: [], posterText: "A FLYER WITH NO VACANCY" }) }
        : { ok: true, json: async () => ({ threadId: "thread-1" }) }),
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], "flyer.png", { type: "image/png" })] } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Review in Full Form/ }));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(JSON.parse(window.sessionStorage.getItem("job-ai-prefill") ?? "{}").posterText).toBe(POSTER_TEXT);
  });

  it("ignores fields of the wrong type in the chat's answer instead of crashing the preview", async () => {
    const { container } = render(<EmployerAIJobCreatePage />);
    await uploadPoster(container);
    chatReply = 'Done.\n<JOB_DATA>{"qualifications":"Any degree","description":42,"benefits":["Health cover"]}</JOB_DATA>';
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "add benefits" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    });
    await screen.findByText("Health cover");
    expect(screen.getByText("Lead business operations for a growing events company in Kochi.")).toBeInTheDocument();
  });

  // Live check 2026-11-09: "5+ years" came back as min 5, max 0, shown as
  // "5–0 years" and refused by the jobs API (max must be >= min).
  it("reads a minimum-only experience as 'N+ years' and gives the form a valid range", async () => {
    const extracted = { ...EXTRACTED, requirements: { ...EXTRACTED.requirements, experienceMin: 5, experienceMax: 0 } };
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url === "/api/ai/job-extract"
        ? { ok: true, json: async () => ({ jobs: [extracted], posterText: POSTER_TEXT }) }
        : { ok: true, json: async () => ({ threadId: "thread-1" }) }),
    );
    const { container } = render(<EmployerAIJobCreatePage />);
    await uploadPoster(container);
    expect(screen.getByText("5+ years")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Review in Full Form/ }));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    const prefill = JSON.parse(window.sessionStorage.getItem("job-ai-prefill") ?? "{}");
    expect(prefill.requirements).toMatchObject({ experienceMin: 5, experienceMax: 10 });
  });

  it("carries the poster's text and the education into the full form", async () => {
    const { container } = render(<EmployerAIJobCreatePage />);
    await uploadPoster(container);
    fireEvent.click(screen.getByRole("button", { name: /Review in Full Form/ }));

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    const prefill = JSON.parse(window.sessionStorage.getItem("job-ai-prefill") ?? "{}");
    expect(prefill.posterText).toBe(POSTER_TEXT);
    expect(prefill.requirements.education).toBe("Any degree");
  });
});
