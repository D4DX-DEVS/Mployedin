/**
 * @jest-environment jsdom
 *
 * Admin > System health shows the deploy problem the server logs at start-up:
 * no trusted client-IP source in production (every visitor shares one
 * rate-limit bucket, and every stored IP reads "direct").
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import AdminSystemHealthPage from "@/app/[locale]/(dashboard)/admin/system-health/page";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const health = (clientIp: Record<string, unknown>) => ({
  database: { status: "healthy", latencyMs: 12, connections: 1 },
  storage: null,
  integrations: { status: "healthy", active: 0, failing: 0 },
  support: { status: "healthy", openTickets: 0, unreadSubmissions: 0 },
  users: { activeLast24h: 1, totalActive: 1, totalRegistered: 1 },
  jobs: { active: 1, total: 1, applicationsToday: 0 },
  subscriptionPlans: {
    status: "healthy",
    enforcementEnabled: false,
    employer: { activePlans: 1, hasDefault: true },
    jobSeeker: { activePlans: 1, hasDefault: true },
  },
  process: { uptimeSeconds: 60, memoryUsedMb: 100, memoryTotalMb: 200 },
  deployment: { clientIp },
});

const serve = (body: unknown) => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch;
};

describe("System health: the client-IP source", () => {
  it("warns, with the setting to change, when production has no trusted client-IP source", async () => {
    serve(health({ status: "critical", source: "none" }));
    render(<AdminSystemHealthPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Visitor IP addresses aren't configured");
    expect(alert).toHaveTextContent("TRUSTED_CLIENT_IP_HEADER=do-connecting-ip");
    // The header chip can't read "operational" while this is wrong.
    expect(screen.queryByText("All Systems Operational")).not.toBeInTheDocument();
  });

  it("shows no warning when a source is configured", async () => {
    serve(health({ status: "healthy", source: "header", header: "do-connecting-ip" }));
    render(<AdminSystemHealthPage />);

    await screen.findByText("All Systems Operational");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
