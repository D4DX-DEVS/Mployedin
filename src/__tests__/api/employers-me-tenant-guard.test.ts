/**
 * @jest-environment node
 */
/**
 * withAuth checks the ACTOR's own permission in tenant view only when the route
 * declares a guard. PATCH /api/employers/me declared none, so a super agent who
 * entered an employer's account could rewrite its company profile (registration
 * number, tax id, contact email) although the matrix gives super agents no
 * employers:update — the same write PATCH /api/employers/[id] refuses them.
 */
import { canAccess } from "@/lib/permissions/matrix";

const guards: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: { name?: string }, guard?: unknown) => {
    guards[handler.name ?? "?"] = guard;
    return handler;
  },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: {}, Employer: {} }));

describe("PATCH /api/employers/me — tenant view", () => {
  beforeAll(() => {
    jest.isolateModules(() => { require("@/app/api/employers/me/route"); });
  });

  it("declares employers:update, so tenant view checks the actor too", () => {
    expect(guards.patchHandler).toEqual({ resource: "employers", action: "update" });
  });

  it("the employer and the staff who may edit employers pass; a super agent does not", () => {
    for (const role of ["employer", "agent", "admin"] as const) {
      expect(canAccess(role, "employers", "update")).toBe(true);
    }
    expect(canAccess("super_agent", "employers", "update")).toBe(false);
  });
});
