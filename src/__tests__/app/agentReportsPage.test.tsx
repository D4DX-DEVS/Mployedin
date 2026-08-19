/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

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
});