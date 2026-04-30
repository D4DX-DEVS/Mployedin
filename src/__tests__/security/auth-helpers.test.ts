/**
 * @jest-environment node
 */
import { NextResponse } from "next/server";
import { hasRegionAssigned } from "@/lib/auth/agentRestrictions";

// Mock next-auth/config to avoid importing Credentials provider
jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "test", role: "admin" } }),
}));

import { requireRole } from "@/lib/auth/withAuth";
import type mongoose from "mongoose";

// ── hasRegionAssigned (pure function — no DB) ────────────────────────────────

describe("hasRegionAssigned", () => {
  test("returns false for null region", () => {
    expect(hasRegionAssigned(null)).toBe(false);
  });

  test("returns false when both arrays are empty", () => {
    expect(
      hasRegionAssigned({
        assignedCityIds: [],
        assignedStateIds: [],
      })
    ).toBe(false);
  });

  test("returns true when cityIds is non-empty", () => {
    expect(
      hasRegionAssigned({
        assignedCityIds: ["aaa" as unknown as mongoose.Types.ObjectId],
        assignedStateIds: [],
      })
    ).toBe(true);
  });

  test("returns true when stateIds is non-empty", () => {
    expect(
      hasRegionAssigned({
        assignedCityIds: [],
        assignedStateIds: ["bbb" as unknown as mongoose.Types.ObjectId],
      })
    ).toBe(true);
  });

  test("returns true when both arrays have entries", () => {
    expect(
      hasRegionAssigned({
        assignedCityIds: ["aaa" as unknown as mongoose.Types.ObjectId],
        assignedStateIds: ["bbb" as unknown as mongoose.Types.ObjectId],
      })
    ).toBe(true);
  });
});

// ── requireRole ──────────────────────────────────────────────────────────────

describe("requireRole", () => {
  test("throws 401 when session is null", async () => {
    try {
      await requireRole(["admin"], null);
      fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NextResponse);
      const resp = err as NextResponse;
      expect(resp.status).toBe(401);
    }
  });

  test("throws 401 when session.user is undefined", async () => {
    try {
      await requireRole(["admin"], { user: undefined });
      fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NextResponse);
      const resp = err as NextResponse;
      expect(resp.status).toBe(401);
    }
  });

  test("throws 403 when role is not in allowed list", async () => {
    const session = {
      user: { id: "abc", role: "job_seeker", locale: "en" },
    };
    try {
      await requireRole(["admin", "agent"], session);
      fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NextResponse);
      const resp = err as NextResponse;
      expect(resp.status).toBe(403);
    }
  });

  test("returns AuthContext when role matches", async () => {
    const session = {
      user: {
        id: "user123",
        role: "admin",
        locale: "ar",
        permissionMode: "custom",
        customPermissions: { jobs: ["read", "write"] },
      },
    };
    const ctx = await requireRole(["admin"], session);
    expect(ctx.userId).toBe("user123");
    expect(ctx.role).toBe("admin");
    expect(ctx.locale).toBe("ar");
    expect(ctx.permissionMode).toBe("custom");
  });

  test("defaults locale to 'en' and permissionMode to 'role_default'", async () => {
    const session = {
      user: { id: "u1", role: "agent" },
    };
    const ctx = await requireRole(["agent"], session);
    expect(ctx.locale).toBe("en");
    expect(ctx.permissionMode).toBe("role_default");
  });

  test("accepts any role in the allowed list", async () => {
    const roles = ["admin", "agent", "employer"] as const;
    for (const role of roles) {
      const session = { user: { id: "x", role, locale: "en" } };
      const ctx = await requireRole([...roles], session);
      expect(ctx.role).toBe(role);
    }
  });

  test("returns empty string userId when id is missing", async () => {
    const session = { user: { role: "admin", locale: "en" } };
    const ctx = await requireRole(["admin"], session);
    expect(ctx.userId).toBe("");
  });

  test("includes companyUserRole and companyId when present", async () => {
    const session = {
      user: {
        id: "emp1",
        role: "employer",
        locale: "en",
        companyUserRole: "manager",
        companyId: "comp1",
      },
    };
    const ctx = await requireRole(["employer"], session);
    expect(ctx.companyUserRole).toBe("manager");
    expect(ctx.companyId).toBe("comp1");
  });
});
