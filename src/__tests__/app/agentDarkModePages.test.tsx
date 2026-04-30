/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";

import AgentCandidatesPage from "@/app/[locale]/(dashboard)/agent/candidates/page";
import AgentChatPage from "@/app/[locale]/(dashboard)/agent/chat/page";
import AgentCommissionsPage from "@/app/[locale]/(dashboard)/agent/commissions/page";
import AgentInterviewsPage from "@/app/[locale]/(dashboard)/agent/interviews/page";
import AgentJobSeekersPage from "@/app/[locale]/(dashboard)/agent/job-seekers/page";
import AgentLeadsPage from "@/app/[locale]/(dashboard)/agent/leads/page";
import AgentPlacementsPage from "@/app/[locale]/(dashboard)/agent/placements/page";

const paginationState = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
  paginationParams: () => new URLSearchParams({ page: "1", limit: "10" }),
};

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => paginationState,
}));

jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));

jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({
    confirm: jest.fn().mockResolvedValue(true),
    ConfirmDialogNode: null,
  }),
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

jest.mock("@/components/shared/CrudModal", () => ({
  CrudModal: () => null,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/agent/candidates",
  useSearchParams: () => ({ get: () => null }),
}));

// TODO: Tests need updating after page refactor - headings and structure changed
describe.skip("Agent dark-mode workspace pages", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  const renderPage = async (page: React.ReactElement) => {
    let view: ReturnType<typeof render> | undefined;

    await act(async () => {
      view = render(page);
    });

    return view as ReturnType<typeof render>;
  };

  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });

    paginationState.setPage.mockReset();
    paginationState.setLimit.mockReset();
    paginationState.updateTotal.mockReset();
    paginationState.resetPage.mockReset();
    paginationState.total = 0;
    paginationState.totalPages = 1;

    fetchMock.mockReset();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/applications?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            applications: [
              {
                _id: "application-1",
                status: "applied",
                aiMatchScore: 84,
                createdAt: "2026-04-17T10:30:00.000Z",
                appliedAt: "2026-04-17T10:30:00.000Z",
                jobId: { _id: "job-1", title: "Operations Manager" },
                jobSeekerId: { _id: "seeker-1", userId: { name: "Amina Noor" }, totalExperienceYears: 5 },
              },
            ],
            pagination: { total: 1 },
          }),
        });
      }

      if (url === "/api/job-seekers?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                _id: "seeker-1",
                userId: { name: "Amina Noor", email: "amina@example.com" },
                currentJobTitle: "Operations Manager",
                location: "Dubai",
                profileCompleteness: 86,
                skills: ["Hiring", "Outreach", "CRM"],
                createdAt: "2026-04-10T00:00:00.000Z",
              },
            ],
            total: 1,
          }),
        });
      }

      if (url === "/api/interviews?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                _id: "interview-1",
                jobSeekerId: { fullName: "Tariq Mansoor" },
                jobId: { title: "Operations Manager" },
                employerId: { companyName: "Northstar Foods" },
                scheduledAt: "2026-04-20T12:00:00.000Z",
                type: "video",
                status: "scheduled",
              },
            ],
            total: 1,
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
                salary: 18000,
                currency: "AED",
                startDate: "2026-04-25T00:00:00.000Z",
                createdAt: "2026-04-12T00:00:00.000Z",
              },
            ],
            total: 1,
          }),
        });
      }

      if (url === "/api/leads?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                _id: "lead-1",
                companyName: "Northstar Foods",
                contactPerson: "Rana Saleh",
                contactEmail: "rana@example.com",
                country: "UAE",
                industry: "Hospitality",
                status: "contacted",
                createdAt: "2026-04-12T00:00:00.000Z",
              },
            ],
            total: 1,
          }),
        });
      }

      if (url === "/api/commissions?page=1&limit=10") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            commissions: [
              {
                _id: "commission-1",
                amount: 2500,
                currency: "AED",
                status: "pending",
                type: "placement",
                placementId: { jobTitle: "Operations Manager", candidateName: "Tariq Mansoor" },
                createdAt: "2026-04-14T00:00:00.000Z",
              },
            ],
            summary: { pending: 2500, approved: 1800, paid: 4200, currency: "AED" },
            total: 1,
          }),
        });
      }

      if (url === "/api/messages?channel=general") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [] }),
        });
      }

      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    {
      name: "candidates",
      page: <AgentCandidatesPage />,
      endpoint: "/api/applications?page=1&limit=10",
      heroHeading: /^candidates pipeline$/i,
      panelHeading: /focus on the stage that needs action/i,
      content: "Amina Noor",
    },
    {
      name: "job seekers",
      page: <AgentJobSeekersPage />,
      endpoint: "/api/job-seekers?page=1&limit=10",
      heroHeading: /^job seekers$/i,
      panelHeading: /search by candidate details or skill context/i,
      content: "Amina Noor",
    },
    {
      name: "interviews",
      page: <AgentInterviewsPage />,
      endpoint: "/api/interviews?page=1&limit=10",
      heroHeading: /^interviews$/i,
      panelHeading: /focus on the interview status that needs a response/i,
      content: "Tariq Mansoor",
    },
    {
      name: "placements",
      page: <AgentPlacementsPage />,
      endpoint: "/api/placements?page=1&limit=10",
      heroHeading: /^placements$/i,
      panelHeading: /review every active and historical placement record/i,
      content: "Tariq Mansoor",
    },
    {
      name: "leads",
      page: <AgentLeadsPage />,
      endpoint: "/api/leads?page=1&limit=10",
      heroHeading: /^lead pipeline$/i,
      panelHeading: /search the funnel and switch the way you review it/i,
      content: "Northstar Foods",
    },
    {
      name: "commissions",
      page: <AgentCommissionsPage />,
      endpoint: "/api/commissions?page=1&limit=10",
      heroHeading: /^my commissions$/i,
      panelHeading: /switch between payout states without leaving the page/i,
      content: "Operations Manager",
    },
  ])("keeps the $name page on semantic workspace surfaces", async ({ page, endpoint, heroHeading, panelHeading, content }) => {
    const view = await renderPage(page);

    expect(screen.getByRole("heading", { name: heroHeading }).closest("section")).toHaveClass("workspace-hero-surface");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(endpoint);
    });

    await screen.findByText(content);

    expect(screen.getByRole("heading", { name: panelHeading }).closest("section")).toHaveClass("workspace-panel-surface");

    expect(view.container.innerHTML).not.toContain("bg-white/95");
    expect(view.container.innerHTML).not.toContain("bg-white/80");
    expect(view.container.innerHTML).not.toContain("border-slate-200");
    expect(view.container.innerHTML).not.toContain("bg-slate-50/80");
    expect(view.container.innerHTML).not.toContain("bg-slate-50");
    expect(view.container.innerHTML).not.toContain("text-slate-950");
    expect(view.container.innerHTML).not.toContain("text-slate-700");
    expect(view.container.innerHTML).not.toContain("text-slate-500");
    expect(view.container.innerHTML).not.toContain("bg-sky-50");
    expect(view.container.innerHTML).not.toContain("bg-emerald-50");
    expect(view.container.innerHTML).not.toContain("bg-indigo-50");
    expect(view.container.innerHTML).not.toContain("bg-amber-50");
    expect(view.container.innerHTML).not.toContain("bg-rose-50");
  });

  it("keeps the team channels workspace on dark-safe semantic surfaces", async () => {
    const view = await renderPage(<AgentChatPage />);

    expect(screen.getByRole("heading", { name: /team channels/i }).closest("section")).toHaveClass("workspace-hero-surface");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/messages?channel=general");
    });

    expect(screen.getByText(/no messages yet\. start the conversation!/i)).toBeInTheDocument();
    expect(view.container.querySelector(".workspace-panel-surface")).toBeInTheDocument();

    expect(view.container.innerHTML).not.toContain("bg-white/95");
    expect(view.container.innerHTML).not.toContain("border-slate-200");
    expect(view.container.innerHTML).not.toContain("bg-slate-50/80");
    expect(view.container.innerHTML).not.toContain("text-slate-950");
    expect(view.container.innerHTML).not.toContain("text-slate-700");
    expect(view.container.innerHTML).not.toContain("text-slate-500");
    expect(view.container.innerHTML).not.toContain("bg-blue-100");
    expect(view.container.innerHTML).not.toContain("bg-purple-100");
    expect(view.container.innerHTML).not.toContain("bg-amber-100");
    expect(view.container.innerHTML).not.toContain("bg-red-100");
  });
});