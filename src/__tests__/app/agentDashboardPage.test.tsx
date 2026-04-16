/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import AgentDashboard from "@/app/[locale]/(dashboard)/agent/page";

const authMock = jest.fn();
const redirectMock = jest.fn();
const connectDBMock = jest.fn();
const agentFindOneMock = jest.fn();
const jobFindMock = jest.fn();
const applicationAggregateMock = jest.fn();

jest.mock("@/lib/auth/config", () => ({
  auth: () => authMock(),
}));

jest.mock("next/navigation", () => ({
  redirect: (href: string) => redirectMock(href),
}));

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: () => connectDBMock(),
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => agentFindOneMock(...args),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => jobFindMock(...args),
  },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    aggregate: (...args: unknown[]) => applicationAggregateMock(...args),
  },
}));

describe("AgentDashboard", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    connectDBMock.mockReset();
    agentFindOneMock.mockReset();
    jobFindMock.mockReset();
    applicationAggregateMock.mockReset();

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    connectDBMock.mockResolvedValue(undefined);

    agentFindOneMock.mockReturnValue({
      select: () => ({
        lean: async () => ({
          _id: "agent-1",
          assignedEmployerIds: ["employer-1", "employer-2"],
          performance: {
            leadsGenerated: 6,
            employersCreated: 3,
            vacanciesPosted: 4,
            placementsCompleted: 1,
          },
        }),
      }),
    });

    jobFindMock.mockReturnValue({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => ([
              { _id: "job-1", title: "Senior Recruiter", status: "active" },
            ]),
          }),
        }),
      }),
    });

    applicationAggregateMock.mockResolvedValue([
      { _id: { jobId: "job-1", status: "interview_scheduled" }, count: 1 },
      { _id: { jobId: "job-1", status: "offer" }, count: 1 },
    ]);
  });

  it("uses theme-aware workspace surface classes instead of light-only dashboard styling", async () => {
    const view = render(
      await AgentDashboard({ params: Promise.resolve({ locale: "en" }) })
    );

    expect(connectDBMock).toHaveBeenCalledTimes(1);

    expect(screen.getByRole("heading", { name: "Agent Dashboard" }).closest("section")).toHaveClass("workspace-hero-surface");
    expect(screen.getByText("2 active accounts").closest("div")).toHaveClass("workspace-glass-panel");
    expect(screen.getByRole("heading", { name: /track which parts of the desk need attention/i }).closest("section")).toHaveClass("workspace-panel-surface");
    expect(screen.getByRole("heading", { name: /jump into the work most agents do every day/i }).closest("section")).toHaveClass("workspace-panel-surface");

    expect(view.container.innerHTML).not.toContain("bg-white/80");
    expect(view.container.innerHTML).not.toContain("bg-white/95");
    expect(view.container.innerHTML).not.toContain("text-slate-950");
    expect(view.container.innerHTML).not.toContain("bg-amber-50");
    expect(view.container.innerHTML).not.toContain("bg-sky-50");
    expect(view.container.innerHTML).not.toContain("bg-indigo-50");
    expect(view.container.innerHTML).not.toContain("bg-emerald-50");
    expect(view.container.innerHTML).not.toContain("bg-violet-50");
    expect(view.container.innerHTML).not.toContain("bg-rose-50");
  });
});