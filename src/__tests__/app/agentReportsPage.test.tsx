/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AgentReportsPage from "@/app/[locale]/(dashboard)/agent/reports/page";

describe("AgentReportsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalPlacements: 0, commissionEarned: 0, activeJobs: 0 }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders report headings and layout without hardcoded white backgrounds", async () => {
    const view = render(<AgentReportsPage />);

    // findBy* flushes the analytics fetch inside act() — a sync getBy left the
    // setAnalyticsLoading(false) update landing after the test ended.
    expect(await screen.findByRole("heading", { name: "Reports & Analytics" })).toBeInTheDocument();

    expect(view.container.innerHTML).not.toContain("bg-white/80");
    expect(view.container.innerHTML).not.toContain("bg-white/95");
    expect(view.container.innerHTML).not.toContain("text-slate-950");
    expect(view.container.innerHTML).not.toContain("text-slate-600");
  });

  // A failed analytics load used to make the KPIs, funnel and commissions
  // vanish without a word, so the agent read it as "nothing to show".
  it("says the performance figures could not load and offers a retry", async () => {
    const fetchMock = jest.fn((url: string) =>
      Promise.resolve(url === "/api/agent/analytics"
        ? { ok: false, status: 500, json: async () => ({ error: "boom" }) }
        : { ok: true, json: async () => ({}) }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AgentReportsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your performance figures");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => u === "/api/agent/analytics")).toHaveLength(2));
  });

  it("never shows the browser's own error text when a report request cannot reach the server", async () => {
    global.fetch = jest.fn((url: string) =>
      url === "/api/ai/report"
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;

    render(<AgentReportsPage />);
    fireEvent.click(await screen.findByText("This week's activity summary"));

    expect(await screen.findByText("We couldn't generate that report. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });
});