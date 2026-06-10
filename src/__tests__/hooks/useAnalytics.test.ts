/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useAnalyticsOverview,
  useAnalyticsPipeline,
  useAnalyticsHistorical,
  useAnalyticsJobs,
  useAnalyticsResponseTime,
  analyticsKeys,
} from "@/hooks/useAnalytics";

// ── Helpers ──────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

describe("analyticsKeys factory", () => {
  it("pipeline keys differ by jobId", () => {
    expect(analyticsKeys.pipeline("j1")).not.toEqual(
      analyticsKeys.pipeline("j2"),
    );
  });

  it("historical keys differ by params", () => {
    const a = analyticsKeys.historical({ range: "7d" });
    const b = analyticsKeys.historical({ range: "30d" });
    expect(a).not.toEqual(b);
  });

  it("all keys share the analytics prefix", () => {
    expect(analyticsKeys.overview()[0]).toBe("analytics");
    expect(analyticsKeys.jobs()[0]).toBe("analytics");
    expect(analyticsKeys.responseTime()[0]).toBe("analytics");
  });
});

// ── useAnalyticsOverview ────────────────────────────────────────────

describe("useAnalyticsOverview", () => {
  const overviewPayload = {
    funnel: [{ stage: "applied", count: 100 }],
    trend: [{ date: "2024-01-01", count: 10 }],
    topJobs: [],
    conversion: { applied: 100, shortlisted: 50, interview: 25, selected: 10, hired: 5 },
  };

  it("fetches /api/employers/analytics", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => overviewPayload,
    });

    const { result } = renderHook(() => useAnalyticsOverview(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("/api/employers/analytics");
    expect(result.current.data?.funnel).toHaveLength(1);
  });

  it("does not fetch when enabled is false", () => {
    const { result } = renderHook(() => useAnalyticsOverview(false), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("transitions to error on failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useAnalyticsOverview(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "Failed to fetch analytics overview",
    );
  });
});

// ── useAnalyticsPipeline ────────────────────────────────────────────

describe("useAnalyticsPipeline", () => {
  const pipelinePayload = {
    stageDistribution: [],
    perJob: [],
    conversionRates: {
      appliedToShortlisted: 0.5,
      shortlistedToInterview: 0.4,
      interviewToOffer: 0.3,
      offerToHired: 0.8,
      overallHireRate: 0.05,
    },
    stalledCount: 3,
  };

  it("includes jobId in query param when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => pipelinePayload,
    });

    const { result } = renderHook(
      () => useAnalyticsPipeline("j1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("/api/employers/analytics/pipeline");
    expect(url).toContain("jobId=j1");
  });

  it("fetches without jobId param when empty string", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => pipelinePayload,
    });

    const { result } = renderHook(
      () => useAnalyticsPipeline(""),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe("/api/employers/analytics/pipeline");
    expect(url).not.toContain("jobId");
  });

  it("does not fetch when enabled is false", () => {
    const { result } = renderHook(
      () => useAnalyticsPipeline("j1", undefined, false),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── useAnalyticsHistorical ──────────────────────────────────────────

describe("useAnalyticsHistorical", () => {
  const historicalPayload = {
    timeToHire: [],
    dropOff: [],
    sourceBreakdown: [],
    trend: [],
    perJobTimeToHire: [],
    totalApplications: 0,
    dateRange: { start: "2024-01-01", end: "2024-01-31" },
  };

  it("includes range param", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => historicalPayload,
    });

    const { result } = renderHook(
      () => useAnalyticsHistorical({ range: "30d" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("range=30d");
  });

  it("includes custom start/end dates when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => historicalPayload,
    });

    renderHook(
      () =>
        useAnalyticsHistorical({
          range: "custom",
          customStart: "2024-01-01",
          customEnd: "2024-01-31",
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain("startDate=2024-01-01");
    expect(url).toContain("endDate=2024-01-31");
  });

  it("does not fetch when enabled is false", () => {
    const { result } = renderHook(
      () => useAnalyticsHistorical({ range: "7d" }, false),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("transitions to error on failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(
      () => useAnalyticsHistorical({ range: "7d" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ── useAnalyticsJobs ────────────────────────────────────────────────

describe("useAnalyticsJobs", () => {
  it("fetches /api/employers/analytics/jobs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobs: [], summary: {} }),
    });

    const { result } = renderHook(() => useAnalyticsJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("/api/employers/analytics/jobs");
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useAnalyticsJobs(false), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

// ── useAnalyticsResponseTime ────────────────────────────────────────

describe("useAnalyticsResponseTime", () => {
  it("fetches /api/employers/analytics/response-time", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        overall: { avgHours: 24, medianHours: 12, totalMeasured: 50, avgDays: 1 },
        commitment: null,
        perJob: [],
        distribution: [],
      }),
    });

    const { result } = renderHook(() => useAnalyticsResponseTime(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/employers/analytics/response-time",
    );
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useAnalyticsResponseTime(false), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
