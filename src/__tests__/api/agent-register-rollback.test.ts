/**
 * @jest-environment node
 *
 * Agent self-registration writes User then Agent. When the Agent insert failed
 * the User stayed behind with role "agent" and no profile; once an admin
 * activated it, every agent-scoped query had nothing to scope by. The User must
 * be rolled back so the person can simply register again.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { auth: {} },
}));
jest.mock("@/lib/validators", () => ({ validateBody: jest.fn(async (req: NextRequest) => req.json()) }));
jest.mock("@/lib/validators/misc", () => ({ agentRegisterSchema: {} }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: { verifyEmailOtp: jest.fn(() => ({ subject: "s", html: "h" })) },
}));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: jest.fn().mockResolvedValue("hash") } }));

const userCreate = jest.fn();
const userDelete = jest.fn().mockResolvedValue(null);
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
    create: (...a: unknown[]) => userCreate(...a),
    findByIdAndDelete: (...a: unknown[]) => userDelete(...a),
  },
}));
const agentCreate = jest.fn();
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { create: (...a: unknown[]) => agentCreate(...a) },
}));

import { POST } from "@/app/api/auth/agent-register/route";

const body = {
  fullName: "Test Agent",
  email: "agent-rollback@example.com",
  password: "Str0ng!Passw0rd",
  country: "AE",
  city: "Dubai",
};
const request = () =>
  new NextRequest("http://localhost/api/auth/agent-register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  jest.clearAllMocks();
  userCreate.mockResolvedValue({ _id: "u1" });
});

it("deletes the new User when the Agent profile can't be created", async () => {
  agentCreate.mockRejectedValue(new Error("write conflict"));
  const res = await POST(request());
  expect(res.status).toBe(500);
  expect(userDelete).toHaveBeenCalledWith("u1");
});

it("keeps the User when both inserts succeed", async () => {
  agentCreate.mockResolvedValue({ _id: "a1" });
  const res = await POST(request());
  expect(res.status).toBe(200);
  expect(userDelete).not.toHaveBeenCalled();
});
