/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateOffer, useWithdrawOffer } from "@/hooks/useOffers";
import { useUpdateInterview, useScheduleNextRound } from "@/hooks/useInterviews";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = jest.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { spy, wrapper };
}

const keys = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
});

describe("hiring mutations refresh the job workspace", () => {
  it("creating an offer invalidates offers, applications and the job hiring summary", async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useCreateOffer(), { wrapper });
    result.current.mutate({ applicationId: "app-1", salary: { amount: 1, currency: "AED", period: "monthly" }, startDate: "2026-10-01" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(keys(spy)).toEqual(expect.arrayContaining(['["offers","list"]', '["applications"]', '["job-hiring-summary"]']));
  });

  it("withdrawing an offer does the same", async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useWithdrawOffer(), { wrapper });
    result.current.mutate("offer-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(keys(spy)).toEqual(expect.arrayContaining(['["applications"]', '["job-hiring-summary"]']));
  });

  it("recording an interview outcome or scheduling the next round refreshes the stage counts", async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => ({ update: useUpdateInterview(), next: useScheduleNextRound() }), { wrapper });
    result.current.update.mutate({ id: "iv-1", status: "completed", outcome: "passed" });
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    result.current.next.mutate({ interviewId: "iv-1", scheduledAt: "2026-10-01T09:00:00Z", duration: 30, type: "video" });
    await waitFor(() => expect(result.current.next.isSuccess).toBe(true));
    const k = keys(spy);
    expect(k.filter((x) => x === '["job-hiring-summary"]')).toHaveLength(2);
    expect(k).toContain('["applications"]');
  });
});
