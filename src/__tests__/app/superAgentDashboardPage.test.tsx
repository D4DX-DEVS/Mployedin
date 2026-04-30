/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import SuperAgentDashboard from "@/app/[locale]/(dashboard)/super-agent/page";

const authMock = jest.fn();
const redirectMock = jest.fn();

jest.mock("@/lib/auth/config", () => ({
  auth: () => authMock(),
}));

jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

function makeMockModel(overrides = {}) {
  return {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "sa-1", name: "SA", agentIds: [], assignedCityIds: [], assignedStateIds: [], commissions: [], overrideRate: 0, currencyCode: "AED" }) }), lean: jest.fn().mockResolvedValue({ _id: "sa-1", name: "SA", agentIds: [], region: {} }) }), find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Lead", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));

jest.mock("@/lib/currency", () => ({
  formatCurrency: (amount: number) => `AED ${amount}`,
}));

describe("SuperAgentDashboard", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    authMock.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });
  });

  it("renders workspace heading for the super-agent dashboard", async () => {
    render(await SuperAgentDashboard({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByText(/super agent workspace/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /super agent dashboard/i })).toBeInTheDocument();
  });
});