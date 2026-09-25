import {
  ADMIN_DASHBOARD_CACHE_PREFIX,
  ADMIN_DASHBOARD_SECTION_TTL,
  cachedDashboardSection,
  dashboardSectionKey,
} from "@/lib/admin/dashboard/cache";
import { invalidateAdminDashboardCache } from "@/app/[locale]/(dashboard)/admin/_components/dashboard-actions";

const smartCacheMock = jest.fn();
const invalidatePrefixMock = jest.fn();
const authMock = jest.fn();

jest.mock("@/lib/cache/smartCache", () => ({
  smartCache: (...args: unknown[]) => smartCacheMock(...args),
  invalidateCacheByPrefix: (...args: unknown[]) => invalidatePrefixMock(...args),
}));
jest.mock("@/lib/auth/config", () => ({ auth: () => authMock() }));

describe("dashboardSectionKey", () => {
  it("namespaces keys and keeps permission-varying inputs in them", () => {
    expect(dashboardSectionKey("people", "30d:employers-1:agents-0")).toBe("admin-dash:people:30d:employers-1:agents-0");
    expect(dashboardSectionKey("snapshot", "7d")).toBe("admin-dash:snapshot:7d");
  });

  it("uses a 60s TTL for dashboard aggregates", () => {
    expect(ADMIN_DASHBOARD_SECTION_TTL).toBe(60);
  });
});

describe("cachedDashboardSection", () => {
  it("bypasses the shared map under jest so dashboard tests stay hermetic", async () => {
    const fetcher = jest.fn().mockResolvedValue({ total: 3 });
    await expect(cachedDashboardSection("snapshot", "30d", fetcher)).resolves.toEqual({ total: 3 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(smartCacheMock).not.toHaveBeenCalled();
  });
});

describe("invalidateAdminDashboardCache", () => {
  it("drops the dashboard prefix for a signed-in admin", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1" } });
    await invalidateAdminDashboardCache();
    expect(invalidatePrefixMock).toHaveBeenCalledWith(ADMIN_DASHBOARD_CACHE_PREFIX);
  });

  it("does nothing without a session", async () => {
    authMock.mockResolvedValue(null);
    invalidatePrefixMock.mockClear();
    await invalidateAdminDashboardCache();
    expect(invalidatePrefixMock).not.toHaveBeenCalled();
  });
});
