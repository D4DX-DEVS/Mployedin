/**
 * @jest-environment jsdom
 *
 * The job form's AI assistant sends the poster's own text along when the job
 * was read from an uploaded poster (2026-11-09: "you didn't add the
 * qualification from the poster" had nothing to compare against), and a
 * pasted section is no longer cut at 1000 characters.
 */
import { act, renderHook } from "@testing-library/react";

const csrfFetch = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));

import { useJobAssistant } from "@/components/features/jobs/ai-assistant/useJobAssistant";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function setup(getSource?: () => string | undefined) {
  const applyChanges = jest.fn(() => () => {});
  const { result } = renderHook(() =>
    useJobAssistant({ getJob: () => ({ title: "Operations Head" }), applyChanges, getSource }, () => "error"),
  );
  return { result, applyChanges };
}

const sentBody = () => JSON.parse((csrfFetch.mock.calls[0] as [string, RequestInit])[1].body as string);

beforeEach(() => {
  csrfFetch.mockReset().mockResolvedValue(ok({ reply: "Added.", changes: { qualifications: ["Any degree"] } }));
});

describe("useJobAssistant request", () => {
  it("sends the poster's text with the request when the form has it", async () => {
    const { result } = setup(() => "Qualification: Any degree");
    await act(async () => { await result.current.ask("Add the qualification from the poster"); });
    expect(sentBody()).toMatchObject({ source: "Qualification: Any degree", job: { title: "Operations Head" } });
  });

  it("sends no source when the job was not read from a poster", async () => {
    const { result } = setup();
    await act(async () => { await result.current.ask("Write the description"); });
    expect(sentBody()).not.toHaveProperty("source");
  });

  it("shows a one-tap starter by its label while the model gets the full instruction", async () => {
    // The chat used to print the long instruction behind the chip, which the user never typed.
    const { result } = setup();
    await act(async () => { await result.current.ask("Write a clear job description for this role from the details so far.", "Write the description"); });
    expect(sentBody().instruction).toBe("Write a clear job description for this role from the details so far.");
    expect(result.current.messages[0]).toMatchObject({ role: "user", shown: "Write the description" });
  });

  it("keeps a pasted section of up to 3000 characters", async () => {
    const { result } = setup();
    await act(async () => { await result.current.ask("a".repeat(3500)); });
    expect(sentBody().instruction).toHaveLength(3000);
  });
});
