/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { useJobShareReferral } from "@/lib/referrals/useJobShareReferral";
import { clearPendingReferral, getPendingReferral, setPendingReferral } from "@/lib/referrals/pendingReferral";

const CODE = "MPL-1A2B3C4D5E6F7A8B";
const fetchMock = jest.fn();

function validateResponds(body: Record<string, unknown>) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => body });
}

function openJobPage(search: string, hash = "") {
  window.history.replaceState(null, "", `/en/jobs/abc${search}${hash}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
  document.cookie = "mpl_ref=; Max-Age=0; Path=/";
  clearPendingReferral();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useJobShareReferral (job page ?ref=)", () => {
  it("keeps a valid job-seeker code in memory and writes no mpl_ref cookie", async () => {
    openJobPage(`?ref=${CODE}`);
    validateResponds({ valid: true, audience: "job_seeker" });
    const { result } = renderHook(() => useJobShareReferral());

    await waitFor(() => expect(result.current()).toEqual({ referralCode: CODE }));
    expect(fetchMock).toHaveBeenCalledWith(`/api/referral/validate?code=${CODE}`);
    expect(document.cookie).not.toContain("mpl_ref");
    expect(document.cookie).not.toContain(CODE);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("offers the code to the register links in the header and footer", async () => {
    openJobPage(`?ref=${CODE}`);
    validateResponds({ valid: true, audience: "job_seeker" });
    const { result } = renderHook(() => useJobShareReferral());
    await waitFor(() => expect(result.current()).toEqual({ referralCode: CODE }));
    expect(getPendingReferral()).toBe(CODE);
  });

  it("takes ref out of the address bar and keeps the other params and the hash", async () => {
    openJobPage(`?utm=a&ref=${CODE}`, "#apply");
    validateResponds({ valid: true, audience: "job_seeker" });
    const { result } = renderHook(() => useJobShareReferral());
    await waitFor(() => expect(result.current()).toEqual({ referralCode: CODE }));
    await waitFor(() => expect(window.location.search).toBe("?utm=a"));
    expect(window.location.hash).toBe("#apply");
  });

  it("still holds the code in React strict mode, where the effect runs twice", async () => {
    openJobPage(`?ref=${CODE}`);
    validateResponds({ valid: true, audience: "job_seeker" });
    const { result } = renderHook(() => useJobShareReferral(), { wrapper: React.StrictMode });
    await waitFor(() => expect(result.current()).toEqual({ referralCode: CODE }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("waits a tick before touching the address bar, so Next's router has patched history first", async () => {
    openJobPage(`?x=1&ref=${CODE}`);
    validateResponds({ valid: true, audience: "job_seeker" });
    renderHook(() => useJobShareReferral());
    // Still there right after the effects ran: Next's own history patch is installed by then.
    expect(window.location.search).toBe(`?x=1&ref=${CODE}`);
    await waitFor(() => expect(window.location.search).toBe("?x=1"));
  });

  it("falls back to a code already held in memory (a visit that began on another page)", () => {
    openJobPage("?x=1");
    setPendingReferral(CODE);
    const { result } = renderHook(() => useJobShareReferral());
    expect(result.current()).toEqual({ referralCode: CODE });
  });

  it("ignores an employer link and an unknown code, with nothing stored", async () => {
    openJobPage(`?ref=${CODE}`);
    validateResponds({ valid: true, audience: "employer" });
    const first = renderHook(() => useJobShareReferral());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(first.result.current()).toEqual({});
    expect(getPendingReferral()).toBe("");

    fetchMock.mockClear();
    openJobPage(`?ref=${CODE}`);
    validateResponds({ valid: false });
    const second = renderHook(() => useJobShareReferral());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(second.result.current()).toEqual({});
    expect(getPendingReferral()).toBe("");
    expect(document.cookie).not.toContain("mpl_ref");
  });

  it("ignores a malformed code without calling the server, and still cleans the address", async () => {
    openJobPage("?ref=%3Cscript%3E");
    const { result } = renderHook(() => useJobShareReferral());
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current()).toEqual({});
  });

  it("does nothing on a job page with no ref", () => {
    openJobPage("?x=1");
    const { result } = renderHook(() => useJobShareReferral());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current()).toEqual({});
    expect(window.location.search).toBe("?x=1");
  });

  it("swallows a failed validation: nothing is kept and nothing throws", async () => {
    openJobPage(`?ref=${CODE}`);
    fetchMock.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useJobShareReferral());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current()).toEqual({});
  });
});
