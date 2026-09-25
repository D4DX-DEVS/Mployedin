/**
 * @jest-environment node
 *
 * GET /api/user/password-status drives the optional "you're on a temporary
 * password" notice (audit 2026-09-24, ONB-16). It must answer for the real
 * person, never the owner a colleague's ctx.userId points at, and never show an
 * employer's notice to staff in tenant view.
 */
import { NextRequest } from "next/server";

let currentCtx: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (h: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => h(req, currentCtx),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const flagged = new Set<string>();
const findById = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: (id: string) => {
      findById(id);
      return { select: () => ({ lean: () => Promise.resolve(flagged.has(id) ? { tempPasswordIssuedAt: new Date() } : {}) }) };
    },
  },
}));

import { GET } from "@/app/api/user/password-status/route";

async function status(ctx: Record<string, unknown>) {
  currentCtx = { role: "employer", locale: "en", ...ctx };
  const res = await GET(new NextRequest("http://localhost/api/user/password-status"), {} as never);
  return (await res.json()).temporaryPassword as boolean;
}

beforeEach(() => {
  flagged.clear();
  findById.mockClear();
});

it("is true for an account still on an issued password", async () => {
  flagged.add("owner");
  expect(await status({ userId: "owner" })).toBe(true);
});

it("is false once they have set their own", async () => {
  expect(await status({ userId: "owner" })).toBe(false);
});

it("reads the colleague's own account, not the owner's", async () => {
  flagged.add("owner");
  expect(await status({ userId: "owner", member: { actorId: "colleague", companyId: "c" } })).toBe(false);
  expect(findById).toHaveBeenCalledWith("colleague");
});

it("never shows an employer's notice to staff in tenant view", async () => {
  flagged.add("owner");
  expect(await status({ userId: "owner", tenantView: { actorId: "admin", actorRole: "admin", employerId: "e" } })).toBe(false);
  expect(findById).not.toHaveBeenCalled();
});
