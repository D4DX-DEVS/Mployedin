/**
 * The seeker query cache: a profile read inside the fresh window is served
 * from memory, a write invalidates it for every page, and a 204 means "no
 * profile yet" rather than an error.
 */
import { QueryClient } from "@tanstack/react-query";
import { invalidateSeekerProfile, readSeekerProfile, seekerKeys } from "@/hooks/useSeekerCache";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function respond(status: number, body?: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe("useSeekerCache", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("serves a second profile read from the cache", async () => {
    fetchMock.mockReturnValue(respond(200, { skills: ["React"] }));
    const qc = client();

    expect(await readSeekerProfile(qc)).toEqual({ skills: ["React"] });
    expect(await readSeekerProfile(qc)).toEqual({ skills: ["React"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after a profile write invalidates the entry", async () => {
    fetchMock
      .mockReturnValueOnce(respond(200, { headline: "old" }))
      .mockReturnValueOnce(respond(200, { headline: "new" }));
    const qc = client();

    await readSeekerProfile(qc);
    await invalidateSeekerProfile(qc);
    expect(await readSeekerProfile(qc)).toEqual({ headline: "new" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats 204 as no profile and rejects on a failed load", async () => {
    fetchMock.mockReturnValueOnce(respond(204));
    expect(await readSeekerProfile(client())).toBeNull();

    fetchMock.mockReturnValueOnce(respond(500));
    await expect(readSeekerProfile(client())).rejects.toThrow("500");
  });

  it("keeps every seeker key under one prefix", () => {
    const keys = [
      seekerKeys.profile,
      seekerKeys.interviewList("page=1"),
      seekerKeys.offerList("page=1"),
      seekerKeys.companies(""),
      seekerKeys.documents,
      seekerKeys.settings,
      seekerKeys.onboarding,
    ];
    for (const key of keys) expect(key[0]).toBe(seekerKeys.all[0]);
  });
});
