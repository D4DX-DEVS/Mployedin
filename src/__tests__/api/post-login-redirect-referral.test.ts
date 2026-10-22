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

function get(cookie?: string, query = "") {
  return new Request(`http://localhost:3888/api/auth/post-login-redirect${query}`, {
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

// The code now travels in mpl_signup_consent (written on the LinkedIn / Apple
// click) instead of an mpl_ref cookie written on arrival.
describe("GET /api/auth/post-login-redirect — referral in mpl_signup_consent", () => {
  const CODE = "MPL-1A2B3C4D5E6F7A8B";
  const seeker = { user: { id: "u1", role: "job_seeker", locale: "en", isOnboarded: false } };

  beforeEach(() => {
    jest.clearAllMocks();
    attach.mockResolvedValue({ attached: true, linkId: "l", referrerRole: "agent" });
  });

  it("claims the code carried by the consent cookie for a job seeker and clears the cookie", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get(`NEXT_LOCALE=en; mpl_signup_consent=terms.accepted~${CODE}`));
    expect(res.headers.get("location")).toContain("/en/onboarding");
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: CODE });
    expect(res.headers.get("set-cookie")).toMatch(/mpl_signup_consent=;.*Max-Age=0/i);
  });

  it("works when the visitor never answered the cookie banner", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get(`mpl_signup_consent=terms~${CODE}`));
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: CODE });
  });

  it("ignores a malformed code in the consent cookie but still clears the cookie", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get("mpl_signup_consent=terms.accepted~%3Cscript%3E"));
    expect(attach).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/en/onboarding");
    expect(res.headers.get("set-cookie")).toMatch(/mpl_signup_consent=;/i);
  });

  it("ignores a consent cookie that carries no code", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get("mpl_signup_consent=terms.accepted"));
    expect(attach).not.toHaveBeenCalled();
  });

  it("does not claim for any other role", async () => {
    auth.mockResolvedValue({ user: { id: "u2", role: "employer", locale: "en", isOnboarded: true } });
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get(`mpl_signup_consent=terms~${CODE}`));
    expect(attach).not.toHaveBeenCalled();
  });

  it("never lets an unknown or used-up code break the redirect", async () => {
    auth.mockResolvedValue(seeker);
    attach.mockResolvedValue({ attached: false, reason: "not_found" });
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get(`mpl_signup_consent=terms~${CODE}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/en/onboarding");
  });

  it("does not let a failing attach break the redirect either", async () => {
    auth.mockResolvedValue(seeker);
    attach.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get(`mpl_signup_consent=terms~${CODE}`));
    expect(res.headers.get("location")).toContain("/en/onboarding");
  });

  it("prefers the consent cookie over a legacy mpl_ref cookie and clears both", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get(`mpl_ref=MPL-FFFFFFFFFFFFFFFF; mpl_signup_consent=terms~${CODE}`));
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: CODE });
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/mpl_ref=;/i);
    expect(cleared).toMatch(/mpl_signup_consent=;/i);
  });

  it("still honours a legacy mpl_ref cookie left over from before the change", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get("mpl_ref=MPL-1A2B3C4D5E6F7A8B; mpl_signup_consent=terms.accepted"));
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: "MPL-1A2B3C4D5E6F7A8B" });
  });
});

// The login page (job page -> Sign in -> LinkedIn / Apple) puts the code in this
// route's own ?ref= as well. This route is a plain GET that the Lax session cookie
// lets any other website trigger by navigating a visitor to it, so ?ref= counts
// ONLY next to our own Terms tick in this browser (mpl_signup_consent, terms).
describe("GET /api/auth/post-login-redirect: referral in its own ?ref= query", () => {
  const CODE = "MPL-1A2B3C4D5E6F7A8B";
  const seeker = { user: { id: "u1", role: "job_seeker", locale: "en", isOnboarded: false } };
  /** The Terms tick of this browser, with no code in the cookie. */
  const TICKED = "mpl_signup_consent=terms.accepted";

  beforeEach(() => {
    jest.clearAllMocks();
    attach.mockResolvedValue({ attached: true, linkId: "l", referrerRole: "agent" });
  });

  it("does NOT claim the code from the query when there is no consent cookie (cross-site link)", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get(undefined, `?locale=en&ref=${CODE}&callbackUrl=%2Fen%2Fjobs%2Fabc`));
    expect(attach).not.toHaveBeenCalled();
    // The redirect itself is unchanged: callback kept, nothing echoed.
    expect(res.headers.get("location")).toContain("/en/jobs/abc");
    expect(res.headers.get("location")).not.toContain(CODE);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does NOT claim it next to unrelated cookies or a consent cookie without the Terms tick", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get("NEXT_LOCALE=en; authjs.session-token=x", `?ref=${CODE}`));
    await GET(get("mpl_signup_consent=accepted", `?ref=${CODE}`));
    await GET(get("mpl_signup_consent=", `?ref=${CODE}`));
    await GET(get("mpl_signup_consent=not-terms~MPL-FFFFFFFFFFFFFFFF", `?ref=${CODE}`));
    expect(attach).not.toHaveBeenCalled();
  });

  it("claims the code from the query when the consent cookie has the Terms tick but no code", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get(TICKED, `?locale=en&ref=${CODE}`));
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: CODE });
    expect(res.headers.get("location")).toContain("/en/onboarding");
    expect(res.headers.get("set-cookie")).toMatch(/mpl_signup_consent=;.*Max-Age=0/i);
  });

  it("claims it for a bare terms cookie too (visitor never answered the cookie banner)", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get("mpl_signup_consent=terms", `?ref=${CODE}`));
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: CODE });
  });

  it("reads the query code in any letter case", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get(TICKED, `?ref=${CODE.toLowerCase()}`));
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: CODE });
  });

  it("ignores a malformed code in the query", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get(TICKED, "?ref=%3Cscript%3E"));
    expect(attach).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/en/onboarding");
  });

  it("prefers the consent cookie's code, then the query (with the tick), then the legacy cookie", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");

    await GET(get(`mpl_ref=MPL-LEGACY000000000; mpl_signup_consent=terms~${CODE}`, "?ref=MPL-QUERY00000000000"));
    expect(attach).toHaveBeenLastCalledWith({ userId: "u1", code: CODE });

    await GET(get("mpl_ref=MPL-LEGACY000000000; mpl_signup_consent=terms.accepted", "?ref=MPL-QUERY00000000000"));
    expect(attach).toHaveBeenLastCalledWith({ userId: "u1", code: "MPL-QUERY00000000000" });

    await GET(get("mpl_ref=MPL-LEGACY000000000", "?ref=%3Cscript%3E"));
    expect(attach).toHaveBeenLastCalledWith({ userId: "u1", code: "MPL-LEGACY000000000" });
  });

  it("without the tick, the query never displaces the legacy cookie (it is ignored, not preferred)", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    await GET(get("mpl_ref=MPL-LEGACY000000000", `?ref=${CODE}`));
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: "MPL-LEGACY000000000" });
  });

  it("does not claim for any other role, and never lets an unknown code break the redirect", async () => {
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    auth.mockResolvedValue({ user: { id: "u2", role: "agent", locale: "en", isOnboarded: true } });
    await GET(get(TICKED, `?ref=${CODE}`));
    expect(attach).not.toHaveBeenCalled();

    auth.mockResolvedValue(seeker);
    attach.mockResolvedValue({ attached: false, reason: "not_found" });
    const res = await GET(get(TICKED, `?ref=${CODE}`));
    expect(res.headers.get("location")).toContain("/en/onboarding");
  });

  it("keeps the callback and the locale working alongside the code", async () => {
    auth.mockResolvedValue(seeker);
    const { GET } = await import("@/app/api/auth/post-login-redirect/route");
    const res = await GET(get(TICKED, `?callbackUrl=%2Fen%2Fjobs%2Fabc&locale=en&ref=${CODE}`));
    expect(res.headers.get("location")).toContain("/en/jobs/abc");
    expect(attach).toHaveBeenCalledWith({ userId: "u1", code: CODE });
  });
});

// Keeps this file a module: without it tsc puts `attach` in the global scope.
export {};
