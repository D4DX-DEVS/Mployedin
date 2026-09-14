/**
 * @jest-environment node
 */
const auth = jest.fn();
jest.mock("@/lib/auth/config", () => ({ auth: (...a: unknown[]) => auth(...a) }));
jest.mock("@/lib/permissions/matrix", () => ({
  getDashboardPath: (role: string, locale: string) => `/${locale}/${role}`,
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn() } }));

const attach = jest.fn().mockResolvedValue({ attached: true, linkId: "l", referrerRole: "agent" });
jest.mock("@/lib/referrals/attachJobSeeker", () => ({ attachJobSeekerReferral: (...a: unknown[]) => attach(...a) }));

function get(cookie?: string) {
  return new Request("http://localhost:3888/api/auth/post-login-redirect", {
    headers: cookie ? { cookie } : {},
  });
}

describe("GET /api/auth/post-login-redirect — referral cookie", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attach.mockResolvedValue({ attached: true, linkId: "l", referrerRole: "agent" });
  });

  it("claims the cookie for a job seeker and clears it", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: "job_seeker", locale: "en", isOnboarded: false } });
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get("other=1; mpl_ref=MPL-1A2B3C4D5E6F7A8B; NEXT_LOCALE=en"));
    expect(res.headers.get("location")).toContain("/en/onboarding");
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: "MPL-1A2B3C4D5E6F7A8B" });
    expect(res.headers.get("set-cookie")).toMatch(/mpl_ref=;.*Max-Age=0/i);
  });

  it("ignores the cookie for any other role but still clears it", async () => {
    auth.mockResolvedValue({ user: { id: "u2", role: "employer", locale: "en", isOnboarded: true } });
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get("mpl_ref=MPL-1A2B3C4D5E6F7A8B"));
    expect(attach).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toMatch(/mpl_ref=;/i);
  });

  it("ignores a malformed cookie value", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: "job_seeker", locale: "en", isOnboarded: false } });
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get("mpl_ref=%3Cscript%3E"));
    expect(attach).not.toHaveBeenCalled();
  });

  it("does nothing without a cookie", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: "job_seeker", locale: "en", isOnboarded: false } });
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get());
    expect(attach).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

// Keeps this file a module: without it tsc puts `attach` in the global scope.
export {};
