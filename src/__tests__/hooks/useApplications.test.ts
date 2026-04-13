/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useApplications,
  useUpdateApplicationStatus,
  useBulkAction,
  useApplicationTimeline,
  useCreateInterviewFromApp,
  useCompareApplications,
  applicationKeys,
} from "@/hooks/useApplications";
import type { ApplicationsFilters } from "@/hooks/useApplications";

// ── Helpers ──────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Query-key factory ───────────────────────────────────────────────

describe("applicationKeys factory", () => {
  it("produces unique list keys per filter combo", () => {
    const a: ApplicationsFilters = { page: 1, limit: 10, status: "pending" };
    const b: ApplicationsFilters = { page: 1, limit: 10, status: "hired" };
    expect(applicationKeys.list(a)).not.toEqual(applicationKeys.list(b));
  });

  it("timeline keys differ by id", () => {
    expect(applicationKeys.timeline("a1")).not.toEqual(
      applicationKeys.timeline("a2"),
    );
  });

  it("compare keys differ by ids", () => {
    expect(applicationKeys.compare(["a1", "a2"])).not.toEqual(
      applicationKeys.compare(["a1", "a3"]),
    );
  });
});

// ── useApplications ─────────────────────────────────────────────────

describe("useApplications", () => {
  const payload = {
    applications: [{ _id: "a1", status: "pending" }],
    pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
  };

  it("fetches /api/applications with page & limit", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload });

    const { result } = renderHook(
      () => useApplications({ page: 1, limit: 10 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("/api/applications?");
    expect(url).toContain("page=1");
    expect(url).toContain("limit=10");
  });

  it("includes status param when not 'all'", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload });

    renderHook(
      () => useApplications({ page: 1, limit: 10, status: "shortlisted" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("status=shortlisted");
  });

  it("excludes status param when 'all'", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload });

    renderHook(
      () => useApplications({ page: 1, limit: 10, status: "all" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).not.toContain("status=");
  });

  it("includes jobId when provided", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload });

    renderHook(
      () => useApplications({ page: 1, limit: 10, jobId: "j1" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("jobId=j1");
  });

  it("transitions to error state on failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(
      () => useApplications({ page: 1, limit: 10 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ── useUpdateApplicationStatus ──────────────────────────────────────

describe("useUpdateApplicationStatus", () => {
  it("calls PATCH /api/applications/:id with status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useUpdateApplicationStatus(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "a1", status: "shortlisted" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/applications/a1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "shortlisted" }),
      }),
    );
  });

  it("includes rejectionReason when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useUpdateApplicationStatus(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: "a1",
        status: "rejected",
        rejectionReason: "Not qualified",
      });
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.status).toBe("rejected");
    expect(body.rejectionReason).toBe("Not qualified");
  });

  it("throws on failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

    const { result } = renderHook(() => useUpdateApplicationStatus(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(() => result.current.mutateAsync({ id: "a1", status: "rejected" })),
    ).rejects.toThrow("Failed to update application status");
  });
});

// ── useBulkAction ───────────────────────────────────────────────────

describe("useBulkAction", () => {
  it("calls POST /api/applications/bulk with action + ids", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ updated: 2 }),
    });

    const { result } = renderHook(() => useBulkAction(), {
      wrapper: createWrapper(),
    });

    const payload = {
      applicationIds: ["a1", "a2"],
      action: "shortlist",
      params: {},
    };

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/applications/bulk",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("throws on failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useBulkAction(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(() =>
        result.current.mutateAsync({
          applicationIds: ["a1"],
          action: "reject",
          params: {},
        }),
      ),
    ).rejects.toThrow("Failed to perform bulk action");
  });
});

describe("useCreateInterviewFromApp", () => {
  it("posts interview scheduling payload to the bulk interviews route", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ created: 1, failed: 0, ids: ["iv1"] }),
    });

    const { result } = renderHook(() => useCreateInterviewFromApp(), {
      wrapper: createWrapper(),
    });

    const payload = {
      candidates: [{ applicationId: "a1", jobSeekerId: "js1" }],
      jobId: "j1",
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      type: "video",
      duration: 45,
      meetLink: "https://meet.example.com/interview",
    };

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/interviews/bulk",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });
});

// ── useApplicationTimeline ──────────────────────────────────────────

describe("useApplicationTimeline", () => {
  it("fetches timeline when appId is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ timeline: [{ event: "applied" }] }),
    });

    const { result } = renderHook(
      () => useApplicationTimeline("a1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("/api/applications/a1/timeline");
  });

  it("does not fetch when appId is null", () => {
    const { result } = renderHook(
      () => useApplicationTimeline(null),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("transitions to error on failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const { result } = renderHook(
      () => useApplicationTimeline("a1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ── useCompareApplications ──────────────────────────────────────────

describe("useCompareApplications", () => {
  it("fetches when ids.length >= 2", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ comparisons: [] }),
    });

    const { result } = renderHook(
      () => useCompareApplications(["a1", "a2"]),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("/api/applications/compare?ids=a1,a2");
  });

  it("does not fetch when ids.length < 2", () => {
    const { result } = renderHook(
      () => useCompareApplications(["a1"]),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not fetch when ids is empty", () => {
    const { result } = renderHook(
      () => useCompareApplications([]),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
