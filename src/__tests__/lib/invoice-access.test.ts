/**
 * @jest-environment node
 */

const agentFindOneLean = jest.fn();
const getSuperAgentScope = jest.fn();

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: agentFindOneLean })) })),
  },
}));

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: (...args: unknown[]) => getSuperAgentScope(...args),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
  },
}));

describe("canAccessInvoice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows admins to access any invoice", async () => {
    const { canAccessInvoice } = await import("@/lib/invoices/access");

    await expect(canAccessInvoice(
      { userId: "admin_001", role: "admin" },
      { userId: "user_001", agentId: "agent_001" },
    )).resolves.toBe(true);
  });

  it("allows invoice owners to access their invoice", async () => {
    const { canAccessInvoice } = await import("@/lib/invoices/access");

    await expect(canAccessInvoice(
      { userId: "user_001", role: "employer" },
      { userId: "user_001" },
    )).resolves.toBe(true);
  });

  it("allows agents only when invoice agentId matches their profile", async () => {
    agentFindOneLean.mockResolvedValue({ _id: "agent_001" });
    const { canAccessInvoice } = await import("@/lib/invoices/access");

    await expect(canAccessInvoice(
      { userId: "agent_user_001", role: "agent" },
      { userId: "employer_user_001", agentId: "agent_001" },
    )).resolves.toBe(true);

    await expect(canAccessInvoice(
      { userId: "agent_user_001", role: "agent" },
      { userId: "employer_user_001", agentId: "agent_999" },
    )).resolves.toBe(false);
  });

  it("allows super agents only for invoices in their effective agent scope", async () => {
    getSuperAgentScope.mockResolvedValue({ effectiveAgentIds: ["agent_001", "agent_002"] });
    const { canAccessInvoice } = await import("@/lib/invoices/access");

    await expect(canAccessInvoice(
      { userId: "sa_user_001", role: "super_agent" },
      { userId: "employer_user_001", agentId: "agent_002" },
    )).resolves.toBe(true);

    await expect(canAccessInvoice(
      { userId: "sa_user_001", role: "super_agent" },
      { userId: "employer_user_001", agentId: "agent_999" },
    )).resolves.toBe(false);
  });

  it("denies access when invoice ownership fields are missing", async () => {
    const { canAccessInvoice } = await import("@/lib/invoices/access");

    await expect(canAccessInvoice(
      { userId: "user_001", role: "employer" },
      { userId: null, agentId: undefined },
    )).resolves.toBe(false);
  });

  it("denies super-agent access when scope cannot be resolved", async () => {
    getSuperAgentScope.mockResolvedValue(null);
    const { canAccessInvoice } = await import("@/lib/invoices/access");

    await expect(canAccessInvoice(
      { userId: "sa_user_001", role: "super_agent" },
      { userId: "employer_user_001", agentId: "agent_001" },
    )).resolves.toBe(false);
  });

  it("fails closed when access lookups throw", async () => {
    agentFindOneLean.mockRejectedValue(new Error("DB unavailable"));
    const { canAccessInvoice } = await import("@/lib/invoices/access");

    await expect(canAccessInvoice(
      { userId: "agent_user_001", role: "agent" },
      { userId: "employer_user_001", agentId: "agent_001" },
    )).resolves.toBe(false);
  });
});