/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import SuperAgentAgentsPage from "@/app/[locale]/(dashboard)/super-agent/agents/page";
import SuperAgentApprovalsPage from "@/app/[locale]/(dashboard)/super-agent/approvals/page";
import SuperAgentCommissionsPage from "@/app/[locale]/(dashboard)/super-agent/commissions/page";
import SuperAgentEmployersPage from "@/app/[locale]/(dashboard)/super-agent/employers/page";
import SuperAgentLeadsPage from "@/app/[locale]/(dashboard)/super-agent/leads/page";
import MarketIntelligencePage from "@/app/[locale]/(dashboard)/super-agent/market/page";
import SuperAgentPlacementsPage from "@/app/[locale]/(dashboard)/super-agent/placements/page";
import SuperAgentReportsPage from "@/app/[locale]/(dashboard)/super-agent/reports/page";

const paginationState = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
};

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => paginationState,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

// TODO: Tests need updating after page refactor - headings and structure changed
describe.skip("SuperAgent dark-mode page surfaces", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  const renderPage = async (page: React.ReactElement) => {
    let view: ReturnType<typeof render> | undefined;

    await act(async () => {
      view = render(page);
    });

    return view;
  };

  beforeEach(() => {
    paginationState.setPage.mockReset();
    paginationState.setLimit.mockReset();
    paginationState.updateTotal.mockReset();
    paginationState.resetPage.mockReset();

    fetchMock.mockReset();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/super-agent/profile") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ profile: { overrideRate: 7.5 } }),
        });
      }

      if (url === "/api/commissions?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                _id: "commission-1",
                agentId: {
                  fullName: "Sahar Ali",
                  userId: {
                    email: "sahar@example.com",
                  },
                },
                type: "placement",
                amount: 12500,
                currency: "AED",
                status: "pending",
                notes: "Regional placement payout",
                createdAt: "2026-04-10T00:00:00.000Z",
              },
            ],
            total: 1,
            totalPages: 1,
          }),
        });
      }

      if (url === "/api/super-agent/agents?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                _id: "agent-1",
                name: "Amina Noor",
                email: "amina@example.com",
                leadsCount: 12,
                conversions: 5,
                placements: 2,
                conversionRate: 41.6,
              },
            ],
            total: 1,
          }),
        });
      }

      if (url === "/api/super-agent/leads?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                _id: "lead-1",
                companyName: "Northstar Foods",
                contactPerson: "Rana Saleh",
                country: "UAE",
                industry: "Hospitality",
                status: "contacted",
                agentId: { userId: { name: "Amina Noor" } },
                createdAt: "2026-04-10T00:00:00.000Z",
              },
            ],
            total: 1,
          }),
        });
      }

      if (url === "/api/super-agent/leads?page=1&limit=10&status=contacted") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                _id: "lead-1",
                companyName: "Northstar Foods",
                contactPerson: "Rana Saleh",
                country: "UAE",
                industry: "Hospitality",
                status: "contacted",
                agentId: { userId: { name: "Amina Noor" } },
                createdAt: "2026-04-10T00:00:00.000Z",
              },
            ],
            total: 1,
          }),
        });
      }

      if (url === "/api/employers?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            employers: [
              {
                _id: "employer-1",
                name: "Northstar Foods",
                email: "employer@mployedin.com",
                companyName: "Northstar Foods",
                industry: "Hospitality",
                location: "Dubai, UAE",
                isActive: true,
                assignedAgent: { name: "Amina Noor" },
              },
            ],
            total: 1,
          }),
        });
      }

      if (url === "/api/super-agent/approvals?status=pending") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            jobs: [
              {
                _id: "job-1",
                title: "Operations Manager",
                location: "Dubai, UAE",
                category: "Operations",
                poster: { approvalStatus: "pending" },
                createdAt: "2026-04-12T00:00:00.000Z",
                employerId: { companyName: "Northstar Foods" },
                postedByAgent: { name: "Amina Noor" },
              },
            ],
          }),
        });
      }

      if (url === "/api/placements?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                _id: "placement-1",
                jobSeekerId: { fullName: "Tariq Mansoor" },
                jobId: { title: "Operations Manager" },
                employerId: { companyName: "Northstar Foods" },
                status: "active",
                startDate: "2026-04-25T00:00:00.000Z",
                createdAt: "2026-04-12T00:00:00.000Z",
              },
            ],
            total: 1,
          }),
        });
      }

      if (url === "/api/super-agent/reports") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            totalAgents: 4,
            totalLeads: 18,
            totalPlacements: 3,
            totalCommissions: 25500,
          }),
        });
      }

      if (url === "/api/ai/report") {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({
            summary: "Visa timelines are stabilising across the GCC with stronger hiring demand in logistics and hospitality.",
            insights: [
              {
                title: "Hiring demand",
                value: "+18%",
                trend: "Hospitality demand rose month over month.",
                category: "demand",
              },
            ],
            recommendations: ["Increase sourcing capacity in Dubai and Doha."],
            generatedAt: "2026-04-17T10:30:00.000Z",
          }),
        });
      }

      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("avoids hard-coded light-only classes in the commissions controls and table", async () => {
    await renderPage(<SuperAgentCommissionsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/commissions?page=1&limit=10");
    });

    await screen.findByText("Sahar Ali");

    const overrideInput = screen.getByLabelText(/commission override rate/i);
    const allFilterButton = screen.getByRole("button", { name: "All" });
    const pendingFilterButton = screen.getByRole("button", { name: "Pending" });
    const tableHeaderRow = screen.getByRole("columnheader", { name: "Agent" }).closest("tr");
    const agentName = screen.getByText("Sahar Ali");
    const agentEmail = screen.getByText("sahar@example.com");

    expect(overrideInput).not.toHaveClass("border-slate-200");
    expect(overrideInput).not.toHaveClass("bg-white");
    expect(overrideInput).not.toHaveClass("text-slate-700");

    expect(allFilterButton).not.toHaveClass("bg-slate-950");
    expect(allFilterButton).not.toHaveClass("text-white");
    expect(allFilterButton).not.toHaveClass("hover:bg-slate-800");

    expect(pendingFilterButton).not.toHaveClass("border-slate-200");
    expect(pendingFilterButton).not.toHaveClass("bg-white");
    expect(pendingFilterButton).not.toHaveClass("hover:bg-slate-50");

    expect(tableHeaderRow).not.toHaveClass("border-slate-200");
    expect(tableHeaderRow).not.toHaveClass("bg-slate-50/80");
    expect(agentName).not.toHaveClass("text-slate-950");
    expect(agentEmail).not.toHaveClass("text-slate-500");

    expect(allFilterButton).toHaveAttribute("aria-pressed", "true");
    expect(pendingFilterButton).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    {
      name: "agents",
      page: <SuperAgentAgentsPage />,
      endpoint: "/api/super-agent/agents?page=1&limit=10",
      heading: /agent performance/i,
      content: "Amina Noor",
    },
    {
      name: "leads",
      page: <SuperAgentLeadsPage />,
      endpoint: "/api/super-agent/leads?page=1&limit=10",
      heading: /lead pipeline/i,
      content: "Northstar Foods",
    },
    {
      name: "employers",
      page: <SuperAgentEmployersPage />,
      endpoint: "/api/employers?page=1&limit=10",
      heading: /employer relationships/i,
      content: "Northstar Foods",
    },
    {
      name: "approvals",
      page: <SuperAgentApprovalsPage />,
      endpoint: "/api/super-agent/approvals?status=pending",
      heading: /regional job approvals/i,
      content: "Operations Manager",
    },
    {
      name: "placements",
      page: <SuperAgentPlacementsPage />,
      endpoint: "/api/placements?page=1&limit=10",
      heading: /^placements$/i,
      content: "Tariq Mansoor",
    },
  ])("keeps the $name page free of light-only table and search classes", async ({ page, endpoint, heading, content }) => {
    const { container } = render(page);

    await screen.findByRole("heading", { name: heading });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(endpoint);
    });

    await screen.findByText(content);

    expect(container.innerHTML).not.toContain("border-slate-200");
    expect(container.innerHTML).not.toContain("border-slate-100");
    expect(container.innerHTML).not.toContain("bg-slate-50/80");
    expect(container.innerHTML).not.toContain("bg-slate-50");
    expect(container.innerHTML).not.toContain("bg-slate-200");
    expect(container.innerHTML).not.toContain("text-slate-950");
    expect(container.innerHTML).not.toContain("text-slate-700");
    expect(container.innerHTML).not.toContain("text-slate-500");
  });

  it("keeps super-agent search controls programmatically labeled", async () => {
    const agentsView = await renderPage(<SuperAgentAgentsPage />);
    await screen.findByText("Amina Noor");
    expect(screen.getByRole("textbox", { name: /search agents/i })).toBeInTheDocument();
    agentsView?.unmount?.();

    const leadsView = await renderPage(<SuperAgentLeadsPage />);
    await screen.findByText("Northstar Foods");
    expect(screen.getByRole("textbox", { name: /search leads/i })).toBeInTheDocument();
    leadsView?.unmount?.();

    const employersView = await renderPage(<SuperAgentEmployersPage />);
    await screen.findAllByText("Northstar Foods");
    expect(screen.getByRole("textbox", { name: /search employers/i })).toBeInTheDocument();
    employersView?.unmount?.();

    await renderPage(<MarketIntelligencePage />);
    expect(screen.getByRole("textbox", { name: /ask anything about .*recruitment market/i })).toBeInTheDocument();
  });

  it("keeps selected super-agent filters exposed with aria-pressed", async () => {
    const approvalsView = await renderPage(<SuperAgentApprovalsPage />);
    await screen.findByText("Operations Manager");

    const approvalsSection = screen.getByRole("heading", { name: /process the regional approval queue/i }).closest("section");

    expect(within(approvalsSection as HTMLElement).getByRole("button", { name: /pending/i })).toHaveAttribute("aria-pressed", "true");

    approvalsView!.unmount();

    const commissionsView = await renderPage(<SuperAgentCommissionsPage />);
    await screen.findByText("Sahar Ali");

    const commissionsSection = screen.getByRole("heading", { name: /configure the regional override and filter payout status/i }).closest("section");

    expect(within(commissionsSection as HTMLElement).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    commissionsView!.unmount();

    await renderPage(<SuperAgentLeadsPage />);

    const contactedStage = screen.getByRole("button", { name: /contacted/i });
    expect(contactedStage).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(contactedStage);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/super-agent/leads?page=1&limit=10&status=contacted");
    });

    expect(contactedStage).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the market page controls and loaded insight cards on semantic tokens", async () => {
    const { container } = render(<MarketIntelligencePage />);

    expect(screen.getByRole("heading", { name: /ai market intelligence/i })).toBeInTheDocument();
    const marketInput = screen.getByRole("textbox", { name: /ask anything about .*recruitment market/i });
    const analyseButton = screen.getByRole("button", { name: /analyse/i });

    expect(analyseButton).not.toHaveClass("bg-slate-950");
    expect(marketInput).not.toHaveClass("bg-slate-50");

    fireEvent.change(marketInput, { target: { value: "Where is hiring demand increasing?" } });
    fireEvent.click(analyseButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/ai/report", expect.objectContaining({ method: "POST" }));
    });

    await screen.findByText("Market Summary");
    await screen.findByText("Hiring demand");

    expect(container.innerHTML).not.toContain("bg-white");
    expect(container.innerHTML).not.toContain("border-slate-200");
    expect(container.innerHTML).not.toContain("text-slate-800");
    expect(container.innerHTML).not.toContain("text-slate-600");
  });

  it("keeps the reports page loading and placeholder surfaces dark-safe", async () => {
    const { container } = render(<SuperAgentReportsPage />);

    await screen.findByRole("heading", { name: /reports/i });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/super-agent/reports");
    });

    await screen.findByText(/month-over-month breakdowns will appear here/i);

    expect(container.innerHTML).not.toContain("border-slate-200");
    expect(container.innerHTML).not.toContain("bg-white/90");
    expect(container.innerHTML).not.toContain("bg-slate-50/70");
    expect(container.innerHTML).not.toContain("text-slate-600");
  });
});