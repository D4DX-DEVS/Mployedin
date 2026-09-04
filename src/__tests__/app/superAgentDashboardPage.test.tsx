/**
 * @jest-environment jsdom
 */
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

jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "sa-1", name: "SA", agentIds: [], assignedCityIds: [], assignedStateIds: [], commissions: [], overrideRate: 0, currencyCode: "AED" }) }), lean: jest.fn().mockResolvedValue({ _id: "sa-1", name: "SA", agentIds: [], region: {} }) }), find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/Lead", () => ({ __esModule: true, default: { distinct: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) } }));

jest.mock("@/models/Commission", () => ({ __esModule: true, default: { countDocuments: jest.fn().mockResolvedValue(0), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), aggregate: jest.fn().mockResolvedValue([]) } }));
jest.mock("@/models/ExhibitionRequest", () => ({ __esModule: true, default: { countDocuments: jest.fn().mockResolvedValue(0), find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }), aggregate: jest.fn().mockResolvedValue([]) } }));

jest.mock("@/lib/currency", () => ({
  formatCurrency: (amount: number) => `AED ${amount}`,
}));

// The page resolves its data scope through getSuperAgentScope (team ∪ region),
// the same helper every super-agent API uses. The real module pulls in
// next/server, which needs a `Request` global that jsdom does not provide.
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn().mockResolvedValue({
    saProfileId: "sa-1",
    teamAgentIds: [],
    regionAgentIds: [],
    effectiveAgentIds: [],
    assignedCityIds: [],
    assignedStateIds: [],
  }),
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

    // The "Super agent workspace" eyebrow was dropped — it restated the
    // heading directly below it.
    expect(screen.getByRole("heading", { name: /super agent dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recommended next/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /region at a glance/i })).toBeInTheDocument();
  });

  it("says nothing is waiting when no queue has work in it", async () => {
    render(await SuperAgentDashboard({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByRole("heading", { name: /needs your attention/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing is waiting on you right now/i)).toBeInTheDocument();
  });

  it("leads with the pending exhibition queue and links to it pre-filtered", async () => {
    // The one approval only a super-agent can perform. It produced no
    // notification and no dashboard signal, so it was invisible until someone
    // remembered to open it.
    const ExhibitionRequest = (await import("@/models/ExhibitionRequest")).default;
    (ExhibitionRequest.countDocuments as jest.Mock).mockResolvedValueOnce(3);

    render(await SuperAgentDashboard({ params: Promise.resolve({ locale: "en" }) }));

    // Asserted through the action label and the href rather than the counted
    // sentence: `getTranslations` is stubbed in this environment and returns
    // the raw ICU string instead of formatting the plural.
    const row = screen.getByRole("link", { name: /review requests/i });
    expect(row).toHaveAttribute("href", "/en/super-agent/exhibitions?status=submitted");
    // The quiet-day suggestion card steps aside once there is real work.
    expect(screen.queryByRole("heading", { name: /recommended next/i })).not.toBeInTheDocument();
  });
});
