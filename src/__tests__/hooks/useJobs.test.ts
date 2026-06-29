/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useJobs,
  useUpdateJobStatus,
  useUpdateJob,
  useCloneJob,
  useDeleteJob,
  useJobDetail,
  jobKeys,
} from "@/hooks/useJobs";
import type { JobsFilters } from "@/hooks/useJobs";

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

// ── Query‑key factory ───────────────────────────────────────────────

describe("jobKeys factory", () => {
  it("produces unique keys per filter combination", () => {
    const a: JobsFilters = { page: 1, limit: 10, status: "active" };
    const b: JobsFilters = { page: 1, limit: 10, status: "closed" };
    const c: JobsFilters = { page: 2, limit: 10, status: "active" };

    expect(jobKeys.list(a)).not.toEqual(jobKeys.list(b));
    expect(jobKeys.list(a)).not.toEqual(jobKeys.list(c));
  });

  it("detail keys differ by id", () => {
    expect(jobKeys.detail("abc")).not.toEqual(jobKeys.detail("xyz"));
  });

  it("list keys share the lists prefix", () => {
    const key = jobKeys.list({ page: 1, limit: 10 });
    expect(key[0]).toBe("jobs");
    expect(key[1]).toBe("list");
  });
});

// ── useJobs ─────────────────────────────────────────────────────────

describe("useJobs", () => {
  const jobsPayload = {
    jobs: [{ _id: "j1", title: "Engineer", status: "active" }],
    pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
  };

  it("fetches /api/jobs with page & limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => jobsPayload,
    });

    const { result } = renderHook(
      () => useJobs({ page: 1, limit: 10 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("/api/jobs?");
    expect(url).toContain("page=1");
    expect(url).toContain("limit=10");
  });

  it("includes status param when not 'all'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => jobsPayload,
    });

    renderHook(
      () => useJobs({ page: 1, limit: 10, status: "active" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("status=active");
  });

  it("excludes status param when value is 'all'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => jobsPayload,
    });

    renderHook(
      () => useJobs({ page: 1, limit: 10, status: "all" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).not.toContain("status=");
  });

  it("includes myJobs and search when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => jobsPayload,
    });

    renderHook(
      () => useJobs({ page: 1, limit: 10, myJobs: true, search: "react" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("myJobs=true");
    expect(url).toContain("search=react");
  });

  it("includes advanced filter params when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => jobsPayload,
    });

    renderHook(
      () => useJobs({
        page: 1,
        limit: 10,
        myJobs: true,
        status: "draft",
        approvalStatus: "pending",
        workMode: "remote",
        location: "Dubai",
        skills: ["React", "Node.js"],
        showSalary: "false",
      }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("status=draft");
    expect(url).toContain("approvalStatus=pending");
    expect(url).toContain("workMode=remote");
    expect(url).toContain("location=Dubai");
    expect(url).toContain("skills=React%2CNode.js");
    expect(url).toContain("showSalary=false");
  });

  it("transitions to error state when fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(
      () => useJobs({ page: 1, limit: 10 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("returns structured data on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => jobsPayload,
    });

    const { result } = renderHook(
      () => useJobs({ page: 1, limit: 10 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.jobs).toHaveLength(1);
    expect(result.current.data?.pagination.total).toBe(1);
  });
});

// ── useUpdateJobStatus ──────────────────────────────────────────────

describe("useUpdateJobStatus", () => {
  it("calls PATCH /api/jobs/:id with status body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useUpdateJobStatus(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ jobId: "j1", status: "closed" });
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/jobs/j1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ status: "closed" }),
    }));
  });

  it("throws when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

    const { result } = renderHook(() => useUpdateJobStatus(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(() => result.current.mutateAsync({ jobId: "j1", status: "closed" })),
    ).rejects.toThrow("Failed to update job status");
  });
});

// ── useCloneJob ─────────────────────────────────────────────────────

describe("useCloneJob", () => {
  it("calls POST /api/jobs/:id/clone", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job: { _id: "j2" } }),
    });

    const { result } = renderHook(() => useCloneJob(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync("j1");
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/jobs/j1/clone", { method: "POST" });
  });

  it("throws on failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useCloneJob(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(() => result.current.mutateAsync("j1")),
    ).rejects.toThrow("Failed to clone job");
  });
});

// ── useDeleteJob ────────────────────────────────────────────────────

describe("useDeleteJob", () => {
  it("calls DELETE /api/jobs/:id", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useDeleteJob(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync("j1");
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/jobs/j1", { method: "DELETE" });
  });

  it("throws on failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const { result } = renderHook(() => useDeleteJob(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(() => result.current.mutateAsync("j1")),
    ).rejects.toThrow("Failed to delete job");
  });
});

// ── useJobDetail ────────────────────────────────────────────────────

describe("useJobDetail", () => {
  it("fetches /api/jobs/:id when id is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job: { _id: "j1", title: "Dev" } }),
    });

    const { result } = renderHook(() => useJobDetail("j1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("/api/jobs/j1");
    expect(result.current.data?._id).toBe("j1");
  });

  it("does not fetch when id is empty", async () => {
    const { result } = renderHook(() => useJobDetail(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("useUpdateJob", () => {
  it("surfaces the first validation detail message when the update fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Validation failed",
        details: [{ path: "screeningQuestions.0.label", message: "Too small: expected string to have >=1 characters" }],
      }),
    });

    const { result } = renderHook(() => useUpdateJob(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(() => result.current.mutateAsync({ jobId: "j1", updates: { screeningQuestions: [{}] } })),
    ).rejects.toThrow("Too small: expected string to have >=1 characters");
  });

  it("falls back to the API error when there are no validation details", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Failed to update job" }),
    });

    const { result } = renderHook(() => useUpdateJob(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(() => result.current.mutateAsync({ jobId: "j1", updates: { title: "Role" } })),
    ).rejects.toThrow("Failed to update job");
  });
});
