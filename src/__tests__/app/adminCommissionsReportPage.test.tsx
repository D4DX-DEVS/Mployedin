/**
 * @jest-environment jsdom
 */
/**
 * The commission report used to add every currency together and label the sum
 * "AED", and a failed load left the table saying there was no data. Commissions
 * are shown one currency at a time, and a failure is an error with a retry.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";

import AdminCommissionsReportPage from "@/app/[locale]/(dashboard)/admin/commissions-report/page";

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/admin/commissions-report",
}));

const originalFetch = global.fetch;

const inrReport = {
  year: 2026,
  summary: {
    totalCommissions: 50329.95, totalPending: 0, totalApproved: 50329.95, totalPaid: 0,
    totalDisputed: 0, totalClawedBack: 0, avgRate: 8.33, currency: "INR",
  },
  currencies: [
    { currency: "INR", total: 50329.95, count: 8 },
    { currency: "AED", total: 1200, count: 1 },
  ],
  monthlyTrend: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0, pending: 0, approved: i === 8 ? 50329.95 : 0, paid: 0, count: i === 8 ? 8 : 0 })),
  quarterlyBreakdown: [
    { label: "Q1", total: 0, approved: 0, paid: 0, count: 0 },
    { label: "Q2", total: 0, approved: 0, paid: 0, count: 0 },
    { label: "Q3", total: 50329.95, approved: 50329.95, paid: 0, count: 8 },
    { label: "Q4", total: 0, approved: 0, paid: 0, count: 0 },
  ],
  typeBreakdown: [{ type: "placement", amount: 50329.95, count: 8, percent: 100 }],
  agentBreakdown: [{
    agentId: "a1", agentName: "Deepa Rajan", agentEmail: "deepa@example.com", superAgentId: "", superAgentName: "",
    total: 50329.95, pending: 0, approved: 50329.95, paid: 0, count: 8, avgRate: 8.33,
  }],
};

afterEach(() => {
  global.fetch = originalFetch;
});

describe("AdminCommissionsReportPage", () => {
  it("labels every amount with the currency the report is in, never a default AED", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => inrReport } as Response);

    render(<AdminCommissionsReportPage />);

    const row = (await screen.findByText("Deepa Rajan")).closest("tr") as HTMLElement;
    expect(within(row).getAllByText("₹50,330").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/AED\s?50/);

    // More than one currency in the year: a currency picker appears.
    expect(screen.getByRole("combobox", { name: "Filter by currency" })).toBeInTheDocument();
  });

  it("asks the API for the chosen year and leaves the currency to the server by default", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => inrReport } as Response);
    global.fetch = fetchMock;

    render(<AdminCommissionsReportPage />);

    await screen.findByText("Deepa Rajan");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/admin\/commissions-report\?year=\d{4}$/);
  });

  it("shows an error with a retry when the report fails, not an empty table", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);

    render(<AdminCommissionsReportPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/No commission data for/)).toBeNull();
    expect(screen.getByRole("navigation", { name: "Reports" })).toBeInTheDocument();
  });
});
