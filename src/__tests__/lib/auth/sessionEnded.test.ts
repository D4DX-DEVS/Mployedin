/**
 * @jest-environment jsdom
 *
 * "Is this browser still signed in?", asked of the server after a sign-out.
 * Only a clear "no session" counts as ended: anything unclear (offline, a
 * server error, an answer that is not JSON) is "not ended", because the answer
 * decides whether someone is told they are signed out.
 */
import { sessionEnded } from "@/lib/auth/sessionEnded";

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const answer = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe("sessionEnded", () => {
  it("asks the session endpoint, never from a cache", async () => {
    fetchMock.mockResolvedValue(answer(null));
    await sessionEnded();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ cache: "no-store" }));
  });

  it.each([
    ["null (Auth.js's answer with no session)", null],
    ["an empty object", {}],
    ["an object with no user", { expires: "2026-12-01T00:00:00.000Z" }],
  ])("ended: %s", async (_name, body) => {
    fetchMock.mockResolvedValue(answer(body));
    await expect(sessionEnded()).resolves.toBe(true);
  });

  it("not ended while the answer still names a user", async () => {
    fetchMock.mockResolvedValue(answer({ user: { id: "u1", email: "sara@example.com" }, expires: "2026-12-01T00:00:00.000Z" }));
    await expect(sessionEnded()).resolves.toBe(false);
  });

  it("not ended when the server answers with an error", async () => {
    fetchMock.mockResolvedValue(answer({}, false));
    await expect(sessionEnded()).resolves.toBe(false);
  });

  it("gives up on a stalled connection after 8 seconds and answers not ended", async () => {
    jest.useFakeTimers();
    try {
      // A request that only ever ends when it is aborted.
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
      );
      const result = sessionEnded();
      let settled = false;
      void result.then(() => {
        settled = true;
      });

      await jest.advanceTimersByTimeAsync(7_900);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(200);
      await expect(result).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("not ended when the request fails (offline) or the answer can't be read", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(sessionEnded()).resolves.toBe(false);
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error("not json"); } });
    await expect(sessionEnded()).resolves.toBe(false);
  });
});
